package shooter

import (
	"encoding/json"
	"errors"
)

const (
	ArenaWidth        = 3600
	ArenaHeight       = 6400
	TicksPerSecond    = 30
	MaxSegmentTicks   = 2700
	MaxEnemies        = 14
	MaxEnemyBullets   = 120
	MaxPlayerBullets  = 48
	MaxPickups        = 12
	MaxEffects        = 24
	TraceEncoding     = "x-position-rle-v1"
	RescueChargeLimit = 100
	// HitInvulnerabilityTicks gives the three-heart ON AIR health model enough
	// recovery time to make overlapping deterministic bullet patterns fair.
	HitInvulnerabilityTicks = 60
)

var ErrInvalidTrace = errors.New("shooter: invalid input trace")

// Input uses the low seven bits as an absolute horizontal position and the
// high bit as the one-shot Rescue button. There is intentionally no vertical
// input: a Telegram swipe can never be interpreted as movement or dismissal.
type Input struct {
	X      uint8 `json:"x"`
	Rescue bool  `json:"rescue"`
}

// TraceRun serializes as [control, count]. Runs longer than 255 Ticks are
// split into adjacent 255-Tick tuples with the same control byte.
type TraceRun [2]uint8

// UnmarshalJSON keeps the tuple wire contract exact. encoding/json normally
// accepts extra array elements when decoding into a fixed-size Go array,
// which would make the API accept traces that its OpenAPI schema rejects.
func (run *TraceRun) UnmarshalJSON(data []byte) error {
	var values []uint8
	if err := json.Unmarshal(data, &values); err != nil || len(values) != len(run) {
		return ErrInvalidTrace
	}
	copy(run[:], values)
	return nil
}

type InputTrace struct {
	Encoding string     `json:"encoding"`
	Ticks    int        `json:"ticks"`
	Runs     []TraceRun `json:"runs"`
}

type Limits struct {
	Enemies           int `json:"enemies"`
	EnemyProjectiles  int `json:"enemy_projectiles"`
	PlayerProjectiles int `json:"player_projectiles"`
	Pickups           int `json:"pickups"`
	Effects           int `json:"effects"`
}

func DefaultLimits() Limits {
	return Limits{Enemies: MaxEnemies, EnemyProjectiles: MaxEnemyBullets, PlayerProjectiles: MaxPlayerBullets, Pickups: MaxPickups, Effects: MaxEffects}
}

type EffectKind string

const (
	EffectTwinShot        EffectKind = "twin_shot"
	EffectPiercingShot    EffectKind = "piercing_shot"
	EffectSpreadShot      EffectKind = "spread_shot"
	EffectGrazeCharge     EffectKind = "graze_charge"
	EffectGuardOnSpecial  EffectKind = "guard_on_special"
	EffectPickupMagnet    EffectKind = "pickup_magnet"
	EffectEchoVolley      EffectKind = "echo_volley"
	EffectBossBreak       EffectKind = "boss_break"
	EffectLowHealthPower  EffectKind = "low_health_power"
	EffectComboExtend     EffectKind = "combo_extend"
	EffectCompanionCharge EffectKind = "companion_charge"
	EffectRecoveryDrop    EffectKind = "recovery_drop"
)

var SupportedShowEffects = [...]EffectKind{
	EffectTwinShot, EffectPiercingShot, EffectSpreadShot, EffectGrazeCharge,
	EffectGuardOnSpecial, EffectPickupMagnet, EffectEchoVolley, EffectBossBreak,
	EffectLowHealthPower, EffectComboExtend, EffectCompanionCharge, EffectRecoveryDrop,
}

type Effect struct {
	Kind   EffectKind `json:"kind"`
	Amount int        `json:"amount"`
}

type KitID string

const (
	KitNana     KitID = "nana7mi"
	KitJiaran   KitID = "jiaran"
	KitXiangwan KitID = "xiangwan"
	KitBella    KitID = "bella"
	KitLulu     KitID = "lulu"
	KitXingtong KitID = "xingtong"
	KitNailu    KitID = "nailu"
)

var SupportedKits = [...]KitID{KitNana, KitJiaran, KitXiangwan, KitBella, KitLulu, KitXingtong, KitNailu}

