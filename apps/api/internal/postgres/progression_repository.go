package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/achenachena/xuhuan/apps/api/internal/progression"
	"github.com/jackc/pgx/v5"
)

type ProgressionRepository struct {
	database *Database
}

func (repository *ProgressionRepository) Choose(ctx context.Context, input progression.ChooseInput) (result progression.Progress, replayed bool, err error) {
	err = repository.database.inTransaction(ctx, func(tx pgx.Tx) error {
		current, err := readProgress(ctx, tx, input.PlayerID, true)
		if err != nil {
			return err
		}
		var storedScene, storedOption string
		var storedExpected int64
		var storedSnapshot []byte
		err = tx.QueryRow(ctx, `SELECT scene_slug,option_slug,expected_version,result_snapshot FROM story_choices WHERE player_id=$1::uuid AND idempotency_key=$2`, input.PlayerID, input.IdempotencyKey).Scan(&storedScene, &storedOption, &storedExpected, &storedSnapshot)
		if err == nil {
			if storedScene != input.SceneSlug || storedOption != input.OptionSlug || storedExpected != input.ExpectedVersion {
				return progression.ErrIdempotencyConflict
			}
			if err := json.Unmarshal(storedSnapshot, &result); err != nil {
				return err
			}
			replayed = true
			return nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		if current.Version != input.ExpectedVersion {
			return progression.ErrVersionConflict
		}
		revision := 1
		for _, choice := range current.Choices {
			if choice.SceneSlug == input.SceneSlug && choice.Revision >= revision {
				revision = choice.Revision + 1
			}
		}
		flags := projectStoryFlags(current, input.SceneSlug, input.ChoiceTag)
		flagsJSON, err := json.Marshal(flags)
		if err != nil {
			return err
		}
		var updatedAt time.Time
		if err := tx.QueryRow(ctx, `UPDATE player_campaign_progress SET story_flags=$2::jsonb,ending=CASE WHEN $3<>'' THEN $3 ELSE ending END,daily_unlocked=daily_unlocked OR $3<>'',version=version+1,updated_at=now() WHERE player_id=$1::uuid RETURNING updated_at`, input.PlayerID, flagsJSON, input.EndingID).Scan(&updatedAt); err != nil {
			return err
		}
		result = current
		result.Version++
		result.UpdatedAt = updatedAt
		result.StoryFlags = flags
		if input.EndingID != "" {
			result.Ending, result.DailyUnlocked = input.EndingID, true
		}
		result.Choices = append(result.Choices, progression.Choice{SceneSlug: input.SceneSlug, OptionSlug: input.OptionSlug, ChoiceTag: input.ChoiceTag, Revision: revision, CreatedAt: updatedAt})
		snapshot, err := json.Marshal(result)
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `INSERT INTO story_choices(player_id,scene_slug,option_slug,choice_tag,expected_version,resulting_version,idempotency_key,result_snapshot,created_at,revision) VALUES($1::uuid,$2,$3,$4,$5::bigint,$5::bigint+1,$6,$7,$8,$9)`, input.PlayerID, input.SceneSlug, input.OptionSlug, input.ChoiceTag, input.ExpectedVersion, input.IdempotencyKey, snapshot, updatedAt, revision)
		return err
	})
	return result, replayed, err
}

// projectStoryFlags keeps append-only choice rows while making the materialized
// story projection reflect only the latest revision for a scene.
func projectStoryFlags(current progression.Progress, sceneSlug, choiceTag string) map[string]bool {
	projected := make(map[string]bool, len(current.StoryFlags)+2)
	for key, value := range current.StoryFlags {
		projected[key] = value
	}
	latestRevision := 0
	previousTag := ""
	for _, choice := range current.Choices {
		if choice.SceneSlug == sceneSlug && choice.Revision >= latestRevision {
			latestRevision = choice.Revision
			previousTag = choice.ChoiceTag
		}
	}
	if previousTag != "" {
		delete(projected, previousTag)
	}
	projected[sceneSlug+"-resolved"] = true
	if choiceTag != "" {
		projected[choiceTag] = true
	}
	return projected
}

func NewProgressionRepository(database *Database) *ProgressionRepository {
	return &ProgressionRepository{database: database}
}

func (repository *ProgressionRepository) GetOrCreate(ctx context.Context, playerID string) (result progression.Progress, err error) {
	err = repository.database.inTransaction(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			INSERT INTO player_campaign_progress (player_id,story_version) VALUES ($1::uuid,4)
			ON CONFLICT (player_id) DO NOTHING`, playerID); err != nil {
			return err
		}
		if err := grantUnlocks(ctx, tx, playerID, progression.InitialUnlocks()); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO player_chapter_progress(player_id,chapter_slug) VALUES($1::uuid,'seventh-dock') ON CONFLICT DO NOTHING`, playerID); err != nil {
			return err
		}
		var readErr error
		result, readErr = readProgress(ctx, tx, playerID, false)
		return readErr
	})
	return result, err
}

