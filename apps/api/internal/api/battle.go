package api

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"

	"github.com/achenachena/xuhuan/apps/api/internal/auth"
	"github.com/achenachena/xuhuan/apps/api/internal/battle"
	"github.com/achenachena/xuhuan/apps/api/internal/platform/observability"
	"github.com/achenachena/xuhuan/apps/api/internal/repository"
	"github.com/go-chi/chi/v5"
)

var (
	battleIDPattern       = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$`)
	idempotencyKeyPattern = regexp.MustCompile(`^[A-Za-z0-9._:-]{8,128}$`)
)

type createBattleRequest struct {
	CharacterSlug string `json:"character_slug"`
	EncounterSlug string `json:"encounter_slug"`
}

type battleActionRequest struct {
	Action          battle.ActionKind `json:"action"`
	ExpectedVersion int64             `json:"expected_version"`
}

func createBattleHandler(service BattleService, logger *slog.Logger, metrics *observability.Metrics) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		principal, ok := authenticatedPrincipal(w, r)
		if !ok {
			return
		}
		key, ok := validatedIdempotencyKey(w, r)
		if !ok {
			return
		}
		var request createBattleRequest
		if !decodeRequest(w, r, &request) {
			return
		}
		if !validSlugValue(request.CharacterSlug) || !validSlugValue(request.EncounterSlug) {
			writeError(w, r, http.StatusBadRequest, "invalid_request", "The request is invalid")
			return
		}
		created, replayed, err := service.Start(r.Context(), principal.User, battle.StartInput{
			CharacterSlug: request.CharacterSlug, EncounterSlug: request.EncounterSlug, IdempotencyKey: key,
		})
		if err != nil {
			recordBattleConflict(r.Context(), metrics, err)
			writeBattleError(w, r, logger, "create_battle_failed", err)
			return
		}
		w.Header().Set("Idempotency-Replayed", strconv.FormatBool(replayed))
		if replayed {
			metrics.IdempotencyReplay(r.Context(), "start")
		} else {
			metrics.BattleStarted(r.Context())
		}
		writeJSON(w, http.StatusCreated, mapBattle(created, responseLanguage(r)))
	}
}

func getBattleHandler(service BattleService, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		principal, ok := authenticatedPrincipal(w, r)
		if !ok {
			return
		}
		battleID, ok := validatedBattleID(w, r)
		if !ok {
			return
		}
		current, err := service.Get(r.Context(), principal.User, battleID)
		if err != nil {
			writeBattleError(w, r, logger, "get_battle_failed", err)
			return
		}
		writeJSON(w, http.StatusOK, mapBattle(current, responseLanguage(r)))
	}
}

func createBattleActionHandler(service BattleService, logger *slog.Logger, metrics *observability.Metrics) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		principal, ok := authenticatedPrincipal(w, r)
		if !ok {
			return
		}
		battleID, ok := validatedBattleID(w, r)
		if !ok {
			return
		}
		key, ok := validatedIdempotencyKey(w, r)
		if !ok {
			return
		}
		var request battleActionRequest
		if !decodeRequest(w, r, &request) {
			return
		}
		result, replayed, err := service.Act(r.Context(), principal.User, battle.ActionInput{
			BattleID: battleID, Action: request.Action, ExpectedVersion: request.ExpectedVersion, IdempotencyKey: key,
		})
		if err != nil {
			recordBattleConflict(r.Context(), metrics, err)
			writeBattleError(w, r, logger, "battle_action_failed", err)
			return
		}
		w.Header().Set("Idempotency-Replayed", strconv.FormatBool(replayed))
		if replayed {
			metrics.IdempotencyReplay(r.Context(), "action")
		} else if result.Battle.Status == battle.Completed && result.Battle.Outcome != nil {
			metrics.BattleCompleted(r.Context(), string(*result.Battle.Outcome))
		}
		writeJSON(w, http.StatusOK, mapBattleAction(result, responseLanguage(r)))
	}
}

func recordBattleConflict(ctx context.Context, metrics *observability.Metrics, err error) {
	switch {
	case errors.Is(err, battle.ErrVersionConflict):
		metrics.BattleConflict(ctx, "version")
	case errors.Is(err, battle.ErrBattleNotActive):
		metrics.BattleConflict(ctx, "not_active")
	case errors.Is(err, battle.ErrInsufficientEnergy):
		metrics.BattleConflict(ctx, "energy")
	case errors.Is(err, battle.ErrIdempotencyConflict):
		metrics.BattleConflict(ctx, "idempotency")
	}
}

func authenticatedPrincipal(w http.ResponseWriter, r *http.Request) (auth.Principal, bool) {
	principal, ok := auth.PrincipalFromContext(r.Context())
	if !ok {
		writeError(w, r, http.StatusUnauthorized, "unauthorized", "Authentication is required")
	}
	return principal, ok
}

func validatedBattleID(w http.ResponseWriter, r *http.Request) (string, bool) {
	value := chi.URLParam(r, "id")
	if !battleIDPattern.MatchString(value) {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "The request is invalid")
		return "", false
	}
	return value, true
}

func validatedIdempotencyKey(w http.ResponseWriter, r *http.Request) (string, bool) {
	value := r.Header.Get("Idempotency-Key")
	if !idempotencyKeyPattern.MatchString(value) {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "A valid Idempotency-Key is required")
		return "", false
	}
	return value, true
}

func decodeRequest(w http.ResponseWriter, r *http.Request, destination any) bool {
	if err := decodeJSON(w, r, destination); err != nil {
		var maxBytesError *http.MaxBytesError
		if errors.As(err, &maxBytesError) {
			writeError(w, r, http.StatusRequestEntityTooLarge, "payload_too_large", "The request body is too large")
			return false
		}
		writeError(w, r, http.StatusBadRequest, "invalid_request", "The request is invalid")
		return false
	}
	return true
}

func validSlugValue(value string) bool {
	return len(value) <= 64 && slugPattern.MatchString(value)
}

func writeBattleError(w http.ResponseWriter, r *http.Request, logger *slog.Logger, event string, err error) {
	switch {
	case errors.Is(err, repository.ErrNotFound):
		writeError(w, r, http.StatusNotFound, "not_found", "The requested resource was not found")
	case errors.Is(err, battle.ErrVersionConflict):
		writeError(w, r, http.StatusConflict, "version_conflict", "The battle state has changed")
	case errors.Is(err, battle.ErrBattleNotActive):
		writeError(w, r, http.StatusConflict, "battle_not_active", "The battle is no longer active")
	case errors.Is(err, battle.ErrInsufficientEnergy):
		writeError(w, r, http.StatusConflict, "insufficient_energy", "The player does not have enough energy")
	case errors.Is(err, battle.ErrIdempotencyConflict):
		writeError(w, r, http.StatusConflict, "idempotency_conflict", "The idempotency key was used for a different request")
	case errors.Is(err, battle.ErrInvalidAction), errors.Is(err, battle.ErrInsufficientMeter):
		writeError(w, r, http.StatusBadRequest, "invalid_action", "The battle action is invalid")
	default:
		logger.ErrorContext(r.Context(), event, "request_id", requestIDFromContext(r.Context()), "error", err)
		writeError(w, r, http.StatusInternalServerError, "internal_error", "An internal error occurred")
	}
}
