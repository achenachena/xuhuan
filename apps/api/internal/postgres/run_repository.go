package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"time"

	"github.com/achenachena/xuhuan/apps/api/internal/progression"
	baseRepository "github.com/achenachena/xuhuan/apps/api/internal/repository"
	gameRun "github.com/achenachena/xuhuan/apps/api/internal/run"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type RunRepository struct{ database *Database }

func NewRunRepository(database *Database) *RunRepository { return &RunRepository{database: database} }

func (repository *RunRepository) Create(ctx context.Context, input gameRun.CreateInput) (created gameRun.GameRun, replayed bool, err error) {
	err = repository.database.inTransaction(ctx, func(tx pgx.Tx) error {
		var storedPayload []byte
		storedErr := tx.QueryRow(ctx, `SELECT start_request_payload FROM runs WHERE player_id=$1::uuid AND start_idempotency_key=$2`, input.PlayerID, input.IdempotencyKey).Scan(&storedPayload)
		if storedErr == nil {
			if !sameStartRequest(storedPayload, input.Request) {
				return gameRun.ErrIdempotencyConflict
			}
			stored, readErr := scanRun(tx.QueryRow(ctx, runSelectSQL+` WHERE r.player_id=$1::uuid AND r.start_idempotency_key=$2`, input.PlayerID, input.IdempotencyKey))
			if readErr != nil {
				return readErr
			}
			created, replayed = stored, true
			return nil
		}
		if !errors.Is(storedErr, pgx.ErrNoRows) {
			return storedErr
		}
		stateJSON, err := json.Marshal(input.State)
		if err != nil {
			return err
		}
		requestJSON, err := json.Marshal(input.Request)
		if err != nil {
			return err
		}
		created = gameRun.GameRun{PlayerID: input.PlayerID, ContentVersion: input.ContentVersion, Seed: input.Seed, State: input.State, Status: gameRun.Active, Version: 1, Mode: input.Mode, DailyDate: input.DailyDate}
		err = tx.QueryRow(ctx, `
			INSERT INTO runs(player_id,content_version,chapter_slug,character_slug,seed,state,start_idempotency_key,run_mode,daily_date,encore_level,start_request_payload)
			VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9::date,$10,$11)
			ON CONFLICT(player_id,start_idempotency_key) DO NOTHING
			RETURNING id::text,created_at,updated_at`,
			input.PlayerID, input.ContentVersion, input.State.ChapterSlug, input.State.CharacterSlug,
			input.Seed, stateJSON, input.IdempotencyKey, input.Mode, input.DailyDate,
			input.State.EncoreLevel, requestJSON,
		).Scan(&created.ID, &created.CreatedAt, &created.UpdatedAt)
		if errors.Is(err, pgx.ErrNoRows) {
			var concurrentPayload []byte
			if err := tx.QueryRow(ctx, `SELECT start_request_payload FROM runs WHERE player_id=$1::uuid AND start_idempotency_key=$2`, input.PlayerID, input.IdempotencyKey).Scan(&concurrentPayload); err != nil {
				return err
			}
			if !sameStartRequest(concurrentPayload, input.Request) {
				return gameRun.ErrIdempotencyConflict
			}
			stored, readErr := scanRun(tx.QueryRow(ctx, runSelectSQL+` WHERE r.player_id=$1::uuid AND r.start_idempotency_key=$2`, input.PlayerID, input.IdempotencyKey))
			if readErr != nil {
				return readErr
			}
			created, replayed = stored, true
			return nil
		}
		if isUniqueViolation(err, "runs_one_active_mode_idx") {
			return gameRun.ErrActiveRunExists
		}
		return err
	})
	return created, replayed, err
}

func sameStartRequest(payload []byte, request gameRun.StartRequest) bool {
	var stored gameRun.StartRequest
	return json.Unmarshal(payload, &stored) == nil && reflect.DeepEqual(stored, request)
}

