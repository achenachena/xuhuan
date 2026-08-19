package run

import (
	"context"
	"errors"
	"time"

	"github.com/achenachena/xuhuan/apps/api/internal/combat"
)

var (
	ErrInvalidCommand      = errors.New("run: invalid command")
	ErrRunNotActive        = errors.New("run: run is not active")
	ErrVersionConflict     = errors.New("run: expected version conflict")
	ErrIdempotencyConflict = errors.New("run: idempotency key reused with different request")
	ErrActiveRunExists     = errors.New("run: an active run already exists")
	ErrContentLocked       = errors.New("run: requested content is locked")
)

type Status string

const (
	Active    Status = "active"
	Completed Status = "completed"
	Abandoned Status = "abandoned"
)

type Outcome string

const (
	Cleared Outcome = "cleared"
	Failed  Outcome = "failed"
	Quit    Outcome = "abandoned"
)

type Phase string

const (
	MapPhase       Phase = "map"
	CombatPhase    Phase = "combat"
	RewardPhase    Phase = "reward"
	EventPhase     Phase = "event"
	RestPhase      Phase = "rest"
	CompletedPhase Phase = "completed"
)

type NodeType string

const (
	CombatNode NodeType = "combat"
	EliteNode  NodeType = "elite"
	EventNode  NodeType = "event"
	StoryNode  NodeType = "story"
	RestNode   NodeType = "rest"
	BossNode   NodeType = "boss"
)

type NodeStatus string

const (
	LockedNode    NodeStatus = "locked"
	AvailableNode NodeStatus = "available"
	CurrentNode   NodeStatus = "current"
	CompletedNode NodeStatus = "completed"
)

type MapNode struct {
	ID         string     `json:"id"`
	Layer      int        `json:"layer"`
	Lane       int        `json:"lane"`
	Type       NodeType   `json:"type"`
	Status     NodeStatus `json:"status"`
	Next       []string   `json:"next"`
	EnemySlugs []string   `json:"enemy_slugs,omitempty"`
	EventSlug  string     `json:"event_slug,omitempty"`
}

type MapState struct {
	Nodes         []MapNode `json:"nodes"`
	CurrentNodeID string    `json:"current_node_id,omitempty"`
}

type RewardState struct {
	CardChoices  []string `json:"card_choices"`
	GrantedRelic string   `json:"granted_relic,omitempty"`
}

type State struct {
	Phase            Phase                 `json:"phase"`
	ChapterSlug      string                `json:"chapter_slug"`
	CharacterSlug    string                `json:"character_slug"`
	NoiseLevel       int                   `json:"noise_level"`
	Health           int                   `json:"health"`
	MaxHealth        int                   `json:"max_health"`
	Deck             []combat.CardInstance `json:"deck"`
	Relics           []string              `json:"relics"`
	Map              MapState              `json:"map"`
	Combat           *combat.State         `json:"combat,omitempty"`
	Reward           *RewardState          `json:"reward,omitempty"`
	CurrentEventSlug string                `json:"current_event_slug,omitempty"`
	ChoiceTags       []string              `json:"choice_tags"`
	NextCardSequence int                   `json:"next_card_sequence"`
	RNGCursor        uint64                `json:"rng_cursor"`
}

type GameRun struct {
	ID             string     `json:"id"`
	PlayerID       string     `json:"-"`
	ContentVersion string     `json:"content_version"`
	Seed           string     `json:"-"`
	State          State      `json:"state"`
	Status         Status     `json:"status"`
	Outcome        *Outcome   `json:"outcome"`
	Version        int64      `json:"version"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
	CompletedAt    *time.Time `json:"completed_at"`
}

type CommandType string

const (
	ChooseNode       CommandType = "choose_node"
	PlayCard         CommandType = "play_card"
	EndTurn          CommandType = "end_turn"
	ChooseCardReward CommandType = "choose_card_reward"
	ResolveEvent     CommandType = "resolve_event"
	Rest             CommandType = "rest"
	AbandonRun       CommandType = "abandon_run"
)

type Command struct {
	Type           CommandType `json:"type"`
	NodeID         string      `json:"node_id,omitempty"`
	CardInstanceID string      `json:"card_instance_id,omitempty"`
	TargetID       string      `json:"target_id,omitempty"`
	ChoiceSlug     string      `json:"choice_slug,omitempty"`
	Operation      string      `json:"operation,omitempty"`
}

type Event struct {
	Kind      string        `json:"kind"`
	NodeID    string        `json:"node_id,omitempty"`
	CardSlug  string        `json:"card_slug,omitempty"`
	RelicSlug string        `json:"relic_slug,omitempty"`
	ChoiceTag string        `json:"choice_tag,omitempty"`
	Amount    int           `json:"amount,omitempty"`
	Combat    *combat.Event `json:"combat,omitempty"`
}

type Resolution struct {
	State  State   `json:"state"`
	Events []Event `json:"events"`
}

type StartInput struct {
	ChapterSlug   string
	CharacterSlug string
	NoiseLevel    int
	Seed          string
}

type CreateInput struct {
	PlayerID       string
	ContentVersion string
	Seed           string
	State          State
	IdempotencyKey string
	RequestHash    [32]byte
}

type ApplyInput struct {
	PlayerID        string
	RunID           string
	Command         Command
	ExpectedVersion int64
	IdempotencyKey  string
	RequestHash     [32]byte
}

type CommandResponse struct {
	Run    GameRun `json:"run"`
	Events []Event `json:"events"`
}

type Resolver func(GameRun, Command) (Resolution, *Outcome, error)

type Repository interface {
	Create(context.Context, CreateInput) (GameRun, bool, error)
	Get(context.Context, string, string) (GameRun, error)
	GetActive(context.Context, string) (*GameRun, error)
	Apply(context.Context, ApplyInput, Resolver) (CommandResponse, bool, error)
}
