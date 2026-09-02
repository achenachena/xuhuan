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
	catalog       *gamecontent.V4Catalog
	snapshot      game.Snapshot
	command       game.CommandInput
	start         game.StartInput
	currentRun    gameRun.GameRun
	dailyResultID string
}

func (service *fakeGameService) Catalog() *gamecontent.V4Catalog { return service.catalog }
func (service *fakeGameService) Get(context.Context, auth.User) (game.Snapshot, error) {
	return service.snapshot, nil
}
func (service *fakeGameService) Start(_ context.Context, _ auth.User, input game.StartInput) (gameRun.GameRun, bool, error) {
	service.start = input
	mode := input.Mode
	if mode == "" {
		mode = gameRun.CampaignMode
	}
	chapter, character := input.ChapterSlug, input.CharacterSlug
	if chapter == "" {
		chapter = "seventh-dock"
	}
	if character == "" {
		character = "nana7mi"
	}
	companions := []string{}
	if input.CompanionSlug != "" {
		companions = append(companions, input.CompanionSlug)
	}
	state, err := gameRun.NewState(gameRun.StartInput{Mode: mode, ChapterSlug: chapter, CharacterSlug: character, CompanionSlugs: companions, EncoreLevel: input.EncoreLevel, Seed: "api-contract-seed-0001"}, service.catalog)
	if err != nil {
		return gameRun.GameRun{}, false, err
	}
	now := time.Now().UTC()
	service.currentRun = gameRun.GameRun{ID: "10000000-0000-4000-8000-000000000001", ContentVersion: gamecontent.V4Version, Mode: mode, State: state, Status: gameRun.Active, Version: 1, CreatedAt: now, UpdatedAt: now}
	return service.currentRun, false, nil
}
func (service *fakeGameService) GetRun(context.Context, auth.User, string) (gameRun.GameRun, error) {
	return service.currentRun, nil
}
func (service *fakeGameService) Command(_ context.Context, _ auth.User, input game.CommandInput) (gameRun.CommandResponse, bool, error) {
	service.command = input
	return gameRun.CommandResponse{Run: service.currentRun, Events: []gameRun.Event{}}, false, nil
}
func (service *fakeGameService) ChooseStory(context.Context, auth.User, game.StoryChoiceInput) (progression.Progress, bool, error) {
	return service.snapshot.Progress, false, nil
}
func (service *fakeGameService) GetPublicDailyResult(_ context.Context, runID string) (gameRun.DailyResult, error) {
	service.dailyResultID = runID
	return gameRun.DailyResult{Date: "2026-08-31", CharacterSlug: "nana7mi", Score: 1234, ShowEffects: []string{}, CompanionSlugs: []string{}, Streak: 2, CompletedAt: time.Now()}, nil
}

func v2TestRouter(t *testing.T) (http.Handler, *fakeGameService) {
	return v2TestRouterWithLocalDevelopment(t, true)
}

func v2TestRouterWithLocalDevelopment(t *testing.T, local bool) (http.Handler, *fakeGameService) {
	t.Helper()
	catalog := gamecontent.MustLoadV4()
	state, err := gameRun.NewState(gameRun.StartInput{Mode: gameRun.CampaignMode, ChapterSlug: "seventh-dock", CharacterSlug: "nana7mi", Seed: "api-contract-seed-0001"}, catalog)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	currentRun := gameRun.GameRun{ID: "10000000-0000-4000-8000-000000000001", ContentVersion: gamecontent.V4Version, Mode: gameRun.CampaignMode, State: state, Status: gameRun.Active, Version: 1, CreatedAt: now, UpdatedAt: now}
	service := &fakeGameService{
		catalog:    catalog,
		currentRun: currentRun,
		snapshot: game.Snapshot{
			Progress:    progression.Progress{CurrentChapter: "seventh-dock", StoryVersion: 4, StoryFlags: map[string]bool{}, Version: 1, Unlocks: []progression.Unlock{}, Choices: []progression.Choice{}, Chapters: []progression.ChapterProgress{{ChapterSlug: "seventh-dock"}}},
			CampaignRun: &currentRun,
		},
	}
	router := NewRouter(Dependencies{Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), Version: "test", MaxBodyBytes: 1 << 20, Readiness: ReadinessFunc(func(context.Context) error { return nil }), Authenticator: auth.NewAuthenticator(nil, local), Game: service})
	return router, service
}

func TestV2ContentUsesLocalizedV4Contract(t *testing.T) {
	router, _ := v2TestRouter(t)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v2/content/v4?locale=en", nil))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"version":"v4"`) || !strings.Contains(response.Body.String(), `"protocol":"shooter-v1"`) {
		t.Fatalf("response=%d %s", response.Code, response.Body.String())
	}
}

func TestV2CommandUsesExactV4Fields(t *testing.T) {
	router, service := v2TestRouter(t)
	runID := "10000000-0000-4000-8000-000000000001"
	request := httptest.NewRequest(http.MethodPost, "/v2/runs/"+runID+"/commands", strings.NewReader(`{"type":"choose_intermission_reply","scene_id":"seventh-dock-intermission","option_id":"keep-ocean-noise","expected_version":3}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Idempotency-Key", "command-test-001")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("response=%d %s", response.Code, response.Body.String())
	}
	if service.command.Command.SceneID != "seventh-dock-intermission" || service.command.Command.OptionID != "keep-ocean-noise" || service.command.ExpectedVersion != 3 {
		t.Fatalf("command=%#v", service.command)
	}
}

func TestV2CreateRunAcceptsOneUnlockedCompanionField(t *testing.T) {
	router, service := v2TestRouter(t)
	request := httptest.NewRequest(http.MethodPost, "/v2/runs", strings.NewReader(`{"mode":"campaign","chapter_slug":"seventh-dock","character_slug":"nana7mi","companion_slug":"jiaran-assist","encore_level":1}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Idempotency-Key", "create-with-companion-001")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusCreated {
		t.Fatalf("response=%d %s", response.Code, response.Body.String())
	}
	if service.start.CompanionSlug != "jiaran-assist" || service.start.CharacterSlug != "nana7mi" || service.start.EncoreLevel != 1 {
		t.Fatalf("start input=%#v", service.start)
	}
}

func TestV2CreateRunRequiresExplicitMode(t *testing.T) {
	router, _ := v2TestRouter(t)
	request := httptest.NewRequest(http.MethodPost, "/v2/runs", strings.NewReader(`{"chapter_slug":"seventh-dock","character_slug":"nana7mi"}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Idempotency-Key", "create-without-mode-001")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("response=%d %s", response.Code, response.Body.String())
	}
}

func TestV2RejectsOutOfRangeSegmentOutcome(t *testing.T) {
	router, _ := v2TestRouter(t)
	runID := "10000000-0000-4000-8000-000000000001"
	request := httptest.NewRequest(http.MethodPost, "/v2/runs/"+runID+"/commands", strings.NewReader(`{"type":"complete_segment","expected_version":1,"segment_outcome":{"won":true,"health":4,"score":10}}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Idempotency-Key", "bounded-segment-outcome-001")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("response=%d %s", response.Code, response.Body.String())
	}
}
