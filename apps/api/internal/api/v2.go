package api

import (
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/achenachena/xuhuan/apps/api/internal/action"
	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
	"github.com/achenachena/xuhuan/apps/api/internal/game"
	"github.com/achenachena/xuhuan/apps/api/internal/progression"
	"github.com/achenachena/xuhuan/apps/api/internal/repository"
	gameRun "github.com/achenachena/xuhuan/apps/api/internal/run"
	"github.com/achenachena/xuhuan/apps/api/internal/story"
	"github.com/go-chi/chi/v5"
)

type createRunRequest struct {
	Mode          gameRun.Mode `json:"mode"`
	ChapterSlug   string       `json:"chapter_slug"`
	CharacterSlug string       `json:"character_slug"`
	NoiseLevel    int          `json:"noise_level"`
}
type runCommandRequest struct {
	Type            gameRun.CommandType `json:"type"`
	ExpectedVersion int64               `json:"expected_version"`
	NodeID          string              `json:"node_id,omitempty"`
	ChoiceSlug      string              `json:"choice_slug,omitempty"`
	ModuleSlug      string              `json:"module_slug,omitempty"`
	Operation       string              `json:"operation,omitempty"`
	Trace           *action.InputTrace  `json:"trace,omitempty"`
}

type storyChoiceRequest struct {
	SceneSlug       string `json:"scene_slug"`
	OptionSlug      string `json:"option_slug"`
	ExpectedVersion int64  `json:"expected_version"`
}

func registerV2Routes(router chi.Router, authenticate func(http.Handler) http.Handler, rateLimit RateLimitConfig, service GameService, logger *slog.Logger) {
	router.Route("/v2", func(router chi.Router) {
		router.Get("/content/{version}", getContentHandler(service))
		router.Get("/daily/results/{id}", getPublicDailyResultHandler(service, logger))
		router.Group(func(protected chi.Router) {
			protected.Use(authenticate)
			protected.Use(playerRateLimitMiddleware(rateLimit))
			protected.Get("/game", getGameHandler(service, logger))
			protected.Post("/runs", createRunHandler(service, logger))
			protected.Get("/runs/{id}", getRunHandler(service, logger))
			protected.Post("/runs/{id}/commands", createRunCommandHandler(service, logger))
			protected.Post("/story/choices", createStoryChoiceHandler(service, logger))
		})
	})
}

func getContentHandler(service GameService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		version := chi.URLParam(r, "version")
		if version != gamecontent.CurrentVersion {
			writeError(w, r, http.StatusNotFound, "not_found", "The requested content version was not found")
			return
		}
		language := r.URL.Query().Get("locale")
		if language == "" {
			language = responseLanguage(r)
		}
		if language != "zh-CN" && language != "en" {
			writeError(w, r, http.StatusBadRequest, "invalid_request", "The locale must be zh-CN or en")
			return
		}
		etag := fmt.Sprintf("\"%s-%s\"", version, language)
		w.Header().Set("ETag", etag)
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		if r.Header.Get("If-None-Match") == etag {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		writeJSON(w, http.StatusOK, localizeCatalog(service.Catalog(), language))
	}
}

func getGameHandler(service GameService, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		principal, ok := authenticatedPrincipal(w, r)
		if !ok {
			return
		}
		snapshot, err := service.Get(r.Context(), principal.User)
		if err != nil {
			writeV2Error(w, r, logger, "get_game_failed", err)
			return
		}
		writeJSON(w, http.StatusOK, mapGameSnapshot(snapshot))
	}
}

func createRunHandler(service GameService, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		principal, ok := authenticatedPrincipal(w, r)
		if !ok {
			return
		}
		key, ok := validatedIdempotencyKey(w, r)
		if !ok {
			return
		}
		var request createRunRequest
		if !decodeRequest(w, r, &request) {
			return
		}
		if request.Mode == "" {
			request.Mode = gameRun.CampaignMode
		}
		if (request.Mode != gameRun.CampaignMode && request.Mode != gameRun.DailyMode) || (request.Mode == gameRun.CampaignMode && (!validSlugValue(request.ChapterSlug) || !validSlugValue(request.CharacterSlug))) || request.NoiseLevel < 0 || request.NoiseLevel > 3 {
			writeError(w, r, http.StatusBadRequest, "invalid_request", "The request is invalid")
			return
		}
		created, replayed, err := service.Start(r.Context(), principal.User, game.StartInput{
			Mode:        request.Mode,
			ChapterSlug: request.ChapterSlug, CharacterSlug: request.CharacterSlug,
			NoiseLevel: request.NoiseLevel, IdempotencyKey: key,
		})
		if err != nil {
			writeV2Error(w, r, logger, "create_run_failed", err)
			return
		}
		w.Header().Set("Idempotency-Replayed", strconv.FormatBool(replayed))
		writeJSON(w, http.StatusCreated, created)
	}
}

func getPublicDailyResultHandler(service GameService, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		runID := chi.URLParam(r, "id")
		if !resourceIDPattern.MatchString(runID) {
			writeError(w, r, http.StatusNotFound, "not_found", "The requested resource was not found")
			return
		}
		result, err := service.GetPublicDailyResult(r.Context(), runID)
		if err != nil {
			writeV2Error(w, r, logger, "daily_result_get_failed", err)
			return
		}
		w.Header().Set("Cache-Control", "public, max-age=300, s-maxage=300, stale-while-revalidate=60")
		writeJSON(w, http.StatusOK, result)
	}
}

