package api

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/achenachena/xuhuan/apps/api/internal/auth"
	"github.com/achenachena/xuhuan/apps/api/internal/character"
	"github.com/achenachena/xuhuan/apps/api/internal/player"
	"github.com/achenachena/xuhuan/apps/api/internal/repository"
)

type fakePlayerRepository struct {
	item player.Player
	err  error
}

func (r fakePlayerRepository) GetOrCreate(context.Context, auth.User) (player.Player, error) {
	return r.item, r.err
}

type fakeCatalogRepository struct {
	characters []character.Character
	encounters []character.Encounter
	err        error
}

func (r fakeCatalogRepository) ListCharacters(context.Context) ([]character.Character, error) {
	if r.err != nil {
		return nil, r.err
	}
	return r.characters, nil
}

func (r fakeCatalogRepository) GetCharacter(_ context.Context, slug string) (character.Character, error) {
	if r.err != nil {
		return character.Character{}, r.err
	}
	for _, item := range r.characters {
		if item.Slug == slug {
			return item, nil
		}
	}
	return character.Character{}, repository.ErrNotFound
}

func (r fakeCatalogRepository) ListEncounters(context.Context) ([]character.Encounter, error) {
	if r.err != nil {
		return nil, r.err
	}
	return r.encounters, nil
}

func (r fakeCatalogRepository) GetEncounter(_ context.Context, slug string) (character.Encounter, error) {
	if r.err != nil {
		return character.Encounter{}, r.err
	}
	for _, item := range r.encounters {
		if item.Slug == slug {
			return item, nil
		}
	}
	return character.Encounter{}, repository.ErrNotFound
}

func v1TestRouter(t *testing.T) http.Handler {
	t.Helper()
	username := "dev_player"
	firstName := "开发"
	lastName := "玩家"
	now := time.Date(2026, 8, 6, 12, 0, 0, 0, time.UTC)
	authenticator, err := auth.NewAuthenticator(nil, auth.DevelopmentConfig{
		Enabled: true, Environment: "development", Token: "0123456789abcdef", TelegramID: 9_007_199_254_740_993,
		Username: username, FirstName: firstName, LastName: lastName,
	})
	if err != nil {
		t.Fatal(err)
	}
	services := &Services{
		Players: fakePlayerRepository{item: player.Player{
			ID: "53fbdabe-798f-4da5-a70e-f265c1e0786c", TelegramUserID: 9_007_199_254_740_993,
			Username: &username, FirstName: &firstName, LastName: &lastName, Level: 1,
			Energy: 120, Version: 1, CreatedAt: now, UpdatedAt: now,
		}},
		Catalog: fakeCatalogRepository{
			characters: []character.Character{{
				ID: "d045d8f2-1ec9-41f4-8f1c-8a0224d70db8", Slug: "nana7mi",
				Name:      character.LocalizedText{ZHCN: "七海Nana7mi", EN: "Nana7mi"},
				Biography: character.LocalizedText{ZHCN: "中文简介", EN: "English biography"},
				Archetype: "idol", BaseHealth: 100, BaseAttack: 28, BaseDefense: 22, BaseSpeed: 18,
				BaseCritRate: .12, BaseCritDamage: .45,
				SpecialMoveName:        character.LocalizedText{ZHCN: "绝招", EN: "Special"},
				SpecialMoveDescription: character.LocalizedText{ZHCN: "绝招说明", EN: "Special description"},
				SpecialMoveType:        "sound", Rarity: "legendary", ColorTheme: "#FF69B4",
				PortraitURL: "https://assets.example/portrait.png", ModelURL: "https://assets.example/model.png",
			}},
			encounters: []character.Encounter{{
				ID: "4c148b96-587d-4623-bb74-f17c90445f15", Slug: "training-drone",
				Name:        character.LocalizedText{ZHCN: "训练无人机", EN: "Training Drone"},
				Description: character.LocalizedText{ZHCN: "基础对手", EN: "Basic opponent"},
				Level:       2, MaxHealth: 90, Attack: 22, Defense: 18, Speed: 12, CritRate: .08, CritDamage: .35,
				SpecialMoveName:        character.LocalizedText{ZHCN: "脉冲", EN: "Pulse"},
				SpecialMoveDescription: character.LocalizedText{ZHCN: "能量脉冲", EN: "Energy pulse"},
				ColorTheme:             "#64748B",
			}},
		},
	}
	return NewRouter(Dependencies{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), Version: "test", MaxBodyBytes: 1024,
		Readiness: ReadinessFunc(func(context.Context) error { return nil }), Authenticator: authenticator, Services: services,
	})
}

func TestReadAPIs(t *testing.T) {
	t.Parallel()
	router := v1TestRouter(t)

	tests := []struct {
		name         string
		path         string
		language     string
		devToken     bool
		status       int
		bodyContains string
	}{
		{name: "characters Chinese", path: "/v1/characters", status: http.StatusOK, bodyContains: "七海Nana7mi"},
		{name: "character English", path: "/v1/characters/nana7mi", language: "en-US", status: http.StatusOK, bodyContains: "English biography"},
		{name: "encounters", path: "/v1/encounters", status: http.StatusOK, bodyContains: "训练无人机"},
		{name: "encounter missing", path: "/v1/encounters/missing", status: http.StatusNotFound, bodyContains: "not_found"},
		{name: "invalid slug", path: "/v1/characters/INVALID!", status: http.StatusBadRequest, bodyContains: "invalid_request"},
		{name: "player unauthorized", path: "/v1/player", status: http.StatusUnauthorized, bodyContains: "unauthorized"},
		{name: "player", path: "/v1/player", devToken: true, status: http.StatusOK, bodyContains: `"telegram_user_id":"9007199254740993"`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			request := httptest.NewRequest(http.MethodGet, tt.path, nil)
			if tt.language != "" {
				request.Header.Set("Accept-Language", tt.language)
			}
			if tt.devToken {
				request.Header.Set(auth.DevelopmentHeader, "0123456789abcdef")
			}
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			if response.Code != tt.status || !strings.Contains(response.Body.String(), tt.bodyContains) {
				t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
			}
			if response.Header().Get("Content-Type") != "application/json; charset=utf-8" {
				t.Fatalf("content type = %q", response.Header().Get("Content-Type"))
			}
		})
	}
}

func TestReadAPIsNeverExposeRepositoryErrors(t *testing.T) {
	t.Parallel()
	secret := errors.New("postgres password=do-not-expose")
	handler := requestIDMiddleware(listCharactersHandler(
		fakeCatalogRepository{err: secret},
		slog.New(slog.NewTextHandler(io.Discard, nil)),
	))
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/v1/characters", nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d", response.Code)
	}
	if strings.Contains(response.Body.String(), secret.Error()) {
		t.Fatal("internal error leaked")
	}
}
