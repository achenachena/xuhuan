package postgres

import (
	"context"
	"encoding/json"
	"fmt"
	"io/fs"

	"github.com/jackc/pgx/v5"
)

type characterSeed struct {
	Slug                       string  `json:"slug"`
	NameZHCN                   string  `json:"name_zh_cn"`
	NameEN                     string  `json:"name_en"`
	BiographyZHCN              string  `json:"biography_zh_cn"`
	BiographyEN                string  `json:"biography_en"`
	Archetype                  string  `json:"archetype"`
	BaseHealth                 int     `json:"base_health"`
	BaseAttack                 int     `json:"base_attack"`
	BaseDefense                int     `json:"base_defense"`
	BaseSpeed                  int     `json:"base_speed"`
	BaseCritRate               float64 `json:"base_crit_rate"`
	BaseCritDamage             float64 `json:"base_crit_damage"`
	SpecialMoveNameZHCN        string  `json:"special_move_name_zh_cn"`
	SpecialMoveNameEN          string  `json:"special_move_name_en"`
	SpecialMoveDescriptionZHCN string  `json:"special_move_description_zh_cn"`
	SpecialMoveDescriptionEN   string  `json:"special_move_description_en"`
	SpecialMoveType            string  `json:"special_move_type"`
	Rarity                     string  `json:"rarity"`
	ColorTheme                 string  `json:"color_theme"`
	PortraitURL                string  `json:"portrait_url"`
	ModelURL                   string  `json:"model_url"`
}

type encounterSeed struct {
	Slug                       string  `json:"slug"`
	NameZHCN                   string  `json:"name_zh_cn"`
	NameEN                     string  `json:"name_en"`
	DescriptionZHCN            string  `json:"description_zh_cn"`
	DescriptionEN              string  `json:"description_en"`
	Level                      int     `json:"level"`
	MaxHealth                  int     `json:"max_health"`
	Attack                     int     `json:"attack"`
	Defense                    int     `json:"defense"`
	Speed                      int     `json:"speed"`
	CritRate                   float64 `json:"crit_rate"`
	CritDamage                 float64 `json:"crit_damage"`
	SpecialMoveNameZHCN        string  `json:"special_move_name_zh_cn"`
	SpecialMoveNameEN          string  `json:"special_move_name_en"`
	SpecialMoveDescriptionZHCN string  `json:"special_move_description_zh_cn"`
	SpecialMoveDescriptionEN   string  `json:"special_move_description_en"`
	ColorTheme                 string  `json:"color_theme"`
	ImageURL                   *string `json:"image_url"`
	Active                     bool    `json:"active"`
}

func (d *Database) SeedCatalog(ctx context.Context, files fs.FS) error {
	characters, encounters, err := readSeedData(files)
	if err != nil {
		return err
	}
	tx, err := d.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	for _, item := range characters {
		if _, err := tx.Exec(ctx, upsertCharacterSQL,
			item.Slug, item.NameZHCN, item.NameEN, item.BiographyZHCN, item.BiographyEN,
			item.Archetype, item.BaseHealth, item.BaseAttack, item.BaseDefense, item.BaseSpeed,
			item.BaseCritRate, item.BaseCritDamage, item.SpecialMoveNameZHCN, item.SpecialMoveNameEN,
			item.SpecialMoveDescriptionZHCN, item.SpecialMoveDescriptionEN, item.SpecialMoveType,
			item.Rarity, item.ColorTheme, item.PortraitURL, item.ModelURL,
		); err != nil {
			return fmt.Errorf("seed character %s: %w", item.Slug, err)
		}
	}
	for _, item := range encounters {
		if _, err := tx.Exec(ctx, upsertEncounterSQL,
			item.Slug, item.NameZHCN, item.NameEN, item.DescriptionZHCN, item.DescriptionEN,
			item.Level, item.MaxHealth, item.Attack, item.Defense, item.Speed, item.CritRate,
			item.CritDamage, item.SpecialMoveNameZHCN, item.SpecialMoveNameEN,
			item.SpecialMoveDescriptionZHCN, item.SpecialMoveDescriptionEN, item.ColorTheme,
			item.ImageURL, item.Active,
		); err != nil {
			return fmt.Errorf("seed encounter %s: %w", item.Slug, err)
		}
	}
	return tx.Commit(ctx)
}

