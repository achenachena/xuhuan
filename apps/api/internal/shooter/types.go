// Package shooter defines the runtime configuration shared with the browser.
// Combat runs locally in the Mini App; the API owns legal run transitions,
// rewards, and durable progression instead of replaying every animation tick.
package shooter

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
	RescueChargeLimit = 100
	// HitInvulnerabilityTicks gives the three-heart ON AIR health model enough
	// recovery time to make overlapping deterministic bullet patterns fair.
	HitInvulnerabilityTicks = 60
)

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
