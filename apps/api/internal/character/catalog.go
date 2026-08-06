package character

import (
	"context"
)

type LocalizedText struct {
	ZHCN string `json:"zh_cn"`
	EN   string `json:"en"`
}

func (t LocalizedText) Resolve(language string) string {
	if language == "en" && t.EN != "" {
		return t.EN
	}
	return t.ZHCN
}

type Character struct {
	ID                     string        `json:"id"`
	Slug                   string        `json:"slug"`
	Name                   LocalizedText `json:"name"`
	Biography              LocalizedText `json:"biography"`
	Archetype              string        `json:"archetype"`
	BaseHealth             int           `json:"base_health"`
	BaseAttack             int           `json:"base_attack"`
	BaseDefense            int           `json:"base_defense"`
	BaseSpeed              int           `json:"base_speed"`
	BaseCritRate           float64       `json:"base_crit_rate"`
	BaseCritDamage         float64       `json:"base_crit_damage"`
	SpecialMoveName        LocalizedText `json:"special_move_name"`
	SpecialMoveDescription LocalizedText `json:"special_move_description"`
	SpecialMoveType        string        `json:"special_move_type"`
	Rarity                 string        `json:"rarity"`
	ColorTheme             string        `json:"color_theme"`
	PortraitURL            string        `json:"portrait_url"`
	ModelURL               string        `json:"model_url"`
}

type Encounter struct {
	ID                     string        `json:"id"`
	Slug                   string        `json:"slug"`
	Name                   LocalizedText `json:"name"`
	Description            LocalizedText `json:"description"`
	Level                  int           `json:"level"`
	MaxHealth              int           `json:"max_health"`
	Attack                 int           `json:"attack"`
	Defense                int           `json:"defense"`
	Speed                  int           `json:"speed"`
	CritRate               float64       `json:"crit_rate"`
	CritDamage             float64       `json:"crit_damage"`
	SpecialMoveName        LocalizedText `json:"special_move_name"`
	SpecialMoveDescription LocalizedText `json:"special_move_description"`
	ColorTheme             string        `json:"color_theme"`
	ImageURL               *string       `json:"image_url"`
}

type Repository interface {
	ListCharacters(context.Context) ([]Character, error)
	GetCharacter(context.Context, string) (Character, error)
	ListEncounters(context.Context) ([]Encounter, error)
	GetEncounter(context.Context, string) (Encounter, error)
}

type Service struct {
	repository Repository
}

func NewService(repository Repository) *Service {
	return &Service{repository: repository}
}

func (s *Service) ListCharacters(ctx context.Context) ([]Character, error) {
	return s.repository.ListCharacters(ctx)
}

func (s *Service) GetCharacter(ctx context.Context, slug string) (Character, error) {
	return s.repository.GetCharacter(ctx, slug)
}

func (s *Service) ListEncounters(ctx context.Context) ([]Encounter, error) {
	return s.repository.ListEncounters(ctx)
}

func (s *Service) GetEncounter(ctx context.Context, slug string) (Encounter, error) {
	return s.repository.GetEncounter(ctx, slug)
}
