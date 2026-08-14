package api

import (
	"strconv"
	"strings"

	"github.com/achenachena/xuhuan/apps/api/internal/character"
	"github.com/achenachena/xuhuan/apps/api/internal/player"
)

type playerResponse struct {
	ID             string  `json:"id"`
	TelegramUserID string  `json:"telegram_user_id"`
	Username       *string `json:"username"`
	DisplayName    string  `json:"display_name"`
	Level          int     `json:"level"`
	Experience     int64   `json:"experience"`
	Credits        int64   `json:"credits"`
	Energy         int     `json:"energy"`
	Version        int64   `json:"version"`
	CreatedAt      string  `json:"created_at"`
	UpdatedAt      string  `json:"updated_at"`
}

type characterResponse struct {
	ID                     string  `json:"id"`
	Slug                   string  `json:"slug"`
	Name                   string  `json:"name"`
	Biography              string  `json:"biography"`
	Archetype              string  `json:"archetype"`
	BaseHealth             int     `json:"base_health"`
	BaseAttack             int     `json:"base_attack"`
	BaseDefense            int     `json:"base_defense"`
	BaseSpeed              int     `json:"base_speed"`
	BaseCritRate           float64 `json:"base_crit_rate"`
	BaseCritDamage         float64 `json:"base_crit_damage"`
	SpecialMoveName        string  `json:"special_move_name"`
	SpecialMoveDescription string  `json:"special_move_description"`
	SpecialMoveType        string  `json:"special_move_type"`
	Rarity                 string  `json:"rarity"`
	ColorTheme             string  `json:"color_theme"`
	PortraitURL            string  `json:"portrait_url"`
	ModelURL               string  `json:"model_url"`
}

type encounterResponse struct {
	ID                     string  `json:"id"`
	Slug                   string  `json:"slug"`
	Name                   string  `json:"name"`
	Description            string  `json:"description"`
	Level                  int     `json:"level"`
	MaxHealth              int     `json:"max_health"`
	Attack                 int     `json:"attack"`
	Defense                int     `json:"defense"`
	Speed                  int     `json:"speed"`
	CritRate               float64 `json:"crit_rate"`
	CritDamage             float64 `json:"crit_damage"`
	SpecialMoveName        string  `json:"special_move_name"`
	SpecialMoveDescription string  `json:"special_move_description"`
	ColorTheme             string  `json:"color_theme"`
	ImageURL               *string `json:"image_url"`
}

func mapPlayer(item player.Player) playerResponse {
	displayName := strings.TrimSpace(valueOrEmpty(item.FirstName) + " " + valueOrEmpty(item.LastName))
	if displayName == "" && item.Username != nil {
		displayName = *item.Username
	}
	if displayName == "" {
		displayName = "Player"
	}
	return playerResponse{
		ID: item.ID, TelegramUserID: strconv.FormatInt(item.TelegramUserID, 10), Username: item.Username,
		DisplayName: displayName, Level: item.Level, Experience: item.Experience, Credits: item.Credits,
		Energy: item.Energy, Version: item.Version, CreatedAt: item.CreatedAt.UTC().Format("2006-01-02T15:04:05.000000Z07:00"),
		UpdatedAt: item.UpdatedAt.UTC().Format("2006-01-02T15:04:05.000000Z07:00"),
	}
}

func valueOrEmpty(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func mapCharacter(item character.Character, language string) characterResponse {
	return characterResponse{
		ID: item.ID, Slug: item.Slug, Name: item.Name.Resolve(language), Biography: item.Biography.Resolve(language),
		Archetype: item.Archetype, BaseHealth: item.BaseHealth, BaseAttack: item.BaseAttack,
		BaseDefense: item.BaseDefense, BaseSpeed: item.BaseSpeed, BaseCritRate: item.BaseCritRate,
		BaseCritDamage: item.BaseCritDamage, SpecialMoveName: item.SpecialMoveName.Resolve(language),
		SpecialMoveDescription: item.SpecialMoveDescription.Resolve(language), SpecialMoveType: item.SpecialMoveType,
		Rarity: item.Rarity, ColorTheme: item.ColorTheme, PortraitURL: item.PortraitURL, ModelURL: item.ModelURL,
	}
}

func mapEncounter(item character.Encounter, language string) encounterResponse {
	return encounterResponse{
		ID: item.ID, Slug: item.Slug, Name: item.Name.Resolve(language), Description: item.Description.Resolve(language),
		Level: item.Level, MaxHealth: item.MaxHealth, Attack: item.Attack, Defense: item.Defense,
		Speed: item.Speed, CritRate: item.CritRate, CritDamage: item.CritDamage,
		SpecialMoveName:        item.SpecialMoveName.Resolve(language),
		SpecialMoveDescription: item.SpecialMoveDescription.Resolve(language), ColorTheme: item.ColorTheme, ImageURL: item.ImageURL,
	}
}