func getRunHandler(service GameService, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		principal, ok := authenticatedPrincipal(w, r)
		if !ok {
			return
		}
		runID, ok := validatedRunID(w, r)
		if !ok {
			return
		}
		current, err := service.GetRun(r.Context(), principal.User, runID)
		if err != nil {
			writeV2Error(w, r, logger, "get_run_failed", err)
			return
		}
		writeJSON(w, http.StatusOK, current)
	}
}

func createRunCommandHandler(service GameService, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		principal, ok := authenticatedPrincipal(w, r)
		if !ok {
			return
		}
		runID, ok := validatedRunID(w, r)
		if !ok {
			return
		}
		key, ok := validatedIdempotencyKey(w, r)
		if !ok {
			return
		}
		var request runCommandRequest
		if !decodeRequest(w, r, &request) {
			return
		}
		result, replayed, err := service.Command(r.Context(), principal.User, game.CommandInput{
			RunID: runID, ExpectedVersion: request.ExpectedVersion, IdempotencyKey: key,
			Command: gameRun.Command{
				Type: request.Type, NodeID: request.NodeID, ChoiceSlug: request.ChoiceSlug,
				ModuleSlug: request.ModuleSlug, Operation: request.Operation, Trace: request.Trace,
			},
		})
		if err != nil {
			writeV2Error(w, r, logger, "run_command_failed", err)
			return
		}
		w.Header().Set("Idempotency-Replayed", strconv.FormatBool(replayed))
		writeJSON(w, http.StatusOK, result)
	}
}

func createStoryChoiceHandler(service GameService, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		principal, ok := authenticatedPrincipal(w, r)
		if !ok {
			return
		}
		key, ok := validatedIdempotencyKey(w, r)
		if !ok {
			return
		}
		var request storyChoiceRequest
		if !decodeRequest(w, r, &request) {
			return
		}
		if !validSlugValue(request.SceneSlug) || !validSlugValue(request.OptionSlug) {
			writeError(w, r, http.StatusBadRequest, "invalid_request", "The request is invalid")
			return
		}
		progress, replayed, err := service.ChooseStory(r.Context(), principal.User, game.StoryChoiceInput{
			SceneSlug: request.SceneSlug, OptionSlug: request.OptionSlug,
			ExpectedVersion: request.ExpectedVersion, IdempotencyKey: key,
		})
		if err != nil {
			writeV2Error(w, r, logger, "story_choice_failed", err)
			return
		}
		pending := story.PendingScene(progress, service.Catalog())
		pendingSlug := ""
		if pending != nil {
			pendingSlug = pending.Slug
		}
		w.Header().Set("Idempotency-Replayed", strconv.FormatBool(replayed))
		writeJSON(w, http.StatusOK, map[string]any{
			"progress": mapProgress(progress), "pending_scene_slug": nullableString(pendingSlug),
		})
	}
}

func validatedRunID(w http.ResponseWriter, r *http.Request) (string, bool) {
	value := chi.URLParam(r, "id")
	if !resourceIDPattern.MatchString(value) {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "The request is invalid")
		return "", false
	}
	return value, true
}

func writeV2Error(w http.ResponseWriter, r *http.Request, logger *slog.Logger, event string, err error) {
	switch {
	case errors.Is(err, repository.ErrNotFound):
		writeError(w, r, http.StatusNotFound, "not_found", "The requested resource was not found")
	case errors.Is(err, gameRun.ErrVersionConflict), errors.Is(err, progression.ErrVersionConflict):
		writeError(w, r, http.StatusConflict, "version_conflict", "The authoritative state has changed")
	case errors.Is(err, gameRun.ErrRunNotActive):
		writeError(w, r, http.StatusConflict, "run_not_active", "The run is no longer active")
	case errors.Is(err, gameRun.ErrActiveRunExists):
		writeError(w, r, http.StatusConflict, "active_run_exists", "Resume or abandon the active run first")
	case errors.Is(err, gameRun.ErrIdempotencyConflict), errors.Is(err, progression.ErrIdempotencyConflict):
		writeError(w, r, http.StatusConflict, "idempotency_conflict", "The idempotency key was used for a different request")
	case errors.Is(err, game.ErrStoryRequired):
		writeError(w, r, http.StatusConflict, "story_required", "Resolve the pending story scene first")
	case errors.Is(err, gameRun.ErrContentLocked):
		writeError(w, r, http.StatusForbidden, "content_locked", "The requested chapter, character, or noise level is locked")
	case errors.Is(err, progression.ErrChoiceAlreadyMade), errors.Is(err, progression.ErrSceneNotPending):
		writeError(w, r, http.StatusConflict, "story_conflict", "The story choice is no longer pending")
	case errors.Is(err, gameRun.ErrInvalidCommand),
		errors.Is(err, action.ErrInvalidTrace),
		errors.Is(err, action.ErrIncompleteRoom),
		strings.HasPrefix(err.Error(), "action:"):
		writeError(w, r, http.StatusBadRequest, "invalid_command", "The command is invalid for the current state")
	default:
		logger.ErrorContext(r.Context(), event, "request_id", requestIDFromContext(r.Context()), "error_class", "internal")
		writeError(w, r, http.StatusInternalServerError, "internal_error", "An internal error occurred")
	}
}
