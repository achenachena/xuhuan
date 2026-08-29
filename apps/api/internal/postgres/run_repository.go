package postgres

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
	"github.com/achenachena/xuhuan/apps/api/internal/progression"
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
			State: input.State, Status: gameRun.Active, Version: 1, Mode: input.Mode, DailyDate: input.DailyDate,
		}
		if created.Mode == "" {
			created.Mode = gameRun.CampaignMode
		}
		err = tx.QueryRow(ctx, `
			INSERT INTO runs (
				player_id, content_version, chapter_slug, character_slug, noise_level,
				seed, state, start_idempotency_key, start_request_hash,run_mode,daily_date
			) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9,$10,$11::date)
			ON CONFLICT (player_id, start_idempotency_key) DO NOTHING
			RETURNING id::text, created_at, updated_at`,
			input.PlayerID, input.ContentVersion, input.State.ChapterSlug, input.State.CharacterSlug,
			input.State.NoiseLevel, input.Seed, stateJSON, input.IdempotencyKey, input.RequestHash[:], created.Mode, input.DailyDate,
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
		if isUniqueViolation(err, "runs_one_active_mode_idx") {
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

func (repository *RunRepository) GetActive(ctx context.Context, playerID string, mode gameRun.Mode) (*gameRun.GameRun, error) {
	result, err := scanRun(repository.database.pool.QueryRow(ctx, runSelectSQL+`
		WHERE r.player_id = $1::uuid AND r.status = 'active' AND r.run_mode=$2`, playerID, mode))
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
	var cleared *gameRun.Event
	trust, authenticity, retention := 0, 0, 0
	for _, event := range events {
		if event.Kind == "story_scene_ready" && event.SceneSlug != "" {
			flags["scene:"+event.SceneSlug+":pending"] = true
		}
		if event.ChoiceTag != "" {
			flags[event.ChoiceTag] = true
		}
		if event.Kind == "chapter_cleared" {
			copy := event
			cleared = &copy
			flags["chapter:"+event.ChapterSlug+":cleared"] = true
			if event.ChapterSlug == "zero-channel" {
				flags["finale-cleared"] = true
			}
		}
		if event.Kind == "emergency_reconnect_used" {
			flags["emergency-reconnect-used"] = true
		}
		if event.Kind == "tutorial_completed" {
			flags["action-tutorial-completed"] = true
		}
		trust += event.Trust
		authenticity += event.Authenticity
		retention += event.Retention
	}
	// Daily runs are deliberately isolated from the campaign projection. They
	// may reuse a chapter and emit the same chapter_cleared event, but must never
	// unlock chapters, consume the one-time reconnect, or change story metrics.
	if current.Mode == gameRun.DailyMode {
		if cleared == nil {
			return nil
		}
		buildJSON, err := json.Marshal(map[string]any{"modules": current.State.Modules, "plugins": current.State.Plugins})
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `
			INSERT INTO daily_results(player_id,daily_date,run_id,character_slug,score,build,streak,completed_at)
			VALUES(
				$1::uuid,$2::date,$3::uuid,$4,$5,$6,
				COALESCE((SELECT previous.streak+1 FROM daily_results previous WHERE previous.player_id=$1::uuid AND previous.daily_date=$2::date-1),1),
				now()
			)
			ON CONFLICT(player_id,daily_date) DO UPDATE SET
				run_id=CASE WHEN EXCLUDED.score>daily_results.score THEN EXCLUDED.run_id ELSE daily_results.run_id END,
				character_slug=CASE WHEN EXCLUDED.score>daily_results.score THEN EXCLUDED.character_slug ELSE daily_results.character_slug END,
				score=GREATEST(daily_results.score,EXCLUDED.score),
				build=CASE WHEN EXCLUDED.score>daily_results.score THEN EXCLUDED.build ELSE daily_results.build END,
				completed_at=CASE WHEN EXCLUDED.score>daily_results.score THEN EXCLUDED.completed_at ELSE daily_results.completed_at END`,
			current.PlayerID, current.DailyDate, current.ID, current.State.CharacterSlug, current.State.Score, buildJSON)
		return err
	}
	nextChapter := ""
	clearedChapter := ""
	if cleared != nil {
		clearedChapter = cleared.ChapterSlug
		nextChapter = cleared.NextChapterSlug
		if cleared.NextChapterSlug == "zero-channel" {
			flags["finale-unlocked"] = true
		}
	}
	if len(flags) == 0 && cleared == nil && trust == 0 && authenticity == 0 && retention == 0 {
		return nil
	}
	flagsJSON, err := json.Marshal(flags)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		UPDATE player_campaign_progress SET
			story_flags = story_flags || $2::jsonb,
			trust=trust+$3,authenticity=authenticity+$4,retention=retention+$5,
			current_chapter_slug=CASE
				WHEN $6<>'' AND current_chapter_slug=$7 THEN $6
				ELSE current_chapter_slug
			END,
			version = version + 1,
			updated_at = now()
		WHERE player_id = $1::uuid`, current.PlayerID, flagsJSON, trust, authenticity, retention, nextChapter, clearedChapter)
	if err != nil {
		return err
	}
	if cleared == nil {
		return nil
	}
	if _, err = tx.Exec(ctx, `INSERT INTO player_chapter_progress(player_id,chapter_slug,highest_noise_level,clears,best_score) VALUES($1::uuid,$2,LEAST(3,$3+1),1,$4) ON CONFLICT(player_id,chapter_slug) DO UPDATE SET highest_noise_level=GREATEST(player_chapter_progress.highest_noise_level,EXCLUDED.highest_noise_level),clears=player_chapter_progress.clears+1,best_score=GREATEST(player_chapter_progress.best_score,EXCLUDED.best_score),updated_at=now()`, current.PlayerID, cleared.ChapterSlug, current.State.NoiseLevel, current.State.Score); err != nil {
		return err
	}
	if cleared.NextCharacterSlug != "" {
		catalog, loadErr := gamecontent.Load(current.ContentVersion)
		if loadErr != nil {
			return loadErr
		}
		if err = grantUnlocks(ctx, tx, current.PlayerID, progression.ChapterClearUnlocks(catalog, cleared.NextCharacterSlug)); err != nil {
			return err
		}
	}
	if cleared.NextChapterSlug != "" {
		_, err = tx.Exec(ctx, `INSERT INTO player_chapter_progress(player_id,chapter_slug) VALUES($1::uuid,$2) ON CONFLICT DO NOTHING`, current.PlayerID, cleared.NextChapterSlug)
	}
	return err
}

func scanRun(row rowScanner) (gameRun.GameRun, error) {
	var result gameRun.GameRun
	var stateJSON []byte
	var outcome *string
	values := []any{
		&result.ID, &result.PlayerID, &result.ContentVersion, &result.Seed, &stateJSON, &result.Mode, &result.DailyDate,
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
	r.id::text, r.player_id::text, r.content_version, r.seed, r.state,r.run_mode,r.daily_date::text,
	r.status, r.outcome, r.version, r.created_at, r.updated_at, r.completed_at
	FROM runs r `

func isUniqueViolation(err error, constraint string) bool {
	var pgError *pgconn.PgError
	return errors.As(err, &pgError) && pgError.Code == "23505" && pgError.ConstraintName == constraint
}

func (repository *RunRepository) GetDailyResult(ctx context.Context, playerID, date string) (*gameRun.DailyResult, error) {
	result, err := scanDailyResult(repository.database.pool.QueryRow(ctx, `
		SELECT daily_date::text,character_slug,score,build,streak,completed_at
		FROM daily_results WHERE player_id=$1::uuid AND daily_date=$2::date`, playerID, date))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &result, nil
}

func scanDailyResult(row rowScanner) (gameRun.DailyResult, error) {
	var result gameRun.DailyResult
	var buildJSON []byte
	if err := row.Scan(&result.Date, &result.CharacterSlug, &result.Score, &buildJSON, &result.Streak, &result.CompletedAt); err != nil {
		return gameRun.DailyResult{}, err
	}
	var build struct {
		Modules []gameRun.ModuleLevel `json:"modules"`
		Plugins []string              `json:"plugins"`
	}
	if err := json.Unmarshal(buildJSON, &build); err != nil {
		return gameRun.DailyResult{}, err
	}
	result.Modules, result.Plugins = build.Modules, build.Plugins
	if result.Modules == nil {
		result.Modules = []gameRun.ModuleLevel{}
	}
	if result.Plugins == nil {
		result.Plugins = []string{}
	}
	return result, nil
}

func (repository *RunRepository) GetPublicDailyResult(ctx context.Context, runID string) (gameRun.DailyResult, error) {
	result, err := scanDailyResult(repository.database.pool.QueryRow(ctx, `
		SELECT best.daily_date::text,best.character_slug,best.score,best.build,best.streak,best.completed_at
		FROM runs requested
		JOIN daily_results best
			ON best.player_id=requested.player_id AND best.daily_date=requested.daily_date
		WHERE requested.id=$1::uuid
			AND requested.run_mode='daily'
			AND requested.status='completed'
			AND requested.outcome='cleared'`, runID))
	if errors.Is(err, pgx.ErrNoRows) {
		return gameRun.DailyResult{}, baseRepository.ErrNotFound
	}
	if err != nil {
		return gameRun.DailyResult{}, err
	}
	return result, nil
}

var _ gameRun.Repository = (*RunRepository)(nil)
