package action

import "errors"

const (
	ArenaWidth       = 3600
	ArenaHeight      = 6400
	TicksPerSecond   = 30
	NormalMaxTicks   = 1800
	BossMaxTicks     = 2700
	MaxEnemies       = 18
	MaxProjectiles   = 160
	MaxPlayerShots   = 64
	MaxSignals       = 6
	TraceEncodingRLE = "rle8-v1"
)

var (
	ErrInvalidTrace   = errors.New("action: invalid input trace")
	ErrIncompleteRoom = errors.New("action: input trace does not finish the encounter")
)

type InputFrame struct {
	Direction uint8
	Magnitude uint8
	Skill     bool
}
type InputTrace struct {
	Encoding string `json:"encoding"`
	Ticks    int    `json:"ticks"`
	Data     string `json:"data"`
}

type SignalType string

const (
	SurgeSignal SignalType = "surge"
	GuardSignal SignalType = "guard"
	EchoSignal  SignalType = "echo"
)

type Protocol string

const (
	NoProtocol        Protocol = ""
	SurgeBreak        Protocol = "surge_break"
	GuardAegis        Protocol = "guard_aegis"
	EchoReplay        Protocol = "echo_replay"
	ResonanceProtocol Protocol = "resonance"
)

type MovementSpec struct {
	Kind   string `json:"kind"`
	Amount int    `json:"amount,omitempty"`
}
type AttackSpec struct {
	Kind            string `json:"kind"`
	Interval        int    `json:"interval"`
	ProjectileSpeed int    `json:"projectile_speed"`
	Damage          int    `json:"damage"`
	Count           int    `json:"count,omitempty"`
	Spread          int    `json:"spread,omitempty"`
	TelegraphTicks  int    `json:"telegraph_ticks,omitempty"`
}
type TraitSpec struct {
	Kind   string `json:"kind"`
	Amount int    `json:"amount,omitempty"`
	Value  string `json:"value,omitempty"`
}
type EnemySpec struct {
	Slug          string       `json:"slug"`
	Kind          string       `json:"kind"`
	MaxHealth     int          `json:"max_health"`
	Speed         int          `json:"speed"`
	ContactDamage int          `json:"contact_damage"`
	Movement      MovementSpec `json:"movement"`
	Attacks       []AttackSpec `json:"attacks"`
	Traits        []TraitSpec  `json:"traits"`
	// The normalized fields keep the hot simulation loop compact. They are
	// derived from Movement and the first Attack by NormalizeEnemy.
	Pattern          string `json:"-"`
	FireInterval     int    `json:"-"`
	ProjectileSpeed  int    `json:"-"`
	ProjectileDamage int    `json:"-"`
}
type ObjectiveConfig struct {
	Kind   string `json:"kind"`
	Target int    `json:"target"`
}

// RuntimeConfig is resolved by Go from the selected kit, modules, plugins and
// noise rules. Clients render and predict it but never author it.
type RuntimeConfig struct {
	Kit              string            `json:"kit"`
	Passive          string            `json:"passive"`
	Resonance        string            `json:"resonance"`
	AttackDamage     int               `json:"attack_damage"`
	AttackInterval   int               `json:"attack_interval"`
	MoveSpeed        int               `json:"move_speed"`
	WarpCooldown     int               `json:"warp_cooldown"`
	WarpDamage       int               `json:"warp_damage"`
	StartingShield   int               `json:"starting_shield"`
	OverloadBonus    int               `json:"overload_bonus"`
	DistortionGain   int               `json:"distortion_gain"`
	ProtocolDamage   int               `json:"protocol_damage"`
	ProtocolShield   int               `json:"protocol_shield"`
	EchoPower        int               `json:"echo_power"`
	ResonancePower   int               `json:"resonance_power"`
	ProjectilePierce int               `json:"projectile_pierce"`
	ProjectileCount  int               `json:"projectile_count"`
	ProjectileSpeed  int               `json:"projectile_speed"`
	GrazeRadius      int               `json:"graze_radius"`
	HealOnProtocol   int               `json:"heal_on_protocol"`
	ReflectDamage    int               `json:"reflect_damage"`
	Behaviors        []RuntimeBehavior `json:"behaviors"`
}

type RuntimeBehavior struct {
	SourceSlug string `json:"source_slug"`
	Level      int    `json:"level"`
	Kind       string `json:"kind"`
	Amount     int    `json:"amount"`
	Every      int    `json:"every,omitempty"`
}

