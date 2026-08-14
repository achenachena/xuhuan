package api

import (
	"errors"
	"log/slog"
	"net/http"
	"regexp"
	"strings"

	"github.com/achenachena/xuhuan/apps/api/internal/platform/observability"
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
