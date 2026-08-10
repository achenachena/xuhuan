package api

import (
	"errors"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/achenachena/xuhuan/apps/api/internal/character"
	"github.com/achenachena/xuhuan/apps/api/internal/platform/observability"
	"github.com/achenachena/xuhuan/apps/api/internal/player"
	"github.com/achenachena/xuhuan/apps/api/internal/repository"
	"github.com/go-chi/chi/v5"
)

var slugPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

func registerV1Routes(router chi.Router, authenticate func(http.Handler) http.Handler, rateLimit RateLimitConfig, services Services, logger *slog.Logger, metrics *observability.Metrics) {
	router.Route("/v1", func(router chi.Router) {
		router.Get("/characters", listCharactersHandler(services.Catalog, logger))
		router.Get("/characters/{slug}", getCharacterHandler(services.Catalog, logger))
		router.Get("/encounters", listEncountersHandler(services.Catalog, logger))
		router.Get("/encounters/{slug}", getEncounterHandler(services.Catalog, logger))
		router.Group(func(protected chi.Router) {
			protected.Use(authenticate)
			protected.Use(playerRateLimitMiddleware(rateLimit))
			protected.Get("/player", getPlayerHandler(services.Players, logger))
			protected.Post("/battles", createBattleHandler(services.Battles, logger, metrics))
			protected.Get("/battles/{id}", getBattleHandler(services.Battles, logger))
			protected.Post("/battles/{id}/actions", createBattleActionHandler(services.Battles, logger, metrics))
		})
	})
}

type playerResponse struct {
	ID             string  `json:"id"`
	TelegramUserID string  `json:"telegram_user_id"`
	Username       *string `json:"username"`
	DisplayName    string  `json:"display_name"`
	Level          int     `json:"level"`
	Experience     int64   `json:"experience"`
	Credits        int64   `json:"credits"`
	Energy         int     `json:"energy"`
	Version        int64   `json:"version"`
	CreatedAt      string  `json:"created_at"`
	UpdatedAt      string  `json:"updated_at"`
}

type characterResponse struct {
	ID                     string  `json:"id"`
	Slug                   string  `json:"slug"`
	Name                   string  `json:"name"`
	Biography              string  `json:"biography"`
	Archetype              string  `json:"archetype"`
	BaseHealth             int     `json:"base_health"`
	BaseAttack             int     `json:"base_attack"`
	BaseDefense            int     `json:"base_defense"`
	BaseSpeed              int     `json:"base_speed"`
	BaseCritRate           float64 `json:"base_crit_rate"`
	BaseCritDamage         float64 `json:"base_crit_damage"`
	SpecialMoveName        string  `json:"special_move_name"`
	SpecialMoveDescription string  `json:"special_move_description"`
	SpecialMoveType        string  `json:"special_move_type"`
	Rarity                 string  `json:"rarity"`
	ColorTheme             string  `json:"color_theme"`
	PortraitURL            string  `json:"portrait_url"`
	ModelURL               string  `json:"model_url"`
}

type encounterResponse struct {
	ID                     string  `json:"id"`
	Slug                   string  `json:"slug"`
	Name                   string  `json:"name"`
	Description            string  `json:"description"`
	Level                  int     `json:"level"`
	MaxHealth              int     `json:"max_health"`
	Attack                 int     `json:"attack"`
	Defense                int     `json:"defense"`
	Speed                  int     `json:"speed"`
	CritRate               float64 `json:"crit_rate"`
	CritDamage             float64 `json:"crit_damage"`
	SpecialMoveName        string  `json:"special_move_name"`
	SpecialMoveDescription string  `json:"special_move_description"`
	ColorTheme             string  `json:"color_theme"`
	ImageURL               *string `json:"image_url"`
}

func getPlayerHandler(service PlayerService, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		principal, ok := authenticatedPrincipal(w, r)
		if !ok {
			return
		}
		item, err := service.GetOrCreate(r.Context(), principal.User)
		if err != nil {
			logger.ErrorContext(r.Context(), "get_player_failed", "request_id", requestIDFromContext(r.Context()), "error", err)
			writeError(w, r, http.StatusInternalServerError, "internal_error", "An internal error occurred")
			return
		}
		writeJSON(w, http.StatusOK, mapPlayer(item))
	}
}

func listCharactersHandler(service CatalogService, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		items, err := service.ListCharacters(r.Context())
		if err != nil {
			writeServiceError(w, r, logger, "list_characters_failed", err)
			return
		}
		language := responseLanguage(r)
		responses := make([]characterResponse, 0, len(items))
		for _, item := range items {
			responses = append(responses, mapCharacter(item, language))
		}
		writeJSON(w, http.StatusOK, map[string]any{"characters": responses})
	}
}