func readSeedData(files fs.FS) ([]characterSeed, []encounterSeed, error) {
	var characters []characterSeed
	if err := decodeSeedFile(files, "characters.json", &characters); err != nil {
		return nil, nil, err
	}
	var encounters []encounterSeed
	if err := decodeSeedFile(files, "encounters.json", &encounters); err != nil {
		return nil, nil, err
	}
	if len(characters) == 0 || len(encounters) == 0 {
		return nil, nil, fmt.Errorf("catalog seed files must not be empty")
	}
	return characters, encounters, nil
}

func decodeSeedFile(files fs.FS, name string, destination any) error {
	contents, err := fs.ReadFile(files, name)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(contents, destination); err != nil {
		return fmt.Errorf("decode %s: %w", name, err)
	}
	return nil
}

const upsertCharacterSQL = `
INSERT INTO characters (
    slug, name_zh_cn, name_en, biography_zh_cn, biography_en, archetype,
    base_health, base_attack, base_defense, base_speed, base_crit_rate, base_crit_damage,
    special_move_name_zh_cn, special_move_name_en,
    special_move_description_zh_cn, special_move_description_en, special_move_type,
    rarity, color_theme, portrait_url, model_url
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
)
ON CONFLICT (slug) DO UPDATE SET
    name_zh_cn = EXCLUDED.name_zh_cn,
    name_en = EXCLUDED.name_en,
    biography_zh_cn = EXCLUDED.biography_zh_cn,
    biography_en = EXCLUDED.biography_en,
    archetype = EXCLUDED.archetype,
    base_health = EXCLUDED.base_health,
    base_attack = EXCLUDED.base_attack,
    base_defense = EXCLUDED.base_defense,
    base_speed = EXCLUDED.base_speed,
    base_crit_rate = EXCLUDED.base_crit_rate,
    base_crit_damage = EXCLUDED.base_crit_damage,
    special_move_name_zh_cn = EXCLUDED.special_move_name_zh_cn,
    special_move_name_en = EXCLUDED.special_move_name_en,
    special_move_description_zh_cn = EXCLUDED.special_move_description_zh_cn,
    special_move_description_en = EXCLUDED.special_move_description_en,
    special_move_type = EXCLUDED.special_move_type,
    rarity = EXCLUDED.rarity,
    color_theme = EXCLUDED.color_theme,
    portrait_url = EXCLUDED.portrait_url,
    model_url = EXCLUDED.model_url,
    active = true,
    updated_at = now()`

const upsertEncounterSQL = `
INSERT INTO encounters (
    slug, name_zh_cn, name_en, description_zh_cn, description_en, level,
    max_health, attack, defense, speed, crit_rate, crit_damage,
    special_move_name_zh_cn, special_move_name_en,
    special_move_description_zh_cn, special_move_description_en,
    color_theme, image_url, active
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
)
ON CONFLICT (slug) DO UPDATE SET
    name_zh_cn = EXCLUDED.name_zh_cn,
    name_en = EXCLUDED.name_en,
    description_zh_cn = EXCLUDED.description_zh_cn,
    description_en = EXCLUDED.description_en,
    level = EXCLUDED.level,
    max_health = EXCLUDED.max_health,
    attack = EXCLUDED.attack,
    defense = EXCLUDED.defense,
    speed = EXCLUDED.speed,
    crit_rate = EXCLUDED.crit_rate,
    crit_damage = EXCLUDED.crit_damage,
    special_move_name_zh_cn = EXCLUDED.special_move_name_zh_cn,
    special_move_name_en = EXCLUDED.special_move_name_en,
    special_move_description_zh_cn = EXCLUDED.special_move_description_zh_cn,
    special_move_description_en = EXCLUDED.special_move_description_en,
    color_theme = EXCLUDED.color_theme,
    image_url = EXCLUDED.image_url,
    active = EXCLUDED.active,
    updated_at = now()`
