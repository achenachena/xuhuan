package postgres

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/achenachena/xuhuan/apps/api/internal/api"
	"github.com/achenachena/xuhuan/apps/api/internal/auth"
	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
	"github.com/achenachena/xuhuan/apps/api/internal/game"
	gameRun "github.com/achenachena/xuhuan/apps/api/internal/run"
	"github.com/achenachena/xuhuan/apps/api/migrations"
)

// This is an isolated HTTP/PostgreSQL experiment, not a public demo endpoint.
// A test-only Telegram signature exercises the normal identity boundary.
func TestEngineeringRetryEvidence(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	db := openIsolatedIntegrationDatabase(ctx, t, databaseURL)
	if err := db.Migrate(ctx, migrations.Files); err != nil {
		t.Fatal(err)
	}
	const botToken = "engineering-fixture-not-a-production-token"
	verifier, err := auth.NewTelegramVerifier(botToken, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	values := url.Values{"auth_date": {fmt.Sprint(time.Now().Unix())}, "user": {`{"id":987654321,"first_name":"Engineering fixture","language_code":"en"}`}}
	key := hmac.New(sha256.New, []byte("WebAppData"))
	_, _ = key.Write([]byte(botToken))
	signature := hmac.New(sha256.New, key.Sum(nil))
	_, _ = signature.Write([]byte("auth_date=" + values.Get("auth_date") + "\nuser=" + values.Get("user")))
	values.Set("hash", hex.EncodeToString(signature.Sum(nil)))
	router := api.NewRouter(api.Dependencies{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), Version: "engineering-fixture",
		MaxBodyBytes: 1 << 20, Readiness: db, Authenticator: auth.NewAuthenticator(verifier, false),
		Game: game.NewService(NewPlayerRepository(db), NewProgressionRepository(db), NewRunRepository(db), gamecontent.MustLoadV4()),
	})
	var dropNext atomic.Bool
	lostResponse := make(chan []byte, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/commands") && dropNext.CompareAndSwap(true, false) {
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, r) // The actual transaction finishes before we lose the response.
			lostBody := append([]byte(nil), recorder.Body.Bytes()...)
			lostResponse <- lostBody
			if recorder.Code != http.StatusOK {
				t.Errorf("commit status=%d body=%s", recorder.Code, lostBody)
			}
			connection, _, err := w.(http.Hijacker).Hijack()
			if err != nil {
				t.Error(err)
				return
			}
			_ = connection.Close()
			return
		}
		router.ServeHTTP(w, r)
	}))
	defer server.Close()
	client := &http.Client{Timeout: 10 * time.Second}
	send := func(method, path, key, body string) (*http.Response, []byte, error) {
		req, err := http.NewRequestWithContext(ctx, method, server.URL+path, strings.NewReader(body))
		if err != nil {
			return nil, nil, err
		}
		req.Header.Set(auth.TelegramHeader, values.Encode())
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Idempotency-Key", key)
		// Disable Go's automatic retry of requests carrying an idempotency header.
		req.GetBody = nil
		response, err := client.Do(req)
		if err != nil {
			return nil, nil, err
		}
		defer response.Body.Close()
		data, err := io.ReadAll(response.Body)
		return response, data, err
	}
	response, body, err := send("POST", "/v2/runs", "evidence-start-01", `{"mode":"campaign","chapter_slug":"seventh-dock","character_slug":"nana7mi"}`)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != 201 {
		t.Fatalf("start: %d %s", response.StatusCode, body)
	}
	var run gameRun.GameRun
	if err := json.Unmarshal(body, &run); err != nil {
		t.Fatal(err)
	}
	path := "/v2/runs/" + run.ID + "/commands"
	command := `{"type":"complete_segment","expected_version":1,"segment_outcome":{"won":true,"health":3,"score":120}}`
	inspect := func(wantVersion, wantCommands, wantScore int) {
		var version, count, score int
		err := db.pool.QueryRow(ctx, `SELECT version,(SELECT count(*) FROM run_commands WHERE run_id=$1::uuid),(state->>'score')::int FROM runs WHERE id=$1::uuid`, run.ID).Scan(&version, &count, &score)
		if err != nil {
			t.Fatal(err)
		}
		t.Logf("SQL observation: version=%d command_rows=%d score=%d", version, count, score)
		if version != wantVersion || count != wantCommands || score != wantScore {
			t.Fatalf("unexpected persisted state")
		}
	}
	t.Log("POST /v2/runs -> 201; isolated synthetic player, version=1")
	dropNext.Store(true)
	_, _, err = send("POST", path, "evidence-command-01", command)
	if err == nil {
		t.Fatal("expected an actual lost HTTP response")
	}
	t.Log("POST complete_segment expected_version=1 key=evidence-command-01 -> connection closed after commit")
	inspect(2, 1, 120)
	lostBody := <-lostResponse
	response, body, err = send("POST", path, "evidence-command-01", command)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != 200 || response.Header.Get("Idempotency-Replayed") != "true" || string(body) != string(lostBody) {
		t.Fatalf("retry: %d %s", response.StatusCode, body)
	}
	t.Log("RETRY identical request -> 200; Idempotency-Replayed=true; body equals committed response")
	inspect(2, 1, 120)
	response, body, err = send("POST", path, "evidence-command-02", command)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != 409 || !strings.Contains(string(body), "version_conflict") {
		t.Fatalf("stale: %d %s", response.StatusCode, body)
	}
	t.Log("POST same expected_version=1 with a new key -> 409 version_conflict")
	inspect(2, 1, 120)
	response, body, err = send("GET", "/v2/runs/"+run.ID, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != 200 {
		t.Fatalf("reload: %d %s", response.StatusCode, body)
	}
	if err := json.Unmarshal(body, &run); err != nil {
		t.Fatal(err)
	}
	if run.Version != 2 || len(run.State.PendingShowOptions) == 0 {
		t.Fatalf("reload did not recover next legal action")
	}
	t.Log("GET run -> 200; version=2; recover legal show options from authoritative state")
	next, _ := json.Marshal(map[string]any{"type": "choose_show_option", "expected_version": 2, "option_id": run.State.PendingShowOptions[0]})
	response, body, err = send("POST", path, "evidence-command-03", string(next))
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != 200 {
		t.Fatalf("resume: %d %s", response.StatusCode, body)
	}
	t.Log("POST legal next action expected_version=2 -> 200; progression resumes")
	inspect(3, 2, 120)
}
