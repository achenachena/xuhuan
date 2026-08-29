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
	"github.com/jackc/pgx/v5"
)

type ProgressionRepository struct {
	database *Database
	catalog  *gamecontent.Catalog
}

func NewProgressionRepository(database *Database, catalogs ...*gamecontent.Catalog) *ProgressionRepository {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	if len(catalogs) > 0 && catalogs[0] != nil {
		catalog = catalogs[0]
	}
	return &ProgressionRepository{database: database, catalog: catalog}
}

func (repository *ProgressionRepository) GetOrCreate(ctx context.Context, playerID string) (result progression.Progress, err error) {
	err = repository.database.inTransaction(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			INSERT INTO player_campaign_progress (player_id) VALUES ($1::uuid)
			ON CONFLICT (player_id) DO NOTHING`, playerID); err != nil {
			return err
		}
		if err := grantUnlocks(ctx, tx, playerID, progression.InitialUnlocks(repository.catalog)); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO player_chapter_progress(player_id,chapter_slug) VALUES($1::uuid,'seventh-dock') ON CONFLICT DO NOTHING`, playerID); err != nil {
			return err
		}
		var err error
		result, err = readProgress(ctx, tx, playerID, false)
		return err
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
		SELECT $1::uuid, unlock_grant.unlock_type, unlock_grant.content_slug
		FROM unnest($2::text[], $3::text[]) AS unlock_grant(unlock_type, content_slug)
		ON CONFLICT DO NOTHING`, playerID, types, slugs)
	return err
}

func (repository *ProgressionRepository) Choose(ctx context.Context, input progression.ChooseInput) (result progression.Progress, replayed bool, err error) {
	err = repository.database.inTransaction(ctx, func(tx pgx.Tx) error {
		current, err := readProgress(ctx, tx, input.PlayerID, true)
		if err != nil {
			return err
		}
		var storedHash []byte
		var storedSnapshot []byte
		err = tx.QueryRow(ctx, `
			SELECT request_hash, result_snapshot
			FROM story_choices
			WHERE player_id = $1::uuid AND idempotency_key = $2`, input.PlayerID, input.IdempotencyKey,
		).Scan(&storedHash, &storedSnapshot)
		if err == nil {
			if !bytes.Equal(storedHash, input.RequestHash[:]) {
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
		var previous *progression.Choice
		for _, choice := range current.Choices {
			if choice.SceneSlug == input.Scene.Slug && choice.Revision >= revision {
				revision = choice.Revision + 1
				copy := choice
				previous = &copy
			}
		}
		flags := make(map[string]bool, len(current.StoryFlags)+2)
		for key, value := range current.StoryFlags {
			flags[key] = value
		}
		if previous != nil && previous.ChoiceTag != input.Option.Tag {
			usedByAnotherScene := false
			latestByScene := make(map[string]progression.Choice)
			for _, choice := range current.Choices {
				if stored, ok := latestByScene[choice.SceneSlug]; !ok || choice.Revision > stored.Revision {
					latestByScene[choice.SceneSlug] = choice
				}
			}
			for sceneSlug, choice := range latestByScene {
				if sceneSlug != input.Scene.Slug && choice.ChoiceTag == previous.ChoiceTag {
					usedByAnotherScene = true
					break
				}
			}
			if !usedByAnotherScene {
				delete(flags, previous.ChoiceTag)
			}
		}
		flags[input.Option.Tag] = true
		flags[input.Scene.Slug+"-resolved"] = true
		delete(flags, "scene:"+input.Scene.Slug+":pending")
		flagsJSON, err := json.Marshal(flags)
		if err != nil {
			return err
		}
		trustDelta, authenticityDelta, retentionDelta := input.Option.Metrics.Trust, input.Option.Metrics.Authenticity, input.Option.Metrics.Retention
		if previous != nil {
			trustDelta -= previous.Trust
			authenticityDelta -= previous.Authenticity
			retentionDelta -= previous.Retention
		}
		ending := ""
		if input.Scene.Trigger.Kind == "ending" {
			ending = input.Scene.Trigger.Ending
		}
		dailyUnlocked := ending != ""
		var updatedAt time.Time
		if err := tx.QueryRow(ctx, `
			UPDATE player_campaign_progress
			SET story_flags = $2, trust=trust+$3, authenticity=authenticity+$4,
				retention=retention+$5, ending=CASE WHEN $6<>'' THEN $6 ELSE ending END,
				daily_unlocked=daily_unlocked OR $7,
				version = version + 1, updated_at = now()
			WHERE player_id = $1::uuid
			RETURNING updated_at`, input.PlayerID, flagsJSON, trustDelta, authenticityDelta, retentionDelta, ending, dailyUnlocked).Scan(&updatedAt); err != nil {
			return err
		}
		result = current
		result.StoryFlags = flags
		result.Version++
		result.Trust += trustDelta
		result.Authenticity += authenticityDelta
		result.Retention += retentionDelta
		if ending != "" {
			result.Ending = ending
		}
		result.DailyUnlocked = result.DailyUnlocked || dailyUnlocked
		result.UpdatedAt = updatedAt
		choice := progression.Choice{
			SceneSlug: input.Scene.Slug, OptionSlug: input.Option.Slug,
			ChoiceTag: input.Option.Tag, CreatedAt: updatedAt,
			Revision: revision, Trust: input.Option.Metrics.Trust, Authenticity: input.Option.Metrics.Authenticity, Retention: input.Option.Metrics.Retention,
		}
		result.Choices = append(result.Choices, choice)
		snapshot, err := json.Marshal(result)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO story_choices (
				player_id, scene_slug, option_slug, choice_tag,
				expected_version, resulting_version, idempotency_key, request_hash, result_snapshot, created_at,
				revision,trust,authenticity,retention
			) VALUES ($1::uuid, $2, $3, $4, $5::bigint, $5::bigint + 1, $6, $7, $8, $9,$10,$11,$12,$13)`,
			input.PlayerID, input.Scene.Slug, input.Option.Slug, input.Option.Tag,
			input.ExpectedVersion, input.IdempotencyKey, input.RequestHash[:], snapshot, updatedAt, revision, input.Option.Metrics.Trust, input.Option.Metrics.Authenticity, input.Option.Metrics.Retention,
		); err != nil {
			return err
		}
		return nil
	})
	return result, replayed, err
}

