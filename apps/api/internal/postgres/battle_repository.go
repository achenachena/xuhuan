package postgres

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/achenachena/xuhuan/apps/api/internal/battle"
	"github.com/achenachena/xuhuan/apps/api/internal/character"
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

func (r *BattleRepository) Create(ctx context.Context, input battle.CreateRepositoryInput) (battle.Battle, bool, error) {
	tx, err := r.database.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return battle.Battle{}, false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var energy int
	if err := tx.QueryRow(ctx, "SELECT energy FROM players WHERE id = $1::uuid FOR UPDATE", input.Player.ID).Scan(&energy); err != nil {
		return battle.Battle{}, false, err
	}
	if stored, replayed, err := readStoredResponse[battle.Battle](ctx, tx, input.Player.ID, createBattleOperation, input.IdempotencyKey, input.RequestHash[:]); err != nil || replayed {
		return stored, replayed, err
	}
	if energy < battle.EnergyCost {
		return battle.Battle{}, false, battle.ErrInsufficientEnergy
	}

	stateJSON, err := json.Marshal(input.State)
	if err != nil {
		return battle.Battle{}, false, err
	}
	result := battle.Battle{
		PlayerID: input.Player.ID, Character: input.Character, Encounter: input.Encounter,
		Seed: input.Seed, State: input.State, Status: battle.Active, Version: 1,
	}
	err = tx.QueryRow(ctx, `
		INSERT INTO battles (player_id, character_id, encounter_id, seed, state)
		VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5)
		RETURNING id::text, created_at, updated_at`,
		input.Player.ID, input.Character.ID, input.Encounter.ID, input.Seed, stateJSON,
	).Scan(&result.ID, &result.CreatedAt, &result.UpdatedAt)
	if err != nil {
		return battle.Battle{}, false, err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE players SET energy = energy - $2, version = version + 1, updated_at = now()
		WHERE id = $1::uuid AND energy >= $2`, input.Player.ID, battle.EnergyCost); err != nil {
		return battle.Battle{}, false, err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO player_ledger (player_id, resource_type, delta, reason, source_battle_id, idempotency_key)
		VALUES ($1::uuid, 'energy', $2, 'battle_started', $3::uuid, $4)`,
		input.Player.ID, -battle.EnergyCost, result.ID, input.IdempotencyKey,
	); err != nil {
		return battle.Battle{}, false, err
	}
	if err := storeResponse(ctx, tx, input.Player.ID, createBattleOperation, input.IdempotencyKey, input.RequestHash[:], 201, result); err != nil {
		return battle.Battle{}, false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return battle.Battle{}, false, err
	}
	return result, false, nil
}

func (r *BattleRepository) Get(ctx context.Context, playerID, battleID string) (battle.Battle, error) {
	result, err := scanBattle(r.database.pool.QueryRow(ctx, battleSelectSQL+" WHERE b.id = $1::uuid AND b.player_id = $2::uuid", battleID, playerID))
	if errors.Is(err, pgx.ErrNoRows) {
		return battle.Battle{}, repository.ErrNotFound
	}
	return result, err
}