type Config struct {
	Seed                        string          `json:"seed"`
	Kind                        string          `json:"kind"`
	DurationTicks               int             `json:"duration_ticks"`
	MaxTicks                    int             `json:"max_ticks"`
	SpawnInterval               int             `json:"spawn_interval"`
	MaxAlive                    int             `json:"max_alive"`
	PlayerHealth                int             `json:"player_health"`
	PlayerMaxHealth             int             `json:"player_max_health"`
	NoiseLevel                  int             `json:"noise_level"`
	EmergencyReconnectAvailable bool            `json:"emergency_reconnect_available"`
	Objective                   ObjectiveConfig `json:"objective"`
	Hazards                     []string        `json:"hazards"`
	BossVariant                 string          `json:"boss_variant,omitempty"`
	Enemies                     []EnemySpec     `json:"enemies"`
	Runtime                     RuntimeConfig   `json:"runtime"`
}

type Vec struct {
	X int `json:"x"`
	Y int `json:"y"`
}
type EnemySnapshot struct {
	ID           int         `json:"id"`
	Slug         string      `json:"slug"`
	Kind         string      `json:"kind"`
	Movement     string      `json:"movement"`
	Attack       string      `json:"attack"`
	Traits       []TraitSpec `json:"traits"`
	Position     Vec         `json:"position"`
	Health       int         `json:"health"`
	MaxHealth    int         `json:"max_health"`
	Boss         bool        `json:"boss"`
	BossPhase    int         `json:"boss_phase,omitempty"`
	BossMimic    string      `json:"boss_mimic,omitempty"`
	IntentTicks  int         `json:"intent_ticks,omitempty"`
	IntentTarget Vec         `json:"intent_target"`
	Pattern      string      `json:"-"`
}
type ProjectileSnapshot struct {
	ID           int    `json:"id"`
	Pattern      string `json:"pattern"`
	Position     Vec    `json:"position"`
	Velocity     Vec    `json:"velocity"`
	Grazed       bool   `json:"grazed"`
	GlitchMarked bool   `json:"glitch_marked,omitempty"`
}

type FriendlyProjectileSnapshot struct {
	ID       int `json:"id"`
	Position Vec `json:"position"`
	TargetID int `json:"target_id"`
}

type WarpReplaySnapshot struct {
	Start        Vec `json:"start"`
	End          Vec `json:"end"`
	TriggerTicks int `json:"trigger_ticks"`
}

type SafeZoneSnapshot struct {
	Position Vec `json:"position"`
	Radius   int `json:"radius"`
	Ticks    int `json:"ticks"`
}
type SignalSnapshot struct {
	ID       int        `json:"id"`
	Type     SignalType `json:"type"`
	Position Vec        `json:"position"`
}
type ObjectiveSnapshot struct {
	Kind     string `json:"kind"`
	Target   int    `json:"target"`
	Progress int    `json:"progress"`
}

type Snapshot struct {
	Tick            int                          `json:"tick"`
	Player          Vec                          `json:"player"`
	Health          int                          `json:"health"`
	MaxHealth       int                          `json:"max_health"`
	Shield          int                          `json:"shield"`
	Distortion      int                          `json:"distortion"`
	WarpCooldown    int                          `json:"warp_cooldown"`
	Invulnerable    int                          `json:"invulnerable"`
	ReconnectFX     int                          `json:"reconnect_fx"`
	WarpFX          int                          `json:"warp_fx"`
	SignalPulse     int                          `json:"signal_pulse"`
	Signals         []SignalSnapshot             `json:"signals"`
	Weave           []SignalType                 `json:"weave"`
	Protocol        Protocol                     `json:"protocol"`
	Objective       ObjectiveSnapshot            `json:"objective"`
	Score           int                          `json:"score"`
	TotalGrazes     int                          `json:"total_grazes"`
	Enemies         []EnemySnapshot              `json:"enemies"`
	Projectiles     []ProjectileSnapshot         `json:"projectiles"`
	SignalWaypoints []Vec                        `json:"signal_waypoints,omitempty"`
	Blooms          []Vec                        `json:"blooms,omitempty"`
	SafeZones       []SafeZoneSnapshot           `json:"safe_zones,omitempty"`
	FriendlyShots   []FriendlyProjectileSnapshot `json:"friendly_shots,omitempty"`
	WarpReplays     []WarpReplaySnapshot         `json:"warp_replays,omitempty"`
}

type Result struct {
	Won                    bool     `json:"won"`
	Health                 int      `json:"health"`
	Ticks                  int      `json:"ticks"`
	Kills                  int      `json:"kills"`
	ProtocolsCompleted     int      `json:"protocols_completed"`
	Distortion             int      `json:"distortion"`
	Score                  int      `json:"score"`
	EmergencyReconnectUsed bool     `json:"emergency_reconnect_used"`
	Final                  Snapshot `json:"final"`
}