type Kit struct {
	ID              KitID  `json:"id"`
	MaxHealth       int    `json:"max_health"`
	AttackDamage    int    `json:"attack_damage"`
	FireInterval    int    `json:"fire_interval"`
	RescueDamage    int    `json:"rescue_damage"`
	StartingShield  int    `json:"starting_shield"`
	MoveLimit       int    `json:"move_limit"`
	SpecialBehavior string `json:"special_behavior"`
	SpecialDuration int    `json:"special_duration"`
}

type CompanionID string

const (
	CompanionNana     CompanionID = "nana7mi-assist"
	CompanionJiaran   CompanionID = "jiaran-assist"
	CompanionXiangwan CompanionID = "xiangwan-assist"
	CompanionBella    CompanionID = "bella-assist"
	CompanionLulu     CompanionID = "lulu-assist"
	CompanionXingtong CompanionID = "xingtong-assist"
	CompanionNailu    CompanionID = "nailu-assist"
)

var SupportedCompanions = [...]CompanionID{
	CompanionNana, CompanionJiaran, CompanionXiangwan, CompanionBella,
	CompanionLulu, CompanionXingtong, CompanionNailu,
}

type Companion struct {
	ID            CompanionID `json:"id"`
	Trigger       string      `json:"trigger"`
	Behavior      string      `json:"behavior"`
	Amount        int         `json:"amount"`
	CooldownTicks int         `json:"cooldown_ticks"`
}

type Chassis string

const (
	ChassisSpamBot          Chassis = "spam-bot"
	ChassisClipCutter       Chassis = "clip-cutter"
	ChassisCaptionBlob      Chassis = "caption-blob"
	ChassisBlackScreenGhost Chassis = "black-screen-ghost"
	ChassisGiftThief        Chassis = "gift-thief"
	ChassisCensorFrame      Chassis = "censor-frame"
)

var SupportedChassis = [...]Chassis{
	ChassisSpamBot, ChassisClipCutter, ChassisCaptionBlob,
	ChassisBlackScreenGhost, ChassisGiftThief, ChassisCensorFrame,
}

type EnemySpec struct {
	ID              string   `json:"id"`
	Chassis         Chassis  `json:"chassis"`
	Health          int      `json:"health"`
	Speed           int      `json:"speed"`
	ContactDamage   int      `json:"contact_damage"`
	MovePattern     string   `json:"move_pattern"`
	ShotPattern     string   `json:"shot_pattern"`
	FireInterval    int      `json:"fire_interval"`
	ProjectileSpeed int      `json:"projectile_speed"`
	Damage          int      `json:"damage"`
	Score           int      `json:"score"`
	TelegraphTicks  int      `json:"telegraph_ticks"`
	Traits          []string `json:"traits"`
}

type Spawn struct {
	AtTick        int    `json:"at_tick"`
	EnemyID       string `json:"enemy_id"`
	Count         int    `json:"count"`
	Formation     string `json:"formation"`
	IntervalTicks int    `json:"interval_ticks"`
}

type Wave struct {
	ID     string  `json:"id"`
	Spawns []Spawn `json:"spawns"`
}

type BossID string

const (
	BossOptimalNana         BossID = "optimal-nana"
	BossAlwaysOnIdol        BossID = "always-on-idol"
	BossPerfectHighlight    BossID = "perfect-highlight"
	BossPerfectCaptain      BossID = "perfect-captain"
	BossApprovedTranslation BossID = "approved-translation"
	BossPhysicalOriginal    BossID = "physical-original"
	BossRealityAuditor      BossID = "reality-auditor"
	BossAutoArchiveSystem   BossID = "auto-archive-system"
)

var SupportedBosses = [...]BossID{
	BossOptimalNana, BossAlwaysOnIdol, BossPerfectHighlight, BossPerfectCaptain,
	BossApprovedTranslation, BossPhysicalOriginal, BossRealityAuditor, BossAutoArchiveSystem,
}

type BossStage struct {
	ID              string `json:"id"`
	HealthThreshold int    `json:"health_threshold"`
	MovePattern     string `json:"move_pattern"`
	ShotPattern     string `json:"shot_pattern"`
	FireInterval    int    `json:"fire_interval"`
	ProjectileSpeed int    `json:"projectile_speed"`
	Damage          int    `json:"damage"`
	TelegraphTicks  int    `json:"telegraph_ticks"`
	Special         string `json:"special,omitempty"`
}

type Boss struct {
	ID     BossID      `json:"id"`
	Health int         `json:"health"`
	Score  int         `json:"score"`
	Stages []BossStage `json:"stages"`
}

