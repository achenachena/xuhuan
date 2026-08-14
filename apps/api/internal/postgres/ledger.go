package postgres

import (
	"context"
	"errors"

	"github.com/achenachena/xuhuan/apps/api/internal/battle"
	"github.com/jackc/pgx/v5"
)

func applyCompletionRewards(ctx context.Context, tx pgx.Tx, completed battle.Battle, idempotencyKey string) error {
	reward := completed.Rewards
	if reward == nil {
		return errors.New("completed battle has no reward")
	}
	if reward.Experience > 0 {
		if _, err := tx.Exec(ctx, `
			INSERT INTO player_ledger (player_id, resource_type, delta, reason, source_battle_id, idempotency_key)
			VALUES ($1::uuid, 'experience', $2, 'battle_victory', $3::uuid, $4)`,
			completed.PlayerID, reward.Experience, completed.ID, idempotencyKey,
		); err != nil {
			return err
		}
	}
	if reward.Credits > 0 {
		if _, err := tx.Exec(ctx, `
			INSERT INTO player_ledger (player_id, resource_type, delta, reason, source_battle_id, idempotency_key)
			VALUES ($1::uuid, 'credits', $2, 'battle_victory', $3::uuid, $4)`,
			completed.PlayerID, reward.Credits, completed.ID, idempotencyKey,
		); err != nil {
			return err
		}
	}
	_, err := tx.Exec(ctx, `
		UPDATE players SET
			experience = experience + $2,
			credits = credits + $3,
			level = GREATEST(level, (((experience + $2) / 100) + 1)::integer),
			version = version + 1,
			updated_at = now()
		WHERE id = $1::uuid`, completed.PlayerID, reward.Experience, reward.Credits)
	return err
}