func grantUnlocks(ctx context.Context, tx pgx.Tx, playerID string, grants []progression.UnlockGrant) error {
	if len(grants) == 0 {
		return nil
	}
	types := make([]string, 0, len(grants))
	slugs := make([]string, 0, len(grants))
	for _, grant := range grants {
		types = append(types, grant.Type)
		slugs = append(slugs, grant.ContentSlug)
	}
	_, err := tx.Exec(ctx, `
		INSERT INTO player_unlocks (player_id, unlock_type, content_slug)
		SELECT $1::uuid, item.unlock_type, item.content_slug
		FROM unnest($2::text[], $3::text[]) AS item(unlock_type, content_slug)
		ON CONFLICT DO NOTHING`, playerID, types, slugs)
	return err
}

type progressQuerier interface {
	QueryRow(context.Context, string, ...any) pgx.Row
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

func readProgress(ctx context.Context, query progressQuerier, playerID string, lock bool) (progression.Progress, error) {
	statement := `
		SELECT player_id::text,current_chapter_slug,story_version,story_flags,version,
			COALESCE(ending,''),daily_unlocked,created_at,updated_at
		FROM player_campaign_progress WHERE player_id=$1::uuid`
	if lock {
		statement += " FOR UPDATE"
	}
	var result progression.Progress
	var flagsJSON []byte
	if err := query.QueryRow(ctx, statement, playerID).Scan(
		&result.PlayerID, &result.CurrentChapter, &result.StoryVersion, &flagsJSON, &result.Version,
		&result.Ending, &result.DailyUnlocked, &result.CreatedAt, &result.UpdatedAt,
	); err != nil {
		return progression.Progress{}, err
	}
	if err := json.Unmarshal(flagsJSON, &result.StoryFlags); err != nil {
		return progression.Progress{}, fmt.Errorf("decode story flags: %w", err)
	}
	unlockRows, err := query.Query(ctx, `SELECT unlock_type,content_slug,created_at FROM player_unlocks WHERE player_id=$1::uuid ORDER BY created_at,unlock_type,content_slug`, playerID)
	if err != nil {
		return progression.Progress{}, err
	}
	for unlockRows.Next() {
		var unlock progression.Unlock
		if err := unlockRows.Scan(&unlock.Type, &unlock.ContentSlug, &unlock.CreatedAt); err != nil {
			return progression.Progress{}, err
		}
		result.Unlocks = append(result.Unlocks, unlock)
	}
	if err := unlockRows.Err(); err != nil {
		unlockRows.Close()
		return progression.Progress{}, err
	}
	unlockRows.Close()

	chapterRows, err := query.Query(ctx, `SELECT chapter_slug,highest_encore_level,clears,best_score,updated_at FROM player_chapter_progress WHERE player_id=$1::uuid ORDER BY updated_at,chapter_slug`, playerID)
	if err != nil {
		return progression.Progress{}, err
	}
	for chapterRows.Next() {
		var chapter progression.ChapterProgress
		if err := chapterRows.Scan(&chapter.ChapterSlug, &chapter.HighestEncore, &chapter.Clears, &chapter.BestScore, &chapter.UpdatedAt); err != nil {
			return progression.Progress{}, err
		}
		result.Chapters = append(result.Chapters, chapter)
	}
	if err := chapterRows.Err(); err != nil {
		chapterRows.Close()
		return progression.Progress{}, err
	}
	chapterRows.Close()

	choiceRows, err := query.Query(ctx, `SELECT scene_slug,option_slug,choice_tag,revision,created_at FROM story_choices WHERE player_id=$1::uuid ORDER BY created_at,id`, playerID)
	if err != nil {
		return progression.Progress{}, err
	}
	for choiceRows.Next() {
		var choice progression.Choice
		if err := choiceRows.Scan(&choice.SceneSlug, &choice.OptionSlug, &choice.ChoiceTag, &choice.Revision, &choice.CreatedAt); err != nil {
			return progression.Progress{}, err
		}
		result.Choices = append(result.Choices, choice)
	}
	if err := choiceRows.Err(); err != nil {
		choiceRows.Close()
		return progression.Progress{}, err
	}
	choiceRows.Close()
	if result.StoryFlags == nil {
		result.StoryFlags = map[string]bool{}
	}
	if result.Unlocks == nil {
		result.Unlocks = []progression.Unlock{}
	}
	if result.Chapters == nil {
		result.Chapters = []progression.ChapterProgress{}
	}
	if result.Choices == nil {
		result.Choices = []progression.Choice{}
	}
	return result, nil
}

var _ progression.Repository = (*ProgressionRepository)(nil)
