package postgres

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	baseRepository "github.com/achenachena/xuhuan/apps/api/internal/repository"
	gameRun "github.com/achenachena/xuhuan/apps/api/internal/run"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type RunRepository struct {
	database *Database
}

func NewRunRepository(database *Database) *RunRepository {
	return &RunRepository{database: database}
}

func (repository *RunRepository) Create(ctx context.Context, input gameRun.CreateInput) (created gameRun.GameRun, replayed bool, err error) {
	err = repository.database.inTransaction(ctx, func(tx pgx.Tx) error {
		var storedHash []byte
		storedErr := tx.QueryRow(ctx, `
			SELECT start_request_hash FROM runs
			WHERE player_id = $1::uuid AND start_idempotency_key = $2`, input.PlayerID, input.IdempotencyKey).Scan(&storedHash)
		if storedErr == nil {
			if !bytes.Equal(storedHash, input.RequestHash[:]) {
				return gameRun.ErrIdempotencyConflict
			}
			stored, err := scanRun(tx.QueryRow(ctx, runSelectSQL+`
				WHERE r.player_id = $1::uuid AND r.start_idempotency_key = $2`, input.PlayerID, input.IdempotencyKey))
			if err != nil {
				return err
			}
			created = stored
			replayed = true
			return nil
		}
		if !errors.Is(storedErr, pgx.ErrNoRows) {
			return storedErr
		}
		stateJSON, err := json.Marshal(input.State)
		if err != nil {
			return err
		}
		created = gameRun.GameRun{
			PlayerID: input.PlayerID, ContentVersion: input.ContentVersion, Seed: input.Seed,
			State: input.State, Status: gameRun.Active, Version: 1,
		}
		err = tx.QueryRow(ctx, `
			INSERT INTO runs (
				player_id, content_version, chapter_slug, character_slug, noise_level,
				seed, state, start_idempotency_key, start_request_hash
			) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9)
			ON CONFLICT (player_id, start_idempotency_key) DO NOTHING
			RETURNING id::text, created_at, updated_at`,
			input.PlayerID, input.ContentVersion, input.State.ChapterSlug, input.State.CharacterSlug,
			input.State.NoiseLevel, input.Seed, stateJSON, input.IdempotencyKey, input.RequestHash[:],
		).Scan(&created.ID, &created.CreatedAt, &created.UpdatedAt)
		if errors.Is(err, pgx.ErrNoRows) {
			var concurrentHash []byte
			if err := tx.QueryRow(ctx, `
				SELECT start_request_hash FROM runs
				WHERE player_id = $1::uuid AND start_idempotency_key = $2`, input.PlayerID, input.IdempotencyKey,
			).Scan(&concurrentHash); err != nil {
				return err
			}
			if !bytes.Equal(concurrentHash, input.RequestHash[:]) {
				return gameRun.ErrIdempotencyConflict
			}
			stored, err := scanRun(tx.QueryRow(ctx, runSelectSQL+`
				WHERE r.player_id = $1::uuid AND r.start_idempotency_key = $2`, input.PlayerID, input.IdempotencyKey))
			if err != nil {
				return err
			}
			created = stored
			replayed = true
			return nil
		}
		if isUniqueViolation(err, "runs_one_active_player_idx") {
			return gameRun.ErrActiveRunExists
		}
		return err
	})
	return created, replayed, err
}

func (repository *RunRepository) Get(ctx context.Context, playerID, runID string) (gameRun.GameRun, error) {
	result, err := scanRun(repository.database.pool.QueryRow(ctx, runSelectSQL+`
		WHERE r.id = $1::uuid AND r.player_id = $2::uuid`, runID, playerID))
	if errors.Is(err, pgx.ErrNoRows) {
		return gameRun.GameRun{}, baseRepository.ErrNotFound
	}
	return result, err
}

