package api

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/achenachena/xuhuan/apps/api/internal/auth"
	"github.com/achenachena/xuhuan/apps/api/internal/combat"
	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
	"github.com/achenachena/xuhuan/apps/api/internal/game"
	"github.com/achenachena/xuhuan/apps/api/internal/player"
	"github.com/achenachena/xuhuan/apps/api/internal/progression"
	gameRun "github.com/achenachena/xuhuan/apps/api/internal/run"
)

type fakeGameService struct {
	catalog  *gamecontent.Catalog
	snapshot game.Snapshot
	command  game.CommandInput
	result   gameRun.CommandResponse
}

func (service *fakeGameService) Catalog() *gamecontent.Catalog { return service.catalog }
func (service *fakeGameService) Get(context.Context, auth.User) (game.Snapshot, error) {
	return service.snapshot, nil
}
func (service *fakeGameService) Start(context.Context, auth.User, game.StartInput) (gameRun.GameRun, bool, error) {
	return gameRun.GameRun{}, false, nil
}
func (service *fakeGameService) GetRun(context.Context, auth.User, string) (gameRun.GameRun, error) {
	return service.result.Run, nil
}
func (service *fakeGameService) Command(_ context.Context, _ auth.User, input game.CommandInput) (gameRun.CommandResponse, bool, error) {
	service.command = input
	return service.result, false, nil
}
func (service *fakeGameService) ChooseStory(context.Context, auth.User, game.StoryChoiceInput) (progression.Progress, bool, error) {
	return service.snapshot.Progress, false, nil
}

func v2TestRouter(t *testing.T) (http.Handler, *fakeGameService) {
	t.Helper()
	authenticator, err := auth.NewAuthenticator(nil, auth.DevelopmentConfig{
		Enabled: true, Environment: "development", Token: "0123456789abcdef", TelegramID: 42,
		Username: "viewer_one", FirstName: "Viewer", LastName: "One",
	})
	if err != nil {
		t.Fatal(err)
	}
	firstName, lastName, language := "Viewer", "One", "zh-CN"
	now := time.Date(2026, 8, 18, 12, 0, 0, 0, time.UTC)
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	service := &fakeGameService{
		catalog: catalog,
		snapshot: game.Snapshot{
			Player: player.Player{ID: "20000000-0000-4000-8000-000000000002", FirstName: &firstName, LastName: &lastName, LanguageCode: &language},
			Progress: progression.Progress{
				CurrentChapter: "seventh-dock", HighestNoise: 0, StoryVersion: 1,
				StoryFlags: map[string]bool{}, Version: 1, Unlocks: []progression.Unlock{{Type: "character", ContentSlug: "nana7mi", CreatedAt: now}},
			},
		},
	}
	return NewRouter(Dependencies{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), Version: "test", MaxBodyBytes: 4096,
		Readiness: ReadinessFunc(func(context.Context) error { return nil }), Authenticator: authenticator,
		Game: service,
	}), service
}

func TestV2ContentIsLocalizedAndImmutable(t *testing.T) {
	router, _ := v2TestRouter(t)
	request := httptest.NewRequest(http.MethodGet, "/v2/content/v1?locale=en", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"title":"No Sea at the Seventh Dock"`) {
		t.Fatalf("content was not localized: %s", response.Body.String())
	}
	if got := response.Header().Get("Cache-Control"); got != "public, max-age=31536000, immutable" {
		t.Fatalf("Cache-Control = %q", got)
	}
	etag := response.Header().Get("ETag")
	revalidate := httptest.NewRequest(http.MethodGet, "/v2/content/v1?locale=en", nil)
	revalidate.Header.Set("If-None-Match", etag)
	revalidatedResponse := httptest.NewRecorder()
	router.ServeHTTP(revalidatedResponse, revalidate)
	if revalidatedResponse.Code != http.StatusNotModified {
		t.Fatalf("conditional status = %d, want 304", revalidatedResponse.Code)
	}
}

func TestV2GameReturnsPendingSceneAndRequiresAuthentication(t *testing.T) {
	router, service := v2TestRouter(t)
	pending, _ := service.catalog.Scene("prologue-last-viewer")
	service.snapshot.PendingScene = &pending

	unauthorized := httptest.NewRecorder()
	router.ServeHTTP(unauthorized, httptest.NewRequest(http.MethodGet, "/v2/game", nil))
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("unauthorized status = %d", unauthorized.Code)
	}

	request := httptest.NewRequest(http.MethodGet, "/v2/game", nil)
	request.Header.Set(auth.DevelopmentHeader, "0123456789abcdef")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"pending_scene_slug":"prologue-last-viewer"`) {
		t.Fatalf("game response = %d %s", response.Code, response.Body.String())
	}
}

func TestV2CommandForwardsVersionAndIdempotencyKey(t *testing.T) {
	router, service := v2TestRouter(t)
	runID := "10000000-0000-4000-8000-000000000001"
	service.result.Run = gameRun.GameRun{
		ID: runID, ContentVersion: "v1", Status: gameRun.Active, Version: 4,
		State:     gameRun.State{Phase: gameRun.MapPhase, ChapterSlug: "seventh-dock", CharacterSlug: "nana7mi", Health: 64, MaxHealth: 64, Deck: []combat.CardInstance{}, Relics: []string{}, ChoiceTags: []string{}, Map: gameRun.MapState{Nodes: []gameRun.MapNode{}}},
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	request := httptest.NewRequest(http.MethodPost, "/v2/runs/"+runID+"/commands", strings.NewReader(`{"type":"choose_node","node_id":"l1-a","expected_version":3}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(auth.DevelopmentHeader, "0123456789abcdef")
	request.Header.Set("Idempotency-Key", "command-test-001")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", response.Code, response.Body.String())
	}
	if service.command.ExpectedVersion != 3 || service.command.IdempotencyKey != "command-test-001" || service.command.Command.NodeID != "l1-a" {
		t.Fatalf("forwarded command = %#v", service.command)
	}
}
