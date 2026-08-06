package api

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/achenachena/xuhuan/apps/api/internal/auth"
	"github.com/achenachena/xuhuan/apps/api/internal/battle"
	"github.com/achenachena/xuhuan/apps/api/internal/character"
	"github.com/achenachena/xuhuan/apps/api/internal/player"
	"github.com/achenachena/xuhuan/apps/api/internal/repository"
)

type fakeBattleRepository struct{}

func (fakeBattleRepository) Create(_ context.Context, input battle.CreateRepositoryInput) (battle.Battle, bool, error) {
	now := time.Date(2026, 8, 6, 12, 0, 0, 0, time.UTC)
	return battle.Battle{
		ID: "c8c6d56d-974f-4c82-8a83-a3c20e736e38", PlayerID: input.Player.ID,
		Character: input.Character, Encounter: input.Encounter, Seed: input.Seed, State: input.State,
		Status: battle.Active, Version: 1, CreatedAt: now, UpdatedAt: now,
	}, false, nil
}

func (fakeBattleRepository) Get(_ context.Context, playerID, battleID string) (battle.Battle, error) {
	if battleID != "c8c6d56d-974f-4c82-8a83-a3c20e736e38" {
		return battle.Battle{}, repository.ErrNotFound
	}
	item := fakeBattle(playerID)
	return item, nil
}

func (fakeBattleRepository) Apply(_ context.Context, input battle.ApplyRepositoryInput, resolve battle.Resolver) (battle.ActionResponse, bool, error) {
	if input.ExpectedVersion != 1 {
		return battle.ActionResponse{}, false, battle.ErrVersionConflict
	}
	current := fakeBattle(input.PlayerID)
	next, result, outcome, reward, err := resolve(current, input.Action)
	if err != nil {
		return battle.ActionResponse{}, false, err
	}
	current.State = next
	current.Version = 2
	current.Outcome = outcome
	current.Rewards = reward
	return battle.ActionResponse{Battle: current, Result: result}, false, nil
}

func fakeBattle(playerID string) battle.Battle {
	now := time.Date(2026, 8, 6, 12, 0, 0, 0, time.UTC)
	hero := testAPICharacter()
	enemy := testAPIEncounter()
	return battle.Battle{
		ID: "c8c6d56d-974f-4c82-8a83-a3c20e736e38", PlayerID: playerID,
		Character: hero, Encounter: enemy, Seed: "0123456789abcdef0123456789abcdef",
		State: battle.NewState(hero, enemy, 1), Status: battle.Active, Version: 1, CreatedAt: now, UpdatedAt: now,
	}
}

func testAPICharacter() character.Character {
	return character.Character{
		ID: "d045d8f2-1ec9-41f4-8f1c-8a0224d70db8", Slug: "nana7mi",
		Name:      character.LocalizedText{ZHCN: "七海Nana7mi", EN: "Nana7mi"},
		Biography: character.LocalizedText{ZHCN: "中文简介", EN: "English biography"}, Archetype: "idol",
		BaseHealth: 100, BaseAttack: 28, BaseDefense: 22, BaseSpeed: 18, BaseCritRate: .12, BaseCritDamage: .45,
		SpecialMoveName:        character.LocalizedText{ZHCN: "绝招", EN: "Special"},
		SpecialMoveDescription: character.LocalizedText{ZHCN: "说明", EN: "Description"},
		SpecialMoveType:        "sound", Rarity: "legendary", ColorTheme: "#FF69B4",
		PortraitURL: "https://assets.example/portrait.png", ModelURL: "https://assets.example/model.png",
	}
}

func testAPIEncounter() character.Encounter {
	return character.Encounter{
		ID: "4c148b96-587d-4623-bb74-f17c90445f15", Slug: "training-drone",
		Name:        character.LocalizedText{ZHCN: "训练无人机", EN: "Training Drone"},
		Description: character.LocalizedText{ZHCN: "基础对手", EN: "Basic opponent"}, Level: 2,
		MaxHealth: 90, Attack: 22, Defense: 18, Speed: 12, CritRate: .08, CritDamage: .35,
		SpecialMoveName:        character.LocalizedText{ZHCN: "脉冲", EN: "Pulse"},
		SpecialMoveDescription: character.LocalizedText{ZHCN: "说明", EN: "Description"}, ColorTheme: "#64748B",
	}
}

