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
	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
	"github.com/achenachena/xuhuan/apps/api/internal/game"
	"github.com/achenachena/xuhuan/apps/api/internal/progression"
	gameRun "github.com/achenachena/xuhuan/apps/api/internal/run"
)

type fakeGameService struct {
	catalog          *gamecontent.Catalog
	snapshot         game.Snapshot
	command          game.CommandInput
	result           gameRun.CommandResponse
	dailyResultID    string
	dailyResultCalls int
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
func (service *fakeGameService) GetPublicDailyResult(_ context.Context, runID string) (gameRun.DailyResult, error) {
	service.dailyResultCalls++
	service.dailyResultID = runID
	return gameRun.DailyResult{
		Date: "2026-08-29", CharacterSlug: "nana7mi", Score: 1234,
		Modules: []gameRun.ModuleLevel{}, Plugins: []string{}, Streak: 2,
		CompletedAt: time.Date(2026, 8, 29, 12, 0, 0, 0, time.UTC),
	}, nil
}

func v2TestRouter(t *testing.T) (http.Handler, *fakeGameService) {
	return v2TestRouterWithLocalDevelopment(t, true)
}

func v2TestRouterWithLocalDevelopment(t *testing.T, allowLocalDevelopment bool) (http.Handler, *fakeGameService) {
	t.Helper()
	authenticator := auth.NewAuthenticator(nil, allowLocalDevelopment)
	now := time.Date(2026, 8, 18, 12, 0, 0, 0, time.UTC)
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	service := &fakeGameService{
		catalog: catalog,
		snapshot: game.Snapshot{
			Progress: progression.Progress{
				CurrentChapter: "seventh-dock", HighestNoise: 0, StoryVersion: 3,
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
	request := httptest.NewRequest(http.MethodGet, "/v2/content/v3?locale=en", nil)
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
	revalidate := httptest.NewRequest(http.MethodGet, "/v2/content/v3?locale=en", nil)
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

	productionRouter, _ := v2TestRouterWithLocalDevelopment(t, false)
	unauthorized := httptest.NewRecorder()
	productionRouter.ServeHTTP(unauthorized, httptest.NewRequest(http.MethodGet, "/v2/game", nil))
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("unauthorized status = %d", unauthorized.Code)
	}

	request := httptest.NewRequest(http.MethodGet, "/v2/game", nil)
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
		ID: runID, ContentVersion: "v3", Mode: gameRun.CampaignMode, Status: gameRun.Active, Version: 4,
		State:     gameRun.State{Phase: gameRun.MapPhase, ChapterSlug: "seventh-dock", CharacterSlug: "nana7mi", WeaponSlug: "auto-signal", Health: 64, MaxHealth: 64, Modules: []gameRun.ModuleLevel{}, Plugins: []string{}, ChoiceTags: []string{}, Map: gameRun.MapState{Nodes: []gameRun.MapNode{}}},
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	request := httptest.NewRequest(http.MethodPost, "/v2/runs/"+runID+"/commands", strings.NewReader(`{"type":"choose_node","node_id":"l1-a","expected_version":3}`))
	request.Header.Set("Content-Type", "application/json")
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

func TestV2PublicDailyResultRequiresRunIDAndIsCacheable(t *testing.T) {
	router, service := v2TestRouter(t)
	for _, runID := range []string{
		"too-short",
		"10000000-0000-4000-8000-00000000000z",
		"10000000000040008000000000000001",
	} {
		request := httptest.NewRequest(http.MethodGet, "/v2/daily/results/"+runID, nil)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		if response.Code != http.StatusNotFound {
			t.Errorf("run ID %q status=%d body=%s", runID, response.Code, response.Body.String())
		}
	}
	if service.dailyResultCalls != 0 {
		t.Fatalf("invalid IDs reached service %d times", service.dailyResultCalls)
	}

	runID := "10000000-0000-4000-8000-000000000001"
	request := httptest.NewRequest(http.MethodGet, "/v2/daily/results/"+runID, nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
	if service.dailyResultCalls != 1 || service.dailyResultID != runID {
		t.Fatalf("calls=%d run_id=%q", service.dailyResultCalls, service.dailyResultID)
	}
	if got := response.Header().Get("Cache-Control"); got != "public, max-age=300, s-maxage=300, stale-while-revalidate=60" {
		t.Fatalf("Cache-Control=%q", got)
	}
	if !strings.Contains(response.Body.String(), `"score":1234`) {
		t.Fatalf("public response missing result: %s", response.Body.String())
	}
}
