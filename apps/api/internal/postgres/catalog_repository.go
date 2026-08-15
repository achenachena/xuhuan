package postgres

import (
	"context"
	"errors"

	"github.com/achenachena/xuhuan/apps/api/internal/character"
	"github.com/achenachena/xuhuan/apps/api/internal/repository"
	"github.com/jackc/pgx/v5"
)

type CatalogRepository struct {
	database *Database
}

func NewCatalogRepository(database *Database) *CatalogRepository {
	return &CatalogRepository{database: database}
}

func (r *CatalogRepository) ListCharacters(ctx context.Context) ([]character.Character, error) {
	rows, err := r.database.pool.Query(ctx, characterSelectSQL+" WHERE active = true ORDER BY name_zh_cn, slug")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	characters := make([]character.Character, 0)
	for rows.Next() {
		item, err := scanCharacter(rows)
		if err != nil {
			return nil, err
		}
		characters = append(characters, item)
	}
	return characters, rows.Err()
}

func (r *CatalogRepository) GetCharacter(ctx context.Context, slug string) (character.Character, error) {
	item, err := scanCharacter(r.database.pool.QueryRow(ctx, characterSelectSQL+" WHERE slug = $1 AND active = true", slug))
	if errors.Is(err, pgx.ErrNoRows) {
		return character.Character{}, repository.ErrNotFound
	}
	return item, err
}

func (r *CatalogRepository) ListEncounters(ctx context.Context) ([]character.Encounter, error) {
	rows, err := r.database.pool.Query(ctx, encounterSelectSQL+" WHERE active = true ORDER BY level, slug")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	encounters := make([]character.Encounter, 0)
	for rows.Next() {
		item, err := scanEncounter(rows)
		if err != nil {
			return nil, err
		}
		encounters = append(encounters, item)
	}
	return encounters, rows.Err()
}

func (r *CatalogRepository) GetEncounter(ctx context.Context, slug string) (character.Encounter, error) {
	item, err := scanEncounter(r.database.pool.QueryRow(ctx, encounterSelectSQL+" WHERE slug = $1 AND active = true", slug))
	if errors.Is(err, pgx.ErrNoRows) {
		return character.Encounter{}, repository.ErrNotFound
	}
	return item, err
}

func scanCharacter(row rowScanner) (character.Character, error) {
	var item character.Character
	err := row.Scan(
		&item.ID, &item.Slug, &item.Name.ZHCN, &item.Name.EN, &item.Biography.ZHCN, &item.Biography.EN,
		&item.Archetype, &item.BaseHealth, &item.BaseAttack, &item.BaseDefense, &item.BaseSpeed,
		&item.BaseCritRate, &item.BaseCritDamage, &item.SpecialMoveName.ZHCN, &item.SpecialMoveName.EN,
		&item.SpecialMoveDescription.ZHCN, &item.SpecialMoveDescription.EN, &item.SpecialMoveType,
		&item.Rarity, &item.ColorTheme, &item.PortraitURL, &item.ModelURL,
	)
	return item, err
}

func scanEncounter(row rowScanner) (character.Encounter, error) {
	var item character.Encounter
	err := row.Scan(
		&item.ID, &item.Slug, &item.Name.ZHCN, &item.Name.EN, &item.Description.ZHCN, &item.Description.EN,
		&item.Level, &item.MaxHealth, &item.Attack, &item.Defense, &item.Speed, &item.CritRate,
		&item.CritDamage, &item.SpecialMoveName.ZHCN, &item.SpecialMoveName.EN,
		&item.SpecialMoveDescription.ZHCN, &item.SpecialMoveDescription.EN, &item.ColorTheme, &item.ImageURL,
	)
	return item, err
}

const characterSelectSQL = `SELECT
    id::text, slug, name_zh_cn, name_en, biography_zh_cn, biography_en, archetype,
    base_health, base_attack, base_defense, base_speed, base_crit_rate, base_crit_damage,
    special_move_name_zh_cn, special_move_name_en,
    special_move_description_zh_cn, special_move_description_en, special_move_type,
    rarity, color_theme, portrait_url, model_url
FROM characters`

const encounterSelectSQL = `SELECT
    id::text, slug, name_zh_cn, name_en, description_zh_cn, description_en, level,
    max_health, attack, defense, speed, crit_rate, crit_damage,
    special_move_name_zh_cn, special_move_name_en,
    special_move_description_zh_cn, special_move_description_en, color_theme, image_url
FROM encounters`

var _ character.Repository = (*CatalogRepository)(nil)