func (repository *RunRepository) Get(ctx context.Context, playerID, runID string) (gameRun.GameRun, error) {
	result, err := scanRun(repository.database.pool.QueryRow(ctx, runSelectSQL+` WHERE r.id=$1::uuid AND r.player_id=$2::uuid`, runID, playerID))
	if errors.Is(err, pgx.ErrNoRows) {
		return gameRun.GameRun{}, baseRepository.ErrNotFound
	}
	return result, err
}

func (repository *RunRepository) GetActive(ctx context.Context, playerID string, mode gameRun.Mode) (*gameRun.GameRun, error) {
	result, err := scanRun(repository.database.pool.QueryRow(ctx, runSelectSQL+` WHERE r.player_id=$1::uuid AND r.status='active' AND r.run_mode=$2`, playerID, mode))
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
		current, err := scanRun(tx.QueryRow(ctx, runSelectSQL+` WHERE r.id=$1::uuid AND r.player_id=$2::uuid FOR UPDATE OF r`, input.RunID, input.PlayerID))
		if errors.Is(err, pgx.ErrNoRows) {
			return baseRepository.ErrNotFound
		}
		if err != nil {
			return err
		}
		var storedPayload, storedSnapshot []byte
		var storedExpected int64
		err = tx.QueryRow(ctx, `SELECT command_payload,result_snapshot,expected_version FROM run_commands WHERE run_id=$1::uuid AND idempotency_key=$2`, input.RunID, input.IdempotencyKey).Scan(&storedPayload, &storedSnapshot, &storedExpected)
		if err == nil {
			var storedCommand gameRun.Command
			if json.Unmarshal(storedPayload, &storedCommand) != nil || storedExpected != input.ExpectedVersion || !reflect.DeepEqual(storedCommand, input.Command) {
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
		current.State, current.Version, current.UpdatedAt = resolution.State, current.Version+1, now
		var outcomeValue, completedAt any
		if outcome != nil {
			outcomeValue, completedAt, current.Outcome, current.CompletedAt = string(*outcome), now, outcome, &now
			if *outcome == gameRun.Quit {
				current.Status = gameRun.Abandoned
			} else {
				current.Status = gameRun.Completed
			}
		}
		if err := tx.QueryRow(ctx, `UPDATE runs SET state=$2,status=$3,outcome=$4,version=version+1,updated_at=now(),completed_at=$5 WHERE id=$1::uuid RETURNING updated_at,completed_at`, current.ID, stateJSON, current.Status, outcomeValue, completedAt).Scan(&current.UpdatedAt, &current.CompletedAt); err != nil {
			return err
		}
		if err := updateProgressFromRunEvents(ctx, tx, current, input, resolution.Events); err != nil {
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
			INSERT INTO run_commands(run_id,player_id,sequence,command_type,expected_version,resulting_version,idempotency_key,command_payload,result_snapshot)
			VALUES($1::uuid,$2::uuid,$3,$4,$5::bigint,$5::bigint+1,$6,$7,$8)`,
			current.ID, input.PlayerID, input.ExpectedVersion, input.Command.Type, input.ExpectedVersion, input.IdempotencyKey, commandPayload, snapshot)
		return err
	})
	return response, replayed, err
}

func updateProgressFromRunEvents(ctx context.Context, tx pgx.Tx, current gameRun.GameRun, input gameRun.ApplyInput, events []gameRun.Event) error {
	if current.Mode == gameRun.DailyMode {
		for _, event := range events {
			if event.Kind != "chapter_cleared" {
				continue
			}
			buildJSON, err := json.Marshal(map[string]any{"show_effects": current.State.ShowEffects, "companion_slugs": current.State.CompanionSlugs})
			if err != nil {
				return err
			}
			_, err = tx.Exec(ctx, `
				INSERT INTO daily_results(player_id,daily_date,run_id,character_slug,score,build,streak,completed_at)
				VALUES($1::uuid,$2::date,$3::uuid,$4,$5,$6,COALESCE((SELECT streak+1 FROM daily_results WHERE player_id=$1::uuid AND daily_date=$2::date-1),1),now())
				ON CONFLICT(player_id,daily_date) DO UPDATE SET
					run_id=CASE WHEN EXCLUDED.score>daily_results.score THEN EXCLUDED.run_id ELSE daily_results.run_id END,
					character_slug=CASE WHEN EXCLUDED.score>daily_results.score THEN EXCLUDED.character_slug ELSE daily_results.character_slug END,
					score=GREATEST(daily_results.score,EXCLUDED.score),
					build=CASE WHEN EXCLUDED.score>daily_results.score THEN EXCLUDED.build ELSE daily_results.build END,
					completed_at=CASE WHEN EXCLUDED.score>daily_results.score THEN EXCLUDED.completed_at ELSE daily_results.completed_at END`,
				current.PlayerID, current.DailyDate, current.ID, current.State.CharacterSlug, current.State.Score, buildJSON)
			return err
		}
		return nil
	}
	for _, event := range events {
		switch event.Kind {
		case "intermission_replied", "ending_chosen":
			if err := recordStoryChoice(ctx, tx, current.PlayerID, input.IdempotencyKey, event); err != nil {
				return err
			}
		case "chapter_cleared":
			if err := recordChapterClear(ctx, tx, current, event); err != nil {
				return err
			}
		}
	}
	return nil
}

func recordStoryChoice(ctx context.Context, tx pgx.Tx, playerID, idempotencyKey string, event gameRun.Event) error {
	progress, err := readProgress(ctx, tx, playerID, true)
	if err != nil {
		return err
	}
	var revision int
	if err := tx.QueryRow(ctx, `SELECT COALESCE(MAX(revision),0)+1 FROM story_choices WHERE player_id=$1::uuid AND scene_slug=$2`, playerID, event.SceneID).Scan(&revision); err != nil {
		return err
	}
	flags := projectStoryFlags(progress, event.SceneID, event.ChoiceTag)
	flagsJSON, err := json.Marshal(flags)
	if err != nil {
		return err
	}
	var updatedAt time.Time
	if err := tx.QueryRow(ctx, `UPDATE player_campaign_progress SET story_flags=$2::jsonb,version=version+1,updated_at=now() WHERE player_id=$1::uuid RETURNING updated_at`, playerID, flagsJSON).Scan(&updatedAt); err != nil {
		return err
	}
	progress.Version++
	progress.UpdatedAt = updatedAt
	progress.StoryFlags = flags
	progress.Choices = append(progress.Choices, progression.Choice{SceneSlug: event.SceneID, OptionSlug: event.ChoiceID, ChoiceTag: event.ChoiceTag, Revision: revision, CreatedAt: updatedAt})
	snapshot, err := json.Marshal(progress)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO story_choices(player_id,scene_slug,option_slug,choice_tag,expected_version,resulting_version,idempotency_key,result_snapshot,revision)
		VALUES($1::uuid,$2,$3,$4,$5::bigint,$5::bigint+1,$6,$7,$8)`, playerID, event.SceneID, event.ChoiceID, event.ChoiceTag, progress.Version-1, idempotencyKey, snapshot, revision)
	return err
}

func recordChapterClear(ctx context.Context, tx pgx.Tx, current gameRun.GameRun, event gameRun.Event) error {
	flags := map[string]bool{"chapter:" + event.ChapterSlug + ":cleared": true}
	if event.ChapterSlug == "zero-channel" {
		flags["finale-cleared"] = true
	}
	flagsJSON, err := json.Marshal(flags)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE player_campaign_progress SET story_flags=story_flags||$2::jsonb,
			current_chapter_slug=CASE WHEN $3<>'' AND current_chapter_slug=$4 THEN $3 ELSE current_chapter_slug END,
			ending=CASE WHEN $5<>'' THEN $5 ELSE ending END,daily_unlocked=daily_unlocked OR $5<>'',version=version+1,updated_at=now()
		WHERE player_id=$1::uuid`, current.PlayerID, flagsJSON, event.NextChapterSlug, event.ChapterSlug, event.EndingID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO player_chapter_progress(player_id,chapter_slug,highest_encore_level,clears,best_score)
		VALUES($1::uuid,$2,LEAST(3,$3+1),1,$4)
		ON CONFLICT(player_id,chapter_slug) DO UPDATE SET highest_encore_level=GREATEST(player_chapter_progress.highest_encore_level,EXCLUDED.highest_encore_level),clears=player_chapter_progress.clears+1,best_score=GREATEST(player_chapter_progress.best_score,EXCLUDED.best_score),updated_at=now()`, current.PlayerID, event.ChapterSlug, current.State.EncoreLevel, current.State.Score); err != nil {
		return err
	}
	grants := make([]progression.UnlockGrant, 0, 3)
	if event.CompanionID != "" {
		grants = append(grants, progression.UnlockGrant{Type: progression.CompanionUnlock, ContentSlug: event.CompanionID})
	}
	if event.NextCharacterSlug != "" && event.NextCharacterSlug != "player-choice" {
		grants = append(grants, progression.UnlockGrant{Type: progression.CharacterUnlock, ContentSlug: event.NextCharacterSlug})
	}
	grants = append(grants, progression.UnlockGrant{Type: progression.MemoryClipUnlock, ContentSlug: event.ChapterSlug + "-memory"})
	if err := grantUnlocks(ctx, tx, current.PlayerID, grants); err != nil {
		return err
	}
	if event.NextChapterSlug != "" {
		_, err = tx.Exec(ctx, `INSERT INTO player_chapter_progress(player_id,chapter_slug) VALUES($1::uuid,$2) ON CONFLICT DO NOTHING`, current.PlayerID, event.NextChapterSlug)
	}
	return err
}

func scanRun(row rowScanner) (gameRun.GameRun, error) {
	var result gameRun.GameRun
	var stateJSON []byte
	var outcome *string
	if err := row.Scan(&result.ID, &result.PlayerID, &result.ContentVersion, &result.Seed, &stateJSON, &result.Mode, &result.DailyDate, &result.Status, &outcome, &result.Version, &result.CreatedAt, &result.UpdatedAt, &result.CompletedAt); err != nil {
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

const runSelectSQL = `SELECT r.id::text,r.player_id::text,r.content_version,r.seed,r.state,r.run_mode,r.daily_date::text,r.status,r.outcome,r.version,r.created_at,r.updated_at,r.completed_at FROM runs r `

func isUniqueViolation(err error, constraint string) bool {
	var pgError *pgconn.PgError
	return errors.As(err, &pgError) && pgError.Code == "23505" && pgError.ConstraintName == constraint
}

func (repository *RunRepository) GetDailyResult(ctx context.Context, playerID, date string) (*gameRun.DailyResult, error) {
	result, err := scanDailyResult(repository.database.pool.QueryRow(ctx, `SELECT daily_date::text,character_slug,score,build,streak,completed_at FROM daily_results WHERE player_id=$1::uuid AND daily_date=$2::date`, playerID, date))
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
		ShowEffects    []string `json:"show_effects"`
		CompanionSlugs []string `json:"companion_slugs"`
	}
	if err := json.Unmarshal(buildJSON, &build); err != nil {
		return gameRun.DailyResult{}, err
	}
	result.ShowEffects, result.CompanionSlugs = nonNilStrings(build.ShowEffects), nonNilStrings(build.CompanionSlugs)
	return result, nil
}

func nonNilStrings(values []string) []string {
	if values == nil {
		return []string{}
	}
	return values
}

func (repository *RunRepository) GetPublicDailyResult(ctx context.Context, runID string) (gameRun.DailyResult, error) {
	result, err := scanDailyResult(repository.database.pool.QueryRow(ctx, `
		SELECT best.daily_date::text,best.character_slug,best.score,best.build,best.streak,best.completed_at
		FROM runs requested JOIN daily_results best ON best.player_id=requested.player_id AND best.daily_date=requested.daily_date
		WHERE requested.id=$1::uuid AND requested.run_mode='daily' AND requested.status='completed' AND requested.outcome='cleared'`, runID))
	if errors.Is(err, pgx.ErrNoRows) {
		return gameRun.DailyResult{}, baseRepository.ErrNotFound
	}
	return result, err
}

var _ gameRun.Repository = (*RunRepository)(nil)
