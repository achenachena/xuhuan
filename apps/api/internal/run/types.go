package run

import (
	"context"
	"errors"
	"time"

	"github.com/achenachena/xuhuan/apps/api/internal/shooter"
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
	SegmentPhase    Phase = "segment"
	ShowChoicePhase Phase = "show_choice"
	StoryPhase      Phase = "story"
	CompletedPhase  Phase = "completed"
)

type SegmentState struct {
	SegmentSlug   string         `json:"segment_slug"`
	SegmentIndex  int            `json:"segment_index"`
	Seed          string         `json:"seed"`
	DurationTicks int            `json:"duration_ticks"`
	WaveID        string         `json:"wave_id,omitempty"`
	BossID        string         `json:"boss_id,omitempty"`
	RewardStage   string         `json:"reward_stage,omitempty"`
	BackgroundURL string         `json:"background_url"`
	RuntimeConfig shooter.Config `json:"runtime_config"`
}

type StoryState struct {
	SceneID   string   `json:"scene_id"`
	ChoiceIDs []string `json:"choice_ids"`
}

type State struct {
	Phase              Phase         `json:"phase"`
	ChapterSlug        string        `json:"chapter_slug"`
	CharacterSlug      string        `json:"character_slug"`
	CompanionSlugs     []string      `json:"companion_slugs"`
	EncoreLevel        int           `json:"encore_level"`
	Hearts             int           `json:"hearts"`
	MaxHearts          int           `json:"max_hearts"`
	SegmentIndex       int           `json:"segment_index"`
	Segment            *SegmentState `json:"segment,omitempty"`
	PendingShowOptions []string      `json:"pending_show_options"`
	ShowEffects        []string      `json:"show_effects"`
	Story              *StoryState   `json:"story,omitempty"`
	SelectedChoiceIDs  []string      `json:"selected_choice_ids"`
	Score              int           `json:"score"`
	EndingID           string        `json:"ending_id,omitempty"`
	DailyVariant       string        `json:"daily_variant,omitempty"`
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
	CompleteSegment         CommandType = "complete_segment"
	ChooseShowOption        CommandType = "choose_show_option"
	ChooseIntermissionReply CommandType = "choose_intermission_reply"
	AbandonRun              CommandType = "abandon_run"
)

type Command struct {
	Type           CommandType     `json:"type"`
	OptionID       string          `json:"option_id,omitempty"`
	SceneID        string          `json:"scene_id,omitempty"`
	SegmentOutcome *SegmentOutcome `json:"segment_outcome,omitempty"`
}

// SegmentOutcome is the bounded local result needed to advance durable state.
// Moment-to-moment combat stays on the device; the API remains authoritative
// over phases, rewards, unlocks, and atomic persistence.
type SegmentOutcome struct {
	Won    bool `json:"won"`
	Health int  `json:"health"`
	Score  int  `json:"score"`
}

type Event struct {
	Kind              string `json:"kind"`
	SegmentSlug       string `json:"segment_slug,omitempty"`
	ShowEffectID      string `json:"show_effect_id,omitempty"`
	SceneID           string `json:"scene_id,omitempty"`
	ChoiceID          string `json:"choice_id,omitempty"`
	ChoiceTag         string `json:"choice_tag,omitempty"`
	CompanionID       string `json:"companion_id,omitempty"`
	ChapterSlug       string `json:"chapter_slug,omitempty"`
	NextChapterSlug   string `json:"next_chapter_slug,omitempty"`
	NextCharacterSlug string `json:"next_character_slug,omitempty"`
	EndingID          string `json:"ending_id,omitempty"`
}

type Resolution struct {
	State  State   `json:"state"`
	Events []Event `json:"events"`
}

type StartInput struct {
	ChapterSlug     string
	CharacterSlug   string
	EncoreLevel     int
	Seed            string
	CompanionSlugs  []string
	SelectedChoices []string
	Mode            Mode
	DailyDate       *string
}

type StartRequest struct {
	Mode          Mode    `json:"mode"`
	ChapterSlug   string  `json:"chapter_slug"`
	CharacterSlug string  `json:"character_slug"`
	CompanionSlug string  `json:"companion_slug,omitempty"`
	EncoreLevel   int     `json:"encore_level"`
	DailyDate     *string `json:"daily_date,omitempty"`
}

type CreateInput struct {
	PlayerID       string
	ContentVersion string
	Seed           string
	State          State
	IdempotencyKey string
	Request        StartRequest
	Mode           Mode
	DailyDate      *string
}

type ApplyInput struct {
	PlayerID        string
	RunID           string
	Command         Command
	ExpectedVersion int64
	IdempotencyKey  string
}

type CommandResponse struct {
	Run    GameRun `json:"run"`
	Events []Event `json:"events"`
}

type DailyResult struct {
	Date           string    `json:"date"`
	CharacterSlug  string    `json:"character_slug"`
	Score          int       `json:"score"`
	ShowEffects    []string  `json:"show_effects"`
	CompanionSlugs []string  `json:"companion_slugs"`
	Streak         int       `json:"streak"`
	CompletedAt    time.Time `json:"-"`
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