func battleAPIRouter(t *testing.T) http.Handler {
	t.Helper()
	username := "dev"
	now := time.Date(2026, 8, 6, 12, 0, 0, 0, time.UTC)
	playerService := player.NewService(fakePlayerRepository{item: player.Player{
		ID: "53fbdabe-798f-4da5-a70e-f265c1e0786c", TelegramUserID: 123, Username: &username,
		Level: 1, Energy: 120, Version: 1, CreatedAt: now, UpdatedAt: now,
	}})
	catalogService := character.NewService(fakeCatalogRepository{
		characters: []character.Character{testAPICharacter()}, encounters: []character.Encounter{testAPIEncounter()},
	})
	battleService := battle.NewService(fakeBattleRepository{}, playerService, catalogService)
	authenticator, err := auth.NewAuthenticator(nil, auth.DevelopmentConfig{
		Enabled: true, Environment: "development", Token: "0123456789abcdef", TelegramID: 123,
	})
	if err != nil {
		t.Fatal(err)
	}
	return NewRouter(Dependencies{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), Version: "test", MaxBodyBytes: 1024,
		Readiness: ReadinessFunc(func(context.Context) error { return nil }), Authenticator: authenticator,
		Services: &Services{Players: playerService, Catalog: catalogService, Battles: battleService},
	})
}

func TestBattleHTTPAPI(t *testing.T) {
	t.Parallel()
	router := battleAPIRouter(t)

	request := httptest.NewRequest(http.MethodPost, "/v1/battles", strings.NewReader(`{"character_slug":"nana7mi","encounter_slug":"training-drone"}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(auth.DevelopmentHeader, "0123456789abcdef")
	request.Header.Set("Idempotency-Key", "start-battle-001")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusCreated || response.Header().Get("Idempotency-Replayed") != "false" {
		t.Fatalf("create status=%d headers=%v body=%s", response.Code, response.Header(), response.Body.String())
	}
	if strings.Contains(response.Body.String(), `"seed"`) || strings.Contains(response.Body.String(), `"player_id"`) {
		t.Fatalf("private battle fields leaked: %s", response.Body.String())
	}
	var created battleResponse
	if err := json.Unmarshal(response.Body.Bytes(), &created); err != nil || created.Version != 1 || created.Hero.CurrentHealth != 100 {
		t.Fatalf("created=%#v error=%v", created, err)
	}

	actionRequest := httptest.NewRequest(http.MethodPost, "/v1/battles/c8c6d56d-974f-4c82-8a83-a3c20e736e38/actions", strings.NewReader(`{"action":"light_attack","expected_version":1}`))
	actionRequest.Header.Set("Content-Type", "application/json")
	actionRequest.Header.Set(auth.DevelopmentHeader, "0123456789abcdef")
	actionRequest.Header.Set("Idempotency-Key", "battle-action-001")
	actionResponseRecorder := httptest.NewRecorder()
	router.ServeHTTP(actionResponseRecorder, actionRequest)
	if actionResponseRecorder.Code != http.StatusOK || !strings.Contains(actionResponseRecorder.Body.String(), `"version":2`) {
		t.Fatalf("action status=%d body=%s", actionResponseRecorder.Code, actionResponseRecorder.Body.String())
	}

	conflictRequest := httptest.NewRequest(http.MethodPost, "/v1/battles/c8c6d56d-974f-4c82-8a83-a3c20e736e38/actions", strings.NewReader(`{"action":"light_attack","expected_version":99}`))
	conflictRequest.Header.Set("Content-Type", "application/json")
	conflictRequest.Header.Set(auth.DevelopmentHeader, "0123456789abcdef")
	conflictRequest.Header.Set("Idempotency-Key", "battle-action-002")
	conflictResponse := httptest.NewRecorder()
	router.ServeHTTP(conflictResponse, conflictRequest)
	if conflictResponse.Code != http.StatusConflict || !strings.Contains(conflictResponse.Body.String(), "version_conflict") {
		t.Fatalf("conflict status=%d body=%s", conflictResponse.Code, conflictResponse.Body.String())
	}
}

func TestBattleHTTPValidation(t *testing.T) {
	t.Parallel()
	router := battleAPIRouter(t)

	tests := []struct {
		name        string
		path        string
		contentType string
		key         string
		body        string
		status      int
		code        string
	}{
		{name: "missing idempotency", path: "/v1/battles", contentType: "application/json", body: `{}`, status: 400, code: "invalid_request"},
		{name: "wrong content type", path: "/v1/battles", contentType: "text/plain", key: "start-battle-001", body: `{}`, status: 415, code: "unsupported_media_type"},
		{name: "invalid battle id", path: "/v1/battles/not-a-uuid/actions", contentType: "application/json", key: "battle-action-001", body: `{"action":"light_attack","expected_version":1}`, status: 400, code: "invalid_request"},
		{name: "unknown action", path: "/v1/battles/c8c6d56d-974f-4c82-8a83-a3c20e736e38/actions", contentType: "application/json", key: "battle-action-001", body: `{"action":"win_now","expected_version":1}`, status: 400, code: "invalid_action"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			request := httptest.NewRequest(http.MethodPost, tt.path, strings.NewReader(tt.body))
			request.Header.Set("Content-Type", tt.contentType)
			request.Header.Set(auth.DevelopmentHeader, "0123456789abcdef")
			if tt.key != "" {
				request.Header.Set("Idempotency-Key", tt.key)
			}
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			if response.Code != tt.status || !strings.Contains(response.Body.String(), tt.code) {
				t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
			}
		})
	}
}
