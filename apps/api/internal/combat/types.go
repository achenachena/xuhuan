package combat

import "errors"

const (
	BaseMaxHealth       = 64
	BaseBandwidth       = 3
	BaseHandSize        = 5
	MaximumHandSize     = 10
	BaseDistortionLimit = 6
)

var (
	ErrCombatComplete     = errors.New("combat: combat is complete")
	ErrCardNotInHand      = errors.New("combat: card is not in hand")
	ErrCardUnplayable     = errors.New("combat: card is unplayable")
	ErrInsufficientCost   = errors.New("combat: insufficient bandwidth")
	ErrInvalidTarget      = errors.New("combat: invalid target")
	ErrInsufficientMarker = errors.New("combat: insufficient beacon")
)

type Status string

const (
	Active Status = "active"
	Won    Status = "won"
	Lost   Status = "lost"
)

type CardInstance struct {
	ID   string `json:"id"`
	Slug string `json:"slug"`
}

type PlayerState struct {
	MaxHealth            int  `json:"max_health"`
	Health               int  `json:"health"`
	Block                int  `json:"block"`
	Bandwidth            int  `json:"bandwidth"`
	NextBandwidth        int  `json:"next_bandwidth"`
	Distortion           int  `json:"distortion"`
	DistortionLimit      int  `json:"distortion_limit"`
	Beacons              int  `json:"beacons"`
	Weak                 int  `json:"weak"`
	Vulnerable           int  `json:"vulnerable"`
	DiscountSignal       int  `json:"discount_signal"`
	DistortionShieldUsed bool `json:"distortion_shield_used"`
	FirstAttackBonusUsed bool `json:"first_attack_bonus_used"`
}

type EnemyState struct {
	ID          string `json:"id"`
	Slug        string `json:"slug"`
	MaxHealth   int    `json:"max_health"`
	Health      int    `json:"health"`
	Block       int    `json:"block"`
	Strength    int    `json:"strength"`
	Weak        int    `json:"weak"`
	Vulnerable  int    `json:"vulnerable"`
	IntentIndex int    `json:"intent_index"`
}

type State struct {
	Status           Status         `json:"status"`
	Turn             int            `json:"turn"`
	Seed             string         `json:"seed"`
	RNGCursor        uint64         `json:"rng_cursor"`
	Player           PlayerState    `json:"player"`
	Enemies          []EnemyState   `json:"enemies"`
	DrawPile         []CardInstance `json:"draw_pile"`
	DiscardPile      []CardInstance `json:"discard_pile"`
	Hand             []CardInstance `json:"hand"`
	ExhaustPile      []CardInstance `json:"exhaust_pile"`
	PlayedTypes      []string       `json:"played_types"`
	PreviousCardType string         `json:"previous_card_type,omitempty"`
	CardsPlayed      int            `json:"cards_played"`
	RouteCompleted   bool           `json:"route_completed"`
	NextCardSequence int            `json:"next_card_sequence"`
	NoiseLevel       int            `json:"noise_level"`
}

type Event struct {
	Kind       string `json:"kind"`
	Actor      string `json:"actor,omitempty"`
	TargetID   string `json:"target_id,omitempty"`
	CardSlug   string `json:"card_slug,omitempty"`
	IntentSlug string `json:"intent_slug,omitempty"`
	Amount     int    `json:"amount,omitempty"`
}

type Resolution struct {
	State  State   `json:"state"`
	Events []Event `json:"events"`
}
