package battle

import (
	"time"

	"github.com/achenachena/xuhuan/apps/api/internal/character"
)

type ActionKind string

const (
	LightAttack ActionKind = "light_attack"
	HeavyAttack ActionKind = "heavy_attack"
	SpecialMove ActionKind = "special_move"
	Block       ActionKind = "block"
	Counter     ActionKind = "counter"
)

type Status string

const (
	Active    Status = "active"
	Completed Status = "completed"
	Cancelled Status = "cancelled"
)

type Outcome string

const (
	Victory Outcome = "victory"
	Defeat  Outcome = "defeat"
)

type Combatant struct {
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

type State struct {
	Turn      int       `json:"turn"`
	RNGCursor uint64    `json:"rng_cursor"`
	Hero      Combatant `json:"hero"`
	Enemy     Combatant `json:"enemy"`
}

type Reward struct {
	Experience int64 `json:"experience"`
	Credits    int64 `json:"credits"`
	Energy     int   `json:"energy"`
}

type Battle struct {
	ID          string              `json:"id"`
	PlayerID    string              `json:"player_id"`
	Character   character.Character `json:"character"`
	Encounter   character.Encounter `json:"encounter"`
	Seed        string              `json:"seed"`
	State       State               `json:"state"`
	Status      Status              `json:"status"`
	Outcome     *Outcome            `json:"outcome"`
	Rewards     *Reward             `json:"rewards"`
	Version     int64               `json:"version"`
	CreatedAt   time.Time           `json:"created_at"`
	UpdatedAt   time.Time           `json:"updated_at"`
	CompletedAt *time.Time          `json:"completed_at"`
}

type DamageResult struct {
	Amount    int  `json:"amount"`
	Critical  bool `json:"critical"`
	Blocked   bool `json:"blocked"`
	Countered bool `json:"countered"`
}

type Event struct {
	Actor       string        `json:"actor"`
	Action      ActionKind    `json:"action"`
	Damage      *DamageResult `json:"damage"`
	Description string        `json:"description"`
}

type ActionResult struct {
	Sequence int     `json:"sequence"`
	Events   []Event `json:"events"`
}

type ActionResponse struct {
	Battle Battle       `json:"battle"`
	Result ActionResult `json:"result"`
}

type StartInput struct {
	CharacterSlug  string
	EncounterSlug  string
	IdempotencyKey string
}

type ActionInput struct {
	BattleID        string
	Action          ActionKind
	ExpectedVersion int64
	IdempotencyKey  string
}
