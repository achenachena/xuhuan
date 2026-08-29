package run

import (
	"context"
	"errors"
	"time"

	"github.com/achenachena/xuhuan/apps/api/internal/action"
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

type Mode string

const (
	CampaignMode Mode = "campaign"
	DailyMode    Mode = "daily"
)

type Phase string

const (
	MapPhase       Phase = "map"
	EncounterPhase Phase = "encounter"
	RewardPhase    Phase = "reward"
	EventPhase     Phase = "event"
	RestPhase      Phase = "rest"
	CompletedPhase Phase = "completed"
)

type NodeType string

const (
	CombatNode   NodeType = "combat"
	EliteNode    NodeType = "elite"
	EventNode    NodeType = "event"
	StoryNode    NodeType = "story"
	RestNode     NodeType = "rest"
	BossNode     NodeType = "boss"
	TutorialNode NodeType = "tutorial"
)

type NodeStatus string

const (
	LockedNode    NodeStatus = "locked"
	AvailableNode NodeStatus = "available"
	CurrentNode   NodeStatus = "current"
	CompletedNode NodeStatus = "completed"
)

type MapNode struct {
	ID            string     `json:"id"`
	Layer         int        `json:"layer"`
	Lane          int        `json:"lane"`
	Type          NodeType   `json:"type"`
	Status        NodeStatus `json:"status"`
	Next          []string   `json:"next"`
	EncounterSlug string     `json:"encounter_slug,omitempty"`
	EventSlug     string     `json:"event_slug,omitempty"`
	Objective     string     `json:"objective,omitempty"`
	Risk          int        `json:"risk,omitempty"`
	RewardBias    string     `json:"reward_bias,omitempty"`
	EnemySlugs    []string   `json:"enemy_slugs,omitempty"`
	Hazards       []string   `json:"hazards,omitempty"`
}
type MapState struct {
	Nodes         []MapNode `json:"nodes"`
	CurrentNodeID string    `json:"current_node_id,omitempty"`
}
type ModuleLevel struct {
	Slug  string `json:"slug"`
	Level int    `json:"level"`
}
type EncounterState struct {
	Slug          string                 `json:"slug"`
	Seed          string                 `json:"seed"`
	Kind          string                 `json:"kind"`
	DurationTicks int                    `json:"duration_ticks"`
	MaxTicks      int                    `json:"max_ticks"`
	Tutorial      bool                   `json:"tutorial"`
	Objective     action.ObjectiveConfig `json:"objective"`
	Risk          int                    `json:"risk"`
	RewardBias    string                 `json:"reward_bias"`
	Hazards       []string               `json:"hazards"`
}
type RewardState struct {
	ModuleChoices []string `json:"module_choices"`
	GrantedPlugin string   `json:"granted_plugin,omitempty"`
	Rerolled      bool     `json:"rerolled"`
}

type RewardPool struct {
	ModuleSlugs []string `json:"module_slugs"`
	PluginSlugs []string `json:"plugin_slugs"`
}

// NarrativeModifier is the authoritative gameplay projection of the latest
// authored story branch. It is frozen into each command result so reward and
// Boss behavior remain deterministic across reconnects.
type NarrativeModifier struct {
	RewardBias      string `json:"reward_bias,omitempty"`
	BossVariant     string `json:"boss_variant"`
	SourceSceneSlug string `json:"source_scene_slug,omitempty"`
	SourceChoiceTag string `json:"source_choice_tag,omitempty"`
}

type State struct {
	Phase                       Phase                `json:"phase"`
	ChapterSlug                 string               `json:"chapter_slug"`
	CharacterSlug               string               `json:"character_slug"`
	CompanionSlugs              []string             `json:"companion_slugs"`
	SupportAlignment            string               `json:"support_alignment,omitempty"`
	WeaponSlug                  string               `json:"weapon_slug"`
	NoiseLevel                  int                  `json:"noise_level"`
	Health                      int                  `json:"health"`
	MaxHealth                   int                  `json:"max_health"`
	Modules                     []ModuleLevel        `json:"modules"`
	Plugins                     []string             `json:"plugins"`
	RewardPool                  RewardPool           `json:"reward_pool"`
	NarrativeModifier           NarrativeModifier    `json:"narrative_modifier"`
	Map                         MapState             `json:"map"`
	Encounter                   *EncounterState      `json:"encounter,omitempty"`
	Reward                      *RewardState         `json:"reward,omitempty"`
	CurrentEventSlug            string               `json:"current_event_slug,omitempty"`
	ChoiceTags                  []string             `json:"choice_tags"`
	RNGCursor                   uint64               `json:"rng_cursor"`
	EmergencyReconnectAvailable bool                 `json:"emergency_reconnect_available"`
	RuntimeConfig               action.RuntimeConfig `json:"runtime_config"`
	RerollsRemaining            int                  `json:"rerolls_remaining"`
	Score                       int                  `json:"score"`
}

type GameRun struct {
	ID             string     `json:"id"`
	PlayerID       string     `json:"-"`
	ContentVersion string     `json:"content_version"`
	Mode           Mode       `json:"mode"`
	DailyDate      *string    `json:"daily_date,omitempty"`
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
	ChooseNode         CommandType = "choose_node"
	CompleteEncounter  CommandType = "complete_encounter"
	ChooseModuleReward CommandType = "choose_module_reward"
	RerollModuleReward CommandType = "reroll_module_reward"
	ResolveEvent       CommandType = "resolve_event"
	Rest               CommandType = "rest"
	AbandonRun         CommandType = "abandon_run"
)

type Command struct {
	Type       CommandType        `json:"type"`
	NodeID     string             `json:"node_id,omitempty"`
	ChoiceSlug string             `json:"choice_slug,omitempty"`
	ModuleSlug string             `json:"module_slug,omitempty"`
	Operation  string             `json:"operation,omitempty"`
	Trace      *action.InputTrace `json:"trace,omitempty"`
}
type Event struct {
	Kind              string         `json:"kind"`
	NodeID            string         `json:"node_id,omitempty"`
	SceneSlug         string         `json:"scene_slug,omitempty"`
	ModuleSlug        string         `json:"module_slug,omitempty"`
	PluginSlug        string         `json:"plugin_slug,omitempty"`
	ChoiceTag         string         `json:"choice_tag,omitempty"`
	Amount            int            `json:"amount,omitempty"`
	EncounterResult   *action.Result `json:"encounter_result,omitempty"`
	Trust             int            `json:"trust,omitempty"`
	Authenticity      int            `json:"authenticity,omitempty"`
	Retention         int            `json:"retention,omitempty"`
	ChapterSlug       string         `json:"chapter_slug,omitempty"`
	NextChapterSlug   string         `json:"next_chapter_slug,omitempty"`
	NextCharacterSlug string         `json:"next_character_slug,omitempty"`
}
type Resolution struct {
	State  State   `json:"state"`
	Events []Event `json:"events"`
}
type StartInput struct {
	ChapterSlug                 string
	CharacterSlug               string
	NoiseLevel                  int
	Seed                        string
	EmergencyReconnectAvailable bool
	TutorialCompleted           bool
	CompanionSlugs              []string
	SupportAlignment            string
	Mode                        Mode
	DailyDate                   *string
	UnlockedModuleSlugs         []string
	UnlockedPluginSlugs         []string
	StarterModuleSlug           string
	NarrativeModifier           NarrativeModifier
	ChoiceTags                  []string
}
type CreateInput struct {
	PlayerID       string
	ContentVersion string
	Seed           string
	State          State
	IdempotencyKey string
	RequestHash    [32]byte
	Mode           Mode
	DailyDate      *string
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
type DailyResult struct {
	Date          string        `json:"date"`
	CharacterSlug string        `json:"character_slug"`
	Score         int           `json:"score"`
	Modules       []ModuleLevel `json:"modules"`
	Plugins       []string      `json:"plugins"`
	Streak        int           `json:"streak"`
	CompletedAt   time.Time     `json:"-"`
}
type Resolver func(GameRun, Command) (Resolution, *Outcome, error)
type Repository interface {
	Create(context.Context, CreateInput) (GameRun, bool, error)
	Get(context.Context, string, string) (GameRun, error)
	GetActive(context.Context, string, Mode) (*GameRun, error)
	Apply(context.Context, ApplyInput, Resolver) (CommandResponse, bool, error)
	GetDailyResult(context.Context, string, string) (*DailyResult, error)
	GetPublicDailyResult(context.Context, string) (DailyResult, error)
}