type progressQuerier interface {
	QueryRow(context.Context, string, ...any) pgx.Row
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

func readProgress(ctx context.Context, query progressQuerier, playerID string, lock bool) (progression.Progress, error) {
	statement := `
		SELECT player_id::text, current_chapter_slug,
			story_version, story_flags, version, created_at, updated_at,
			trust,authenticity,retention,COALESCE(ending,''),daily_unlocked
		FROM player_campaign_progress WHERE player_id = $1::uuid`
	if lock {
		statement += " FOR UPDATE"
	}
	var result progression.Progress
	var flagsJSON []byte
	if err := query.QueryRow(ctx, statement, playerID).Scan(
		&result.PlayerID, &result.CurrentChapter,
		&result.StoryVersion, &flagsJSON, &result.Version, &result.CreatedAt, &result.UpdatedAt,
		&result.Trust, &result.Authenticity, &result.Retention, &result.Ending, &result.DailyUnlocked,
	); err != nil {
		return progression.Progress{}, err
	}
	if err := json.Unmarshal(flagsJSON, &result.StoryFlags); err != nil {
		return progression.Progress{}, fmt.Errorf("decode story flags: %w", err)
	}
	unlockRows, err := query.Query(ctx, `
		SELECT unlock_type, content_slug, created_at
		FROM player_unlocks WHERE player_id = $1::uuid
		ORDER BY created_at, unlock_type, content_slug`, playerID)
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
	chapterRows, err := query.Query(ctx, `SELECT chapter_slug,highest_noise_level,clears,best_score,updated_at FROM player_chapter_progress WHERE player_id=$1::uuid ORDER BY updated_at,chapter_slug`, playerID)
	if err != nil {
		return progression.Progress{}, err
	}
	for chapterRows.Next() {
		var chapter progression.ChapterProgress
		if err := chapterRows.Scan(&chapter.ChapterSlug, &chapter.HighestNoise, &chapter.Clears, &chapter.BestScore, &chapter.UpdatedAt); err != nil {
			chapterRows.Close()
			return progression.Progress{}, err
		}
		result.Chapters = append(result.Chapters, chapter)
		if chapter.ChapterSlug == result.CurrentChapter {
			result.HighestNoise = chapter.HighestNoise
		}
	}
	if err := chapterRows.Err(); err != nil {
		chapterRows.Close()
		return progression.Progress{}, err
	}
	chapterRows.Close()

	choiceRows, err := query.Query(ctx, `
		SELECT scene_slug, option_slug, choice_tag, revision,trust,authenticity,retention,created_at
		FROM story_choices WHERE player_id = $1::uuid
		ORDER BY created_at, id`, playerID)
	if err != nil {
		return progression.Progress{}, err
	}
	for choiceRows.Next() {
		var choice progression.Choice
		if err := choiceRows.Scan(&choice.SceneSlug, &choice.OptionSlug, &choice.ChoiceTag, &choice.Revision, &choice.Trust, &choice.Authenticity, &choice.Retention, &choice.CreatedAt); err != nil {
			return progression.Progress{}, err
		}
		result.Choices = append(result.Choices, choice)
	}
	if err := choiceRows.Err(); err != nil {
		choiceRows.Close()
		return progression.Progress{}, err
	}
	choiceRows.Close()
	return result, nil
}

var _ progression.Repository = (*ProgressionRepository)(nil)