func (r *BattleRepository) Apply(ctx context.Context, input battle.ApplyRepositoryInput, resolve battle.Resolver) (response battle.ActionResponse, replayed bool, returnErr error) {
	tx, err := r.database.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return battle.ActionResponse{}, false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	current, err := scanBattle(tx.QueryRow(ctx, battleSelectSQL+" WHERE b.id = $1::uuid AND b.player_id = $2::uuid FOR UPDATE OF b", input.BattleID, input.PlayerID))
	if errors.Is(err, pgx.ErrNoRows) {
		return battle.ActionResponse{}, false, repository.ErrNotFound
	}
	if err != nil {
		return battle.ActionResponse{}, false, err
	}
	operation := "battle_action:" + input.BattleID
	if stored, replayed, err := readStoredResponse[battle.ActionResponse](ctx, tx, input.PlayerID, operation, input.IdempotencyKey, input.RequestHash[:]); err != nil || replayed {
		return stored, replayed, err
	}
	if current.Status != battle.Active {
		return battle.ActionResponse{}, false, battle.ErrBattleNotActive
	}
	if current.Version != input.ExpectedVersion {
		return battle.ActionResponse{}, false, battle.ErrVersionConflict
	}

	nextState, actionResult, outcome, reward, err := resolve(current, input.Action)
	if err != nil {
		return battle.ActionResponse{}, false, err
	}
	rewardTransaction := outcome != nil && reward != nil
	defer func() {
		if rewardTransaction && returnErr != nil {
			r.metrics.RewardTransactionFailure(ctx)
		}
	}()
	stateJSON, err := json.Marshal(nextState)
	if err != nil {
		return battle.ActionResponse{}, false, err
	}
	resultSnapshot, err := json.Marshal(actionResult)
	if err != nil {
		return battle.ActionResponse{}, false, err
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
		return battle.ActionResponse{}, false, err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO battle_actions (battle_id, sequence, action_type, expected_version, resulting_version, idempotency_key, result_snapshot)
		VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)`,
		current.ID, actionResult.Sequence, input.Action, input.ExpectedVersion, current.Version, input.IdempotencyKey, resultSnapshot,
	); err != nil {
		return battle.ActionResponse{}, false, err
	}
	if outcome != nil && reward != nil {
		if err := applyCompletionRewards(ctx, tx, current, input.IdempotencyKey); err != nil {
			return battle.ActionResponse{}, false, err
		}
	}

	response = battle.ActionResponse{Battle: current, Result: actionResult}
	if err := storeResponse(ctx, tx, input.PlayerID, operation, input.IdempotencyKey, input.RequestHash[:], 200, response); err != nil {
		return battle.ActionResponse{}, false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return battle.ActionResponse{}, false, err
	}
	return response, false, nil
}

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
	if _, err := tx.Exec(ctx, `
		UPDATE players SET
			experience = experience + $2,
			credits = credits + $3,
			level = GREATEST(level, (((experience + $2) / 100) + 1)::integer),
			version = version + 1,
			updated_at = now()
		WHERE id = $1::uuid`, completed.PlayerID, reward.Experience, reward.Credits,
	); err != nil {
		return err
	}
	return nil
}

func readStoredResponse[T any](ctx context.Context, tx pgx.Tx, playerID, operation, key string, requestHash []byte) (T, bool, error) {
	var zero T
	var storedHash []byte
	var responseBody []byte
	var replayable bool
	err := tx.QueryRow(ctx, `
		SELECT request_hash, response_body, expires_at > now() FROM idempotency_records
		WHERE player_id = $1::uuid AND operation = $2 AND idempotency_key = $3`,
		playerID, operation, key,
	).Scan(&storedHash, &responseBody, &replayable)
	if errors.Is(err, pgx.ErrNoRows) {
		return zero, false, nil
	}
	if err != nil {
		return zero, false, err
	}
	// Keys stay reserved after the replay window closes. This matches the
	// ledger's permanent uniqueness guarantee and prevents a second mutation.
	if !replayable {
		return zero, false, battle.ErrIdempotencyConflict
	}
	if !bytes.Equal(storedHash, requestHash) {
		return zero, false, battle.ErrIdempotencyConflict
	}
	if err := json.Unmarshal(responseBody, &zero); err != nil {
		return zero, false, fmt.Errorf("decode stored idempotency response: %w", err)
	}
	return zero, true, nil
}

func storeResponse(ctx context.Context, tx pgx.Tx, playerID, operation, key string, requestHash []byte, status int, response any) error {
	responseJSON, err := json.Marshal(response)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO idempotency_records (player_id, operation, idempotency_key, request_hash, response_status, response_body)
		VALUES ($1::uuid, $2, $3, $4, $5, $6)`, playerID, operation, key, requestHash, status, responseJSON)
	return err
}