func getCharacterHandler(service CatalogService, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug, ok := validSlug(w, r)
		if !ok {
			return
		}
		item, err := service.GetCharacter(r.Context(), slug)
		if err != nil {
			writeServiceError(w, r, logger, "get_character_failed", err)
			return
		}
		writeJSON(w, http.StatusOK, mapCharacter(item, responseLanguage(r)))
	}
}

func listEncountersHandler(service CatalogService, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		items, err := service.ListEncounters(r.Context())
		if err != nil {
			writeServiceError(w, r, logger, "list_encounters_failed", err)
			return
		}
		language := responseLanguage(r)
		responses := make([]encounterResponse, 0, len(items))
		for _, item := range items {
			responses = append(responses, mapEncounter(item, language))
		}
		writeJSON(w, http.StatusOK, map[string]any{"encounters": responses})
	}
}

func getEncounterHandler(service CatalogService, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug, ok := validSlug(w, r)
		if !ok {
			return
		}
		item, err := service.GetEncounter(r.Context(), slug)
		if err != nil {
			writeServiceError(w, r, logger, "get_encounter_failed", err)
			return
		}
		writeJSON(w, http.StatusOK, mapEncounter(item, responseLanguage(r)))
	}
}

func validSlug(w http.ResponseWriter, r *http.Request) (string, bool) {
	slug := chi.URLParam(r, "slug")
	if len(slug) > 64 || !slugPattern.MatchString(slug) {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "The request is invalid")
		return "", false
	}
	return slug, true
}

func writeServiceError(w http.ResponseWriter, r *http.Request, logger *slog.Logger, event string, err error) {
	if errors.Is(err, repository.ErrNotFound) {
		writeError(w, r, http.StatusNotFound, "not_found", "The requested resource was not found")
		return
	}
	logger.ErrorContext(r.Context(), event, "request_id", requestIDFromContext(r.Context()), "error", err)
	writeError(w, r, http.StatusInternalServerError, "internal_error", "An internal error occurred")
}

func responseLanguage(r *http.Request) string {
	if strings.HasPrefix(strings.ToLower(r.Header.Get("Accept-Language")), "en") {
		return "en"
	}
	return "zh-CN"
}

func mapPlayer(item player.Player) playerResponse {
	displayName := strings.TrimSpace(valueOrEmpty(item.FirstName) + " " + valueOrEmpty(item.LastName))
	if displayName == "" && item.Username != nil {
		displayName = *item.Username
	}
	if displayName == "" {
		displayName = "Player"
	}
	return playerResponse{
		ID: item.ID, TelegramUserID: strconv.FormatInt(item.TelegramUserID, 10), Username: item.Username,
		DisplayName: displayName, Level: item.Level, Experience: item.Experience, Credits: item.Credits,
		Energy: item.Energy, Version: item.Version, CreatedAt: item.CreatedAt.UTC().Format("2006-01-02T15:04:05.000000Z07:00"),
		UpdatedAt: item.UpdatedAt.UTC().Format("2006-01-02T15:04:05.000000Z07:00"),
	}
}

func valueOrEmpty(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func mapCharacter(item character.Character, language string) characterResponse {
	return characterResponse{
		ID: item.ID, Slug: item.Slug, Name: item.Name.Resolve(language), Biography: item.Biography.Resolve(language),
		Archetype: item.Archetype, BaseHealth: item.BaseHealth, BaseAttack: item.BaseAttack,
		BaseDefense: item.BaseDefense, BaseSpeed: item.BaseSpeed, BaseCritRate: item.BaseCritRate,
		BaseCritDamage: item.BaseCritDamage, SpecialMoveName: item.SpecialMoveName.Resolve(language),
		SpecialMoveDescription: item.SpecialMoveDescription.Resolve(language), SpecialMoveType: item.SpecialMoveType,
		Rarity: item.Rarity, ColorTheme: item.ColorTheme, PortraitURL: item.PortraitURL, ModelURL: item.ModelURL,
	}
}

func mapEncounter(item character.Encounter, language string) encounterResponse {
	return encounterResponse{
		ID: item.ID, Slug: item.Slug, Name: item.Name.Resolve(language), Description: item.Description.Resolve(language),
		Level: item.Level, MaxHealth: item.MaxHealth, Attack: item.Attack, Defense: item.Defense,
		Speed: item.Speed, CritRate: item.CritRate, CritDamage: item.CritDamage,
		SpecialMoveName:        item.SpecialMoveName.Resolve(language),
		SpecialMoveDescription: item.SpecialMoveDescription.Resolve(language), ColorTheme: item.ColorTheme, ImageURL: item.ImageURL,
	}
}
