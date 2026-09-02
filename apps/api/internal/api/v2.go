package api

import (
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"

	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
	"github.com/achenachena/xuhuan/apps/api/internal/game"
	"github.com/achenachena/xuhuan/apps/api/internal/progression"
	"github.com/achenachena/xuhuan/apps/api/internal/repository"
	gameRun "github.com/achenachena/xuhuan/apps/api/internal/run"
	"github.com/go-chi/chi/v5"
)

type createRunRequest struct {
	Mode          gameRun.Mode `json:"mode"`
	ChapterSlug   string       `json:"chapter_slug,omitempty"`
	CharacterSlug string       `json:"character_slug,omitempty"`
	CompanionSlug string       `json:"companion_slug,omitempty"`
	EncoreLevel   int          `json:"encore_level,omitempty"`
}

type runCommandRequest struct {
	Type            gameRun.CommandType     `json:"type"`
	ExpectedVersion int64                   `json:"expected_version"`
	OptionID        string                  `json:"option_id,omitempty"`
	SceneID         string                  `json:"scene_id,omitempty"`
	SegmentOutcome  *gameRun.SegmentOutcome `json:"segment_outcome,omitempty"`
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
		if !validSlugValue(request.SceneSlug) || !validSlugValue(request.OptionSlug) || request.ExpectedVersion < 1 {
			writeError(w, r, http.StatusBadRequest, "invalid_request", "The request is invalid")
			return
		}
		progress, replayed, err := service.ChooseStory(r.Context(), principal.User, game.StoryChoiceInput{SceneSlug: request.SceneSlug, OptionSlug: request.OptionSlug, ExpectedVersion: request.ExpectedVersion, IdempotencyKey: key})
		if err != nil {
			writeV2Error(w, r, logger, "story_choice_failed", err)
			return
		}
		w.Header().Set("Idempotency-Replayed", strconv.FormatBool(replayed))
		writeJSON(w, http.StatusOK, map[string]any{"progress": mapProgress(progress)})
	}
}

func getContentHandler(service GameService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		version := chi.URLParam(r, "version")
		if version != gamecontent.V4Version {
			writeError(w, r, http.StatusNotFound, "not_found", "The requested content version was not found")
			return
		}
		locale := r.URL.Query().Get("locale")
		if locale == "" {
			locale = responseLanguage(r)
		}
		if locale != "en" && locale != "zh-CN" {
			writeError(w, r, http.StatusBadRequest, "invalid_request", "The locale must be en or zh-CN")
			return
		}
		etag := fmt.Sprintf("\"%s-%s\"", version, locale)
		w.Header().Set("ETag", etag)
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		if r.Header.Get("If-None-Match") == etag {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		writeJSON(w, http.StatusOK, service.Catalog().Localized(locale))
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
		valid := request.Mode == gameRun.DailyMode || request.Mode == gameRun.CampaignMode && validSlugValue(request.ChapterSlug) && validSlugValue(request.CharacterSlug) && (request.CompanionSlug == "" || validSlugValue(request.CompanionSlug)) && request.EncoreLevel >= 0 && request.EncoreLevel <= 3
		if request.Mode == gameRun.DailyMode && (request.ChapterSlug != "" || request.CharacterSlug != "" || request.CompanionSlug != "" || request.EncoreLevel != 0) {
			valid = false
		}
		if !valid {
			writeError(w, r, http.StatusBadRequest, "invalid_request", "The request is invalid")
			return
		}
		created, replayed, err := service.Start(r.Context(), principal.User, game.StartInput{Mode: request.Mode, ChapterSlug: request.ChapterSlug, CharacterSlug: request.CharacterSlug, CompanionSlug: request.CompanionSlug, EncoreLevel: request.EncoreLevel, IdempotencyKey: key})
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
		if !validRunCommandRequest(request) {
			writeError(w, r, http.StatusBadRequest, "invalid_request", "The request is invalid")
			return
		}
		result, replayed, err := service.Command(r.Context(), principal.User, game.CommandInput{
			RunID: runID, ExpectedVersion: request.ExpectedVersion, IdempotencyKey: key,
			Command: gameRun.Command{Type: request.Type, OptionID: request.OptionID, SceneID: request.SceneID, SegmentOutcome: request.SegmentOutcome},
		})
		if err != nil {
			writeV2Error(w, r, logger, "run_command_failed", err)
			return
		}
		w.Header().Set("Idempotency-Replayed", strconv.FormatBool(replayed))
		writeJSON(w, http.StatusOK, result)
	}
}

func validRunCommandRequest(request runCommandRequest) bool {
	if request.ExpectedVersion < 1 {
		return false
	}
	switch request.Type {
	case gameRun.CompleteSegment:
		return request.SegmentOutcome != nil &&
			request.SegmentOutcome.Health >= 0 && request.SegmentOutcome.Health <= 3 &&
			request.SegmentOutcome.Score >= 0 && request.SegmentOutcome.Score <= 1_000_000 &&
			(!request.SegmentOutcome.Won || request.SegmentOutcome.Health > 0) &&
			request.OptionID == "" && request.SceneID == ""
	case gameRun.ChooseShowOption:
		return request.SegmentOutcome == nil && validSlugValue(request.OptionID) && request.SceneID == ""
	case gameRun.ChooseIntermissionReply:
		return request.SegmentOutcome == nil && validSlugValue(request.OptionID) && validSlugValue(request.SceneID)
	case gameRun.AbandonRun:
		return request.SegmentOutcome == nil && request.OptionID == "" && request.SceneID == ""
	default:
		return false
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
	case errors.Is(err, gameRun.ErrContentLocked):
		writeError(w, r, http.StatusForbidden, "content_locked", "The requested chapter, character, or Encore level is locked")
	case errors.Is(err, progression.ErrSceneNotFound):
		writeError(w, r, http.StatusNotFound, "story_not_found", "The story scene or option was not found")
	case errors.Is(err, gameRun.ErrInvalidCommand):
		writeError(w, r, http.StatusBadRequest, "invalid_command", "The command is invalid for the current state")
	default:
		logger.ErrorContext(r.Context(), event, "request_id", requestIDFromContext(r.Context()), "error_class", "internal")
		writeError(w, r, http.StatusInternalServerError, "internal_error", "An internal error occurred")
	}
}