type battleRow interface {
	Scan(...any) error
}

func scanBattle(row battleRow) (battle.Battle, error) {
	var result battle.Battle
	var stateJSON, characterJSON, encounterJSON, rewardJSON []byte
	var status string
	var outcome *string
	err := row.Scan(
		&result.ID, &result.PlayerID, &result.Seed, &stateJSON, &status, &outcome,
		&result.Version, &result.CreatedAt, &result.UpdatedAt, &result.CompletedAt,
		&characterJSON, &encounterJSON, &rewardJSON,
	)
	if err != nil {
		return battle.Battle{}, err
	}
	result.Status = battle.Status(status)
	if outcome != nil {
		value := battle.Outcome(*outcome)
		result.Outcome = &value
	}
	if err := json.Unmarshal(stateJSON, &result.State); err != nil {
		return battle.Battle{}, err
	}
	if err := json.Unmarshal(characterJSON, &result.Character); err != nil {
		return battle.Battle{}, err
	}
	if err := json.Unmarshal(encounterJSON, &result.Encounter); err != nil {
		return battle.Battle{}, err
	}
	if len(rewardJSON) > 0 {
		var reward battle.Reward
		if err := json.Unmarshal(rewardJSON, &reward); err != nil {
			return battle.Battle{}, err
		}
		result.Rewards = &reward
	}
	return result, nil
}

const battleSelectSQL = `SELECT
    b.id::text, b.player_id::text, b.seed, b.state, b.status, b.outcome,
    b.version, b.created_at, b.updated_at, b.completed_at,
    jsonb_build_object(
        'id', c.id::text, 'slug', c.slug,
        'name', jsonb_build_object('zh_cn', c.name_zh_cn, 'en', c.name_en),
        'biography', jsonb_build_object('zh_cn', c.biography_zh_cn, 'en', c.biography_en),
        'archetype', c.archetype, 'base_health', c.base_health, 'base_attack', c.base_attack,
        'base_defense', c.base_defense, 'base_speed', c.base_speed,
        'base_crit_rate', c.base_crit_rate, 'base_crit_damage', c.base_crit_damage,
        'special_move_name', jsonb_build_object('zh_cn', c.special_move_name_zh_cn, 'en', c.special_move_name_en),
        'special_move_description', jsonb_build_object('zh_cn', c.special_move_description_zh_cn, 'en', c.special_move_description_en),
        'special_move_type', c.special_move_type, 'rarity', c.rarity, 'color_theme', c.color_theme,
        'portrait_url', c.portrait_url, 'model_url', c.model_url
    ),
    jsonb_build_object(
        'id', e.id::text, 'slug', e.slug,
        'name', jsonb_build_object('zh_cn', e.name_zh_cn, 'en', e.name_en),
        'description', jsonb_build_object('zh_cn', e.description_zh_cn, 'en', e.description_en),
        'level', e.level, 'max_health', e.max_health, 'attack', e.attack, 'defense', e.defense,
        'speed', e.speed, 'crit_rate', e.crit_rate, 'crit_damage', e.crit_damage,
        'special_move_name', jsonb_build_object('zh_cn', e.special_move_name_zh_cn, 'en', e.special_move_name_en),
        'special_move_description', jsonb_build_object('zh_cn', e.special_move_description_zh_cn, 'en', e.special_move_description_en),
        'color_theme', e.color_theme, 'image_url', e.image_url
    ),
    CASE WHEN b.status = 'completed' THEN jsonb_build_object(
        'experience', b.reward_experience, 'credits', b.reward_credits, 'energy', b.reward_energy
    ) ELSE NULL END
FROM battles b
JOIN characters c ON c.id = b.character_id
JOIN encounters e ON e.id = b.encounter_id`

var _ character.Repository = (*CatalogRepository)(nil)
