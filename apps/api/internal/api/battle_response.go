package api

import (
	"time"

	"github.com/achenachena/xuhuan/apps/api/internal/battle"
)

type combatantResponse struct {
	Slug          string  `json:"slug"`
	Name          string  `json:"name"`
	Level         int     `json:"level"`
	MaxHealth     int     `json:"max_health"`
	CurrentHealth int     `json:"current_health"`
	Attack        int     `json:"attack"`
	Defense       int     `json:"defense"`
	Speed         int     `json:"speed"`
	CritRate      float64 `json:"crit_rate"`
	CritDamage    float64 `json:"crit_damage"`
	SpecialMeter  int     `json:"special_meter"`
	ComboCount    int     `json:"combo_count"`
	IsBlocking    bool    `json:"is_blocking"`
}

type rewardResponse struct {
	Experience int64 `json:"experience"`
	Credits    int64 `json:"credits"`
	Energy     int   `json:"energy"`
}

type battleResponse struct {
	ID          string            `json:"id"`
	Status      string            `json:"status"`
	Outcome     *string           `json:"outcome"`
	Version     int64             `json:"version"`
	Turn        int               `json:"turn"`
	Character   characterResponse `json:"character"`
	Encounter   encounterResponse `json:"encounter"`
	Hero        combatantResponse `json:"hero"`
	Enemy       combatantResponse `json:"enemy"`
	Rewards     *rewardResponse   `json:"rewards"`
	CreatedAt   string            `json:"created_at"`
	UpdatedAt   string            `json:"updated_at"`
	CompletedAt *string           `json:"completed_at"`
}

type damageResponse struct {
	Amount    int  `json:"amount"`
	Critical  bool `json:"critical"`
	Blocked   bool `json:"blocked"`
	Countered bool `json:"countered"`
}

type actionEventResponse struct {
	Actor       string          `json:"actor"`
	Action      string          `json:"action"`
	Damage      *damageResponse `json:"damage"`
	Description string          `json:"description"`
}

type actionResultResponse struct {
	Sequence int                   `json:"sequence"`
	Events   []actionEventResponse `json:"events"`
}

type battleActionResponse struct {
	Battle battleResponse       `json:"battle"`
	Result actionResultResponse `json:"result"`
}

func mapBattle(item battle.Battle, language string) battleResponse {
	var outcome *string
	if item.Outcome != nil {
		value := string(*item.Outcome)
		outcome = &value
	}
	var rewards *rewardResponse
	if item.Rewards != nil {
		rewards = &rewardResponse{Experience: item.Rewards.Experience, Credits: item.Rewards.Credits, Energy: item.Rewards.Energy}
	}
	var completedAt *string
	if item.CompletedAt != nil {
		value := item.CompletedAt.UTC().Format(time.RFC3339Nano)
		completedAt = &value
	}
	hero := item.State.Hero
	enemy := item.State.Enemy
	hero.Name = item.Character.Name.Resolve(language)
	enemy.Name = item.Encounter.Name.Resolve(language)
	return battleResponse{
		ID: item.ID, Status: string(item.Status), Outcome: outcome, Version: item.Version, Turn: item.State.Turn,
		Character: mapCharacter(item.Character, language), Encounter: mapEncounter(item.Encounter, language),
		Hero: mapCombatant(hero), Enemy: mapCombatant(enemy), Rewards: rewards,
		CreatedAt: item.CreatedAt.UTC().Format(time.RFC3339Nano), UpdatedAt: item.UpdatedAt.UTC().Format(time.RFC3339Nano), CompletedAt: completedAt,
	}
}

func mapCombatant(item battle.Combatant) combatantResponse {
	return combatantResponse{
		Slug: item.Slug, Name: item.Name, Level: item.Level, MaxHealth: item.MaxHealth,
		CurrentHealth: item.CurrentHealth, Attack: item.Attack, Defense: item.Defense, Speed: item.Speed,
		CritRate: item.CritRate, CritDamage: item.CritDamage, SpecialMeter: item.SpecialMeter,
		ComboCount: item.ComboCount, IsBlocking: item.IsBlocking,
	}
}

func mapBattleAction(item battle.ActionResponse, language string) battleActionResponse {
	events := make([]actionEventResponse, 0, len(item.Result.Events))
	for _, event := range item.Result.Events {
		var damage *damageResponse
		if event.Damage != nil {
			damage = &damageResponse{
				Amount: event.Damage.Amount, Critical: event.Damage.Critical,
				Blocked: event.Damage.Blocked, Countered: event.Damage.Countered,
			}
		}
		events = append(events, actionEventResponse{
			Actor: event.Actor, Action: string(event.Action), Damage: damage, Description: event.Description,
		})
	}
	return battleActionResponse{
		Battle: mapBattle(item.Battle, language),
		Result: actionResultResponse{Sequence: item.Result.Sequence, Events: events},
	}
}