func (repository *RunRepository) GetActive(ctx context.Context, playerID string) (*gameRun.GameRun, error) {
	result, err := scanRun(repository.database.pool.QueryRow(ctx, runSelectSQL+`
		WHERE r.player_id = $1::uuid AND r.status = 'active'`, playerID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &result, nil
}

func (repository *RunRepository) Apply(ctx context.Context, input gameRun.ApplyInput, resolve gameRun.Resolver) (response gameRun.CommandResponse, replayed bool, err error) {
	err = repository.database.inTransaction(ctx, func(tx pgx.Tx) error {
		current, err := scanRun(tx.QueryRow(ctx, runSelectSQL+`
			WHERE r.id = $1::uuid AND r.player_id = $2::uuid FOR UPDATE OF r`, input.RunID, input.PlayerID))
		if errors.Is(err, pgx.ErrNoRows) {
			return baseRepository.ErrNotFound
		}
		if err != nil {
			return err
		}
		var storedHash []byte
		var storedSnapshot []byte
		err = tx.QueryRow(ctx, `
			SELECT request_hash, result_snapshot FROM run_commands
			WHERE run_id = $1::uuid AND idempotency_key = $2`, input.RunID, input.IdempotencyKey,
		).Scan(&storedHash, &storedSnapshot)
		if err == nil {
			if !bytes.Equal(storedHash, input.RequestHash[:]) {
				return gameRun.ErrIdempotencyConflict
			}
			if err := json.Unmarshal(storedSnapshot, &response); err != nil {
				return err
			}
			replayed = true
			return nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		if current.Status != gameRun.Active {
			return gameRun.ErrRunNotActive
		}
		if current.Version != input.ExpectedVersion {
			return gameRun.ErrVersionConflict
		}
		resolution, outcome, err := resolve(current, input.Command)
		if err != nil {
			return err
		}
		stateJSON, err := json.Marshal(resolution.State)
		if err != nil {
			return err
		}
		now := time.Now().UTC()
		current.State = resolution.State
		current.Version++
		current.UpdatedAt = now
		var outcomeValue any
		var completedAt any
		if outcome != nil {
			outcomeValue = string(*outcome)
			completedAt = now
			current.Outcome = outcome
			current.CompletedAt = &now
			if *outcome == gameRun.Quit {
				current.Status = gameRun.Abandoned
			} else {
				current.Status = gameRun.Completed
			}
		}
		if err := tx.QueryRow(ctx, `
			UPDATE runs SET state = $2, status = $3, outcome = $4,
				version = version + 1, updated_at = now(), completed_at = $5
			WHERE id = $1::uuid
			RETURNING updated_at, completed_at`,
			current.ID, stateJSON, current.Status, outcomeValue, completedAt,
		).Scan(&current.UpdatedAt, &current.CompletedAt); err != nil {
			return err
		}
		if err := updateProgressFromRunEvents(ctx, tx, current, resolution.Events); err != nil {
			return err
		}
		response = gameRun.CommandResponse{Run: current, Events: resolution.Events}
		snapshot, err := json.Marshal(response)
		if err != nil {
			return err
		}
		commandPayload, err := json.Marshal(input.Command)
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `
			INSERT INTO run_commands (
				run_id, player_id, sequence, command_type, expected_version,
				resulting_version, idempotency_key, request_hash, command_payload, result_snapshot
			) VALUES ($1::uuid, $2::uuid, $3, $4, $5::bigint, $5::bigint + 1, $6, $7, $8, $9)`,
			current.ID, input.PlayerID, input.ExpectedVersion, input.Command.Type,
			input.ExpectedVersion, input.IdempotencyKey, input.RequestHash[:], commandPayload, snapshot,
		)
		return err
	})
	return response, replayed, err
}

func updateProgressFromRunEvents(ctx context.Context, tx pgx.Tx, current gameRun.GameRun, events []gameRun.Event) error {
	flags := make(map[string]bool)
	chapterCleared := false
	for _, event := range events {
		if event.ChoiceTag != "" {
			flags[event.ChoiceTag] = true
		}
		if event.Kind == "chapter_cleared" {
			chapterCleared = true
			flags["chapter-one-cleared"] = true
		}
		if event.Kind == "emergency_reconnect_used" {
			flags["emergency-reconnect-used"] = true
		}
		if event.Kind == "tutorial_completed" {
			flags["action-tutorial-completed"] = true
		}
	}
	if len(flags) == 0 && !chapterCleared {
		return nil
	}
	flagsJSON, err := json.Marshal(flags)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		UPDATE player_progress SET
			story_flags = story_flags || $2::jsonb,
			highest_noise_level = CASE WHEN $3
				THEN GREATEST(highest_noise_level, LEAST(3, $4 + 1))
				ELSE highest_noise_level END,
			version = version + 1,
			updated_at = now()
		WHERE player_id = $1::uuid`, current.PlayerID, flagsJSON, chapterCleared, current.State.NoiseLevel)
	return err
}

func scanRun(row rowScanner) (gameRun.GameRun, error) {
	var result gameRun.GameRun
	var stateJSON []byte
	var outcome *string
	values := []any{
		&result.ID, &result.PlayerID, &result.ContentVersion, &result.Seed, &stateJSON,
		&result.Status, &outcome, &result.Version, &result.CreatedAt, &result.UpdatedAt, &result.CompletedAt,
	}
	if err := row.Scan(values...); err != nil {
		return gameRun.GameRun{}, err
	}
	if err := json.Unmarshal(stateJSON, &result.State); err != nil {
		return gameRun.GameRun{}, fmt.Errorf("decode run state: %w", err)
	}
	if outcome != nil {
		value := gameRun.Outcome(*outcome)
		result.Outcome = &value
	}
	return result, nil
}

const runSelectSQL = `SELECT
	r.id::text, r.player_id::text, r.content_version, r.seed, r.state,
	r.status, r.outcome, r.version, r.created_at, r.updated_at, r.completed_at
	FROM runs r `

func isUniqueViolation(err error, constraint string) bool {
	var pgError *pgconn.PgError
	return errors.As(err, &pgError) && pgError.Code == "23505" && pgError.ConstraintName == constraint
}

var _ gameRun.Repository = (*RunRepository)(nil)
