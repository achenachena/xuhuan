package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/achenachena/xuhuan/apps/api/internal/battle"
	"github.com/achenachena/xuhuan/apps/api/internal/platform/observability"
	"github.com/achenachena/xuhuan/apps/api/internal/repository"
	"github.com/jackc/pgx/v5"
)

const createBattleOperation = "create_battle"

type BattleRepository struct {
	database *Database
	metrics  *observability.Metrics
}

func NewBattleRepository(database *Database, metrics *observability.Metrics) *BattleRepository {
	return &BattleRepository{database: database, metrics: metrics}
}

func (r *BattleRepository) Create(ctx context.Context, input battle.CreateRepositoryInput) (created battle.Battle, replayed bool, err error) {
	err = r.database.inTransaction(ctx, func(tx pgx.Tx) error {
		var energy int
		if err := tx.QueryRow(ctx, "SELECT energy FROM players WHERE id = $1::uuid FOR UPDATE", input.Player.ID).Scan(&energy); err != nil {
			return err
		}
		stored, found, err := readStoredResponse[battle.Battle](ctx, tx, input.Player.ID, createBattleOperation, input.IdempotencyKey, input.RequestHash[:])
		if err != nil {
			return err
		}
		if found {
			created = stored
			replayed = true
			return nil
		}
		if energy < battle.EnergyCost {
			return battle.ErrInsufficientEnergy
		}

		stateJSON, err := json.Marshal(input.State)
		if err != nil {
			return err
		}
		created = battle.Battle{
			PlayerID: input.Player.ID, Character: input.Character, Encounter: input.Encounter,
			Seed: input.Seed, State: input.State, Status: battle.Active, Version: 1,
		}
		if err := tx.QueryRow(ctx, `
			INSERT INTO battles (player_id, character_id, encounter_id, seed, state)
			VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5)
			RETURNING id::text, created_at, updated_at`,
			input.Player.ID, input.Character.ID, input.Encounter.ID, input.Seed, stateJSON,
		).Scan(&created.ID, &created.CreatedAt, &created.UpdatedAt); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			UPDATE players SET energy = energy - $2, version = version + 1, updated_at = now()
			WHERE id = $1::uuid AND energy >= $2`, input.Player.ID, battle.EnergyCost); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO player_ledger (player_id, resource_type, delta, reason, source_battle_id, idempotency_key)
			VALUES ($1::uuid, 'energy', $2, 'battle_started', $3::uuid, $4)`,
			input.Player.ID, -battle.EnergyCost, created.ID, input.IdempotencyKey,
		); err != nil {
			return err
		}
		return storeResponse(ctx, tx, input.Player.ID, createBattleOperation, input.IdempotencyKey, input.RequestHash[:], 201, created)
	})
	return created, replayed, err
}

func (r *BattleRepository) Get(ctx context.Context, playerID, battleID string) (battle.Battle, error) {
	result, err := scanBattle(r.database.pool.QueryRow(ctx, battleSelectSQL+" WHERE b.id = $1::uuid AND b.player_id = $2::uuid", battleID, playerID))
	if errors.Is(err, pgx.ErrNoRows) {
		return battle.Battle{}, repository.ErrNotFound
	}
	return result, err
}

func (r *BattleRepository) Apply(ctx context.Context, input battle.ApplyRepositoryInput, resolve battle.Resolver) (response battle.ActionResponse, replayed bool, err error) {
	rewardTransaction := false
	defer func() {
		if rewardTransaction && err != nil {
			r.metrics.RewardTransactionFailure(ctx)
		}
	}()

	err = r.database.inTransaction(ctx, func(tx pgx.Tx) error {
		current, err := scanBattle(tx.QueryRow(ctx, battleSelectSQL+" WHERE b.id = $1::uuid AND b.player_id = $2::uuid FOR UPDATE OF b", input.BattleID, input.PlayerID))
		if errors.Is(err, pgx.ErrNoRows) {
			return repository.ErrNotFound
		}
		if err != nil {
			return err
		}
		operation := "battle_action:" + input.BattleID
		stored, found, err := readStoredResponse[battle.ActionResponse](ctx, tx, input.PlayerID, operation, input.IdempotencyKey, input.RequestHash[:])
		if err != nil {
			return err
		}
		if found {
			response = stored
			replayed = true
			return nil
		}
		if current.Status != battle.Active {
			return battle.ErrBattleNotActive
		}
		if current.Version != input.ExpectedVersion {
			return battle.ErrVersionConflict
		}

		nextState, actionResult, outcome, reward, err := resolve(current, input.Action)
		if err != nil {
			return err
		}
		rewardTransaction = outcome != nil && reward != nil
		stateJSON, err := json.Marshal(nextState)
		if err != nil {
			return err
		}
		resultSnapshot, err := json.Marshal(actionResult)
		if err != nil {
			return err
		}

		now := time.Now().UTC()
		current.State = nextState
		current.Version++
		current.UpdatedAt = now
		if outcome != nil {
			current.Status = battle.Completed
			current.Outcome = outcome
			current.Rewards = reward
			current.CompletedAt = &now
		}

		var outcomeValue any
		var completedAt any
		rewardExperience := int64(0)
		rewardCredits := int64(0)
		rewardEnergy := 0
		if outcome != nil && reward != nil {
			outcomeValue = string(*outcome)
			completedAt = now
			rewardExperience = reward.Experience
			rewardCredits = reward.Credits
			rewardEnergy = reward.Energy
		}
		if err := tx.QueryRow(ctx, `
			UPDATE battles SET state = $2, status = $3, outcome = $4, reward_experience = $5,
				reward_credits = $6, reward_energy = $7, version = version + 1,
				updated_at = now(), completed_at = $8
			WHERE id = $1::uuid
			RETURNING updated_at, completed_at`,
			current.ID, stateJSON, current.Status, outcomeValue, rewardExperience, rewardCredits, rewardEnergy, completedAt,
		).Scan(&current.UpdatedAt, &current.CompletedAt); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO battle_actions (battle_id, sequence, action_type, expected_version, resulting_version, idempotency_key, result_snapshot)
			VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)`,
			current.ID, actionResult.Sequence, input.Action, input.ExpectedVersion, current.Version, input.IdempotencyKey, resultSnapshot,
		); err != nil {
			return err
		}
		if outcome != nil && reward != nil {
			if err := applyCompletionRewards(ctx, tx, current, input.IdempotencyKey); err != nil {
				return err
			}
		}

		response = battle.ActionResponse{Battle: current, Result: actionResult}
		return storeResponse(ctx, tx, input.PlayerID, operation, input.IdempotencyKey, input.RequestHash[:], 200, response)
	})
	return response, replayed, err
}

var _ battle.Repository = (*BattleRepository)(nil)
