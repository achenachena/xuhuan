package action

import "errors"

const (
	ArenaWidth       = 3600
	ArenaHeight      = 6400
	TicksPerSecond   = 30
	NormalMaxTicks   = 1800
	BossMaxTicks     = 2700
	MaxEnemies       = 24
	MaxProjectiles   = 256
	TraceEncodingRLE = "rle8-v1"
)

var (
	ErrInvalidTrace   = errors.New("action: invalid input trace")
	ErrIncompleteRoom = errors.New("action: input trace does not finish the encounter")
	ErrDigestMismatch = errors.New("action: client digest does not match authoritative replay")
)

type InputFrame struct {
	Direction uint8
	Magnitude uint8
	Skill     bool
}

type InputTrace struct {
	Encoding     string `json:"encoding"`
	Ticks        int    `json:"ticks"`
	Data         string `json:"data"`
	ClientDigest string `json:"client_digest,omitempty"`
}

type EnemySpec struct {
	Slug             string
	Pattern          string
	MaxHealth        int
	Speed            int
	ContactDamage    int
	FireInterval     int
	ProjectileSpeed  int
	ProjectileDamage int
}

type Buffs struct {
	AttackDamage   int
	AttackInterval int
	MoveSpeed      int
	DashCooldown   int
	DashDamage     int
	StartingShield int
	OverloadBonus  int
	DistortionGain int
	RouteHeal      int
	ReflectDamage  int
}

type Config struct {
	Seed                        string
	Kind                        string
	DurationTicks               int
	MaxTicks                    int
	SpawnInterval               int
	MaxAlive                    int
	PlayerHealth                int
	PlayerMaxHealth             int
	NoiseLevel                  int
	EmergencyReconnectAvailable bool
	Enemies                     []EnemySpec
	Buffs                       Buffs
}

type Vec struct {
	X int `json:"x"`
	Y int `json:"y"`
}

type EnemySnapshot struct {
	ID           int    `json:"id"`
	Slug         string `json:"slug"`
	Pattern      string `json:"pattern"`
	Position     Vec    `json:"position"`
	Health       int    `json:"health"`
	MaxHealth    int    `json:"max_health"`
	Boss         bool   `json:"boss"`
	BossPhase    int    `json:"boss_phase,omitempty"`
	BossMimic    string `json:"boss_mimic,omitempty"`
	IntentTicks  int    `json:"intent_ticks,omitempty"`
	IntentTarget Vec    `json:"intent_target"`
}

type ProjectileSnapshot struct {
	ID       int    `json:"id"`
	Pattern  string `json:"pattern"`
	Position Vec    `json:"position"`
	Velocity Vec    `json:"velocity"`
	Grazed   bool   `json:"grazed"`
}

type Snapshot struct {
	Tick         int                  `json:"tick"`
	Player       Vec                  `json:"player"`
	Health       int                  `json:"health"`
	MaxHealth    int                  `json:"max_health"`
	Shield       int                  `json:"shield"`
	Distortion   int                  `json:"distortion"`
	DashCooldown int                  `json:"dash_cooldown"`
	Invulnerable int                  `json:"invulnerable"`
	ReconnectFX  int                  `json:"reconnect_fx"`
	DashFX       int                  `json:"dash_fx"`
	AnchorPulse  int                  `json:"anchor_pulse"`
	RouteStep    int                  `json:"route_step"`
	RouteReady   bool                 `json:"route_ready"`
	ActiveBeacon Vec                  `json:"active_beacon"`
	Enemies      []EnemySnapshot      `json:"enemies"`
	Projectiles  []ProjectileSnapshot `json:"projectiles"`
}

type Result struct {
	Won                    bool     `json:"won"`
	Health                 int      `json:"health"`
	Ticks                  int      `json:"ticks"`
	Kills                  int      `json:"kills"`
	RoutesCompleted        int      `json:"routes_completed"`
	Distortion             int      `json:"distortion"`
	EmergencyReconnectUsed bool     `json:"emergency_reconnect_used"`
	Digest                 string   `json:"digest"`
	Final                  Snapshot `json:"final"`
}
