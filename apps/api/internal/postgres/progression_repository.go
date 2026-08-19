package postgres

import (
	"bytes"
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

func NewProgressionRepository(database *Database) *ProgressionRepository {
	return &ProgressionRepository{database: database}
}

func (repository *ProgressionRepository) GetOrCreate(ctx context.Context, playerID string) (result progression.Progress, err error) {
	err = repository.database.inTransaction(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			INSERT INTO player_progress (player_id) VALUES ($1::uuid)
			ON CONFLICT (player_id) DO NOTHING`, playerID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO player_unlocks (player_id, unlock_type, content_slug)
			VALUES ($1::uuid, 'character', 'nana7mi')
			ON CONFLICT DO NOTHING`, playerID); err != nil {
			return err
		}
		var err error
		result, err = readProgress(ctx, tx, playerID, false)
		return err
	})
	return result, err
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
		for _, choice := range current.Choices {
			if choice.SceneSlug == input.Scene.Slug {
				return progression.ErrChoiceAlreadyMade
			}
		}
		flags := current.StoryFlags
		if flags == nil {
			flags = make(map[string]bool)
		}
		flags[input.Option.Tag] = true
		flags[input.Scene.Slug+"-resolved"] = true
		flagsJSON, err := json.Marshal(flags)
		if err != nil {
			return err
		}
		var updatedAt time.Time
		if err := tx.QueryRow(ctx, `
			UPDATE player_progress
			SET story_flags = $2, version = version + 1, updated_at = now()
			WHERE player_id = $1::uuid
			RETURNING updated_at`, input.PlayerID, flagsJSON).Scan(&updatedAt); err != nil {
			return err
		}
		result = current
		result.StoryFlags = flags
		result.Version++
		result.UpdatedAt = updatedAt
		choice := progression.Choice{
			SceneSlug: input.Scene.Slug, OptionSlug: input.Option.Slug,
			ChoiceTag: input.Option.Tag, CreatedAt: updatedAt,
		}
		result.Choices = append(result.Choices, choice)
		snapshot, err := json.Marshal(result)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO story_choices (
				player_id, scene_slug, option_slug, choice_tag,
				expected_version, resulting_version, idempotency_key, request_hash, result_snapshot, created_at
			) VALUES ($1::uuid, $2, $3, $4, $5::bigint, $5::bigint + 1, $6, $7, $8, $9)`,
			input.PlayerID, input.Scene.Slug, input.Option.Slug, input.Option.Tag,
			input.ExpectedVersion, input.IdempotencyKey, input.RequestHash[:], snapshot, updatedAt,
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
		SELECT player_id::text, current_chapter_slug, highest_noise_level,
			story_version, story_flags, version, created_at, updated_at
		FROM player_progress WHERE player_id = $1::uuid`
	if lock {
		statement += " FOR UPDATE"
	}
	var result progression.Progress
	var flagsJSON []byte
	if err := query.QueryRow(ctx, statement, playerID).Scan(
		&result.PlayerID, &result.CurrentChapter, &result.HighestNoise,
		&result.StoryVersion, &flagsJSON, &result.Version, &result.CreatedAt, &result.UpdatedAt,
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

	choiceRows, err := query.Query(ctx, `
		SELECT scene_slug, option_slug, choice_tag, created_at
		FROM story_choices WHERE player_id = $1::uuid
		ORDER BY created_at, id`, playerID)
	if err != nil {
		return progression.Progress{}, err
	}
	for choiceRows.Next() {
		var choice progression.Choice
		if err := choiceRows.Scan(&choice.SceneSlug, &choice.OptionSlug, &choice.ChoiceTag, &choice.CreatedAt); err != nil {
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