type Config struct {
	Seed                 string `json:"seed"`
	DurationTicks        int    `json:"duration_ticks"`
	PlayerHealth         int    `json:"player_health"`
	StartingRescueCharge int    `json:"starting_rescue_charge"`
	StoryChoiceID        string `json:"story_choice_id,omitempty"`
	EncoreLevel          int    `json:"encore_level"`
	Daily                bool   `json:"daily"`
	DailyModifierID      string `json:"daily_modifier_id,omitempty"`
	// SpecialChargePenaltyPercent reduces earned Rescue charge by this percentage.
	// A positive value always makes Rescue slower; zero preserves the base rate.
	SpecialChargePenaltyPercent int         `json:"special_charge_penalty_percent"`
	Kit                         Kit         `json:"kit"`
	Companions                  []Companion `json:"companions"`
	ShowEffects                 []Effect    `json:"show_effects"`
	Enemies                     []EnemySpec `json:"enemies"`
	Wave                        Wave        `json:"wave"`
	Boss                        *Boss       `json:"boss,omitempty"`
	Limits                      Limits      `json:"limits"`
}

type Position struct {
	X int `json:"x"`
	Y int `json:"y"`
}

type EnemySnapshot struct {
	ID        int      `json:"id"`
	SpecID    string   `json:"spec_id"`
	Chassis   Chassis  `json:"chassis"`
	Position  Position `json:"position"`
	Health    int      `json:"health"`
	MaxHealth int      `json:"max_health"`
	Boss      bool     `json:"boss"`
	Stage     int      `json:"stage,omitempty"`
	Intent    string   `json:"intent,omitempty"`
	Marks     int      `json:"marks,omitempty"`
}

type ProjectileSnapshot struct {
	ID       int      `json:"id"`
	Position Position `json:"position"`
	Velocity Position `json:"velocity"`
	Hostile  bool     `json:"hostile"`
	Kind     string   `json:"kind,omitempty"`
	Radius   int      `json:"radius,omitempty"`
	Width    int      `json:"width,omitempty"`
	Health   int      `json:"health,omitempty"`
}

type PickupSnapshot struct {
	ID       int      `json:"id"`
	Kind     string   `json:"kind"`
	Position Position `json:"position"`
	Value    int      `json:"value"`
}

// ThreatSnapshot is renderer-ready telegraph geometry. It is derived from the
// authoritative fire clocks, so clients never have to guess warning timing.
type ThreatSnapshot struct {
	SourceID       int      `json:"source_id"`
	Kind           string   `json:"kind"`
	TicksRemaining int      `json:"ticks_remaining"`
	Origin         Position `json:"origin"`
	Target         Position `json:"target"`
	Radius         int      `json:"radius,omitempty"`
	Width          int      `json:"width,omitempty"`
}

type EffectSnapshot struct {
	ID       int      `json:"id"`
	Kind     string   `json:"kind"`
	Position Position `json:"position"`
	Ticks    int      `json:"ticks"`
	Power    int      `json:"power,omitempty"`
}

type Snapshot struct {
	Tick              int                  `json:"tick"`
	PlayerX           int                  `json:"player_x"`
	Health            int                  `json:"health"`
	MaxHealth         int                  `json:"max_health"`
	Shield            int                  `json:"shield"`
	InvulnerableTicks int                  `json:"invulnerable_ticks"`
	RescueCharge      int                  `json:"rescue_charge"`
	RescuesUsed       int                  `json:"rescues_used"`
	GrazeCount        int                  `json:"graze_count"`
	Combo             int                  `json:"combo"`
	Score             int                  `json:"score"`
	DailyVariant      string               `json:"daily_variant,omitempty"`
	Enemies           []EnemySnapshot      `json:"enemies"`
	EnemyProjectiles  []ProjectileSnapshot `json:"enemy_projectiles"`
	PlayerProjectiles []ProjectileSnapshot `json:"player_projectiles"`
	Pickups           []PickupSnapshot     `json:"pickups"`
	Threats           []ThreatSnapshot     `json:"threats"`
	Effects           []EffectSnapshot     `json:"effects"`
}

type Result struct {
	Won          bool     `json:"won"`
	Health       int      `json:"health"`
	Ticks        int      `json:"ticks"`
	Kills        int      `json:"kills"`
	RescuesUsed  int      `json:"rescues_used"`
	Grazes       int      `json:"grazes"`
	Score        int      `json:"score"`
	DailyVariant string   `json:"daily_variant,omitempty"`
	Final        Snapshot `json:"final"`
}
