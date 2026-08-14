package postgres

import (
	"encoding/json"

	"github.com/achenachena/xuhuan/apps/api/internal/battle"
)

func scanBattle(row rowScanner) (battle.Battle, error) {
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
