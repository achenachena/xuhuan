package action

import (
	"fmt"
)

const (
	playerRadius            = 120
	enemyRadius             = 150
	bulletRadius            = 55
	beaconRadius            = 250
	bellaPerfectWindowTicks = 30
)

var directionVectors = [16]Vec{
	{1000, 0}, {924, 383}, {707, 707}, {383, 924}, {0, 1000}, {-383, 924}, {-707, 707}, {-924, 383},
	{-1000, 0}, {-924, -383}, {-707, -707}, {-383, -924}, {0, -1000}, {383, -924}, {707, -707}, {924, -383},
}

var routePatterns = [3][3]Vec{
	{{760, 4300}, {2840, 3000}, {1800, 1280}},
	{{2840, 4300}, {760, 3000}, {1800, 1280}},
	{{1800, 4100}, {760, 2550}, {2840, 1450}},
}

type enemyEntity struct {
	id, specIndex, x, y, health, maxHealth, fireClock, attackIndex int
}

type projectileEntity struct {
	id, x, y, vx, vy, damage int
	pattern                  string
	grazed                   bool
	glitchMarked             bool
	delay                    int
}

type delayedWarpEntity struct {
	start, end  Vec
	triggerTick int
	damage      int
	radius      int
}

type friendlyProjectileEntity struct {
	id, x, y, targetID, damage, life int
}

type safeZoneEntity struct {
	position    Vec
	radius      int
	expiresTick int
}

type simulation struct {
	config            Config
	random            randomStream
	tick              int
	playerX           int
	playerY           int
	health            int
	shield            int
	distortion        int
	warpClock         int
	invulnerable      int
	attackClock       int
	routeStep         int
	routeReady        bool
	routeWarpUsed     bool
	lastGraze         int
	totalGrazes       int
	nextEnemyID       int
	nextBulletID      int
	spawnIndex        int
	eliteSpawned      int
	kills             int
	eliteKills        int
	routes            int
	emergencyUsed     bool
	reconnectFX       int
	warpFX            int
	signalPulse       int
	routePattern      int
	weave             []SignalType
	protocol          Protocol
	signalCooldown    [3]int
	protocols         int
	objectiveProgress int
	score             int
	autoAttacks       int
	warpReadyTick     int
	lastSignalTick    int
	lastSignal        SignalType
	signalWaypoints   []Vec
	lastWarpStart     Vec
	lastWarpEnd       Vec
	hasLastWarp       bool
	delayedWarps      []delayedWarpEntity
	nextFriendlyID    int
	friendlyShots     []friendlyProjectileEntity
	blooms            []Vec
	safeZones         []safeZoneEntity
	enemies           []enemyEntity
	projectiles       []projectileEntity
}

func Simulate(config Config, trace InputTrace) (Result, error) {
	if err := normalizeConfig(&config); err != nil {
		return Result{}, err
	}
	frames, err := DecodeTrace(trace, config.MaxTicks)
	if err != nil {
		return Result{}, err
	}
	sim := newSimulation(config)
	finished := false
	won := false
	for _, frame := range frames {
		won, finished = sim.step(frame)
		if finished {
			break
		}
	}
	if !finished {
		return Result{}, ErrIncompleteRoom
	}
	return sim.result(won), nil
}

func normalizeConfig(config *Config) error {
	if config.Seed == "" || config.DurationTicks <= 0 || len(config.Enemies) == 0 {
		return fmt.Errorf("action: invalid encounter configuration")
	}
	if config.MaxTicks <= 0 {
		config.MaxTicks = NormalMaxTicks
	}
	if config.DurationTicks > config.MaxTicks {
		return fmt.Errorf("action: duration exceeds trace limit")
	}
	if config.SpawnInterval <= 0 {
		config.SpawnInterval = 180
	}
	if config.MaxAlive <= 0 || config.MaxAlive > MaxEnemies {
		config.MaxAlive = 8
	}
	if config.PlayerHealth <= 0 || config.PlayerMaxHealth <= 0 || config.PlayerHealth > config.PlayerMaxHealth {
		return fmt.Errorf("action: invalid player health")
	}
	if config.BossVariant == "" {
		config.BossVariant = "balanced"
	}
	if config.BossVariant != "authentic" && config.BossVariant != "balanced" && config.BossVariant != "retained" {
		return fmt.Errorf("action: invalid boss variant")
	}
	if config.Runtime.AttackDamage <= 0 {
		config.Runtime.AttackDamage = 8
	}
	if config.Runtime.AttackInterval <= 0 {
		config.Runtime.AttackInterval = 12
	}
	if config.Runtime.MoveSpeed <= 0 {
		config.Runtime.MoveSpeed = 42
	}
	if config.Runtime.WarpCooldown <= 0 {
		config.Runtime.WarpCooldown = 120
	}
	if config.Runtime.WarpDamage <= 0 {
		config.Runtime.WarpDamage = 14
	}
	if config.Runtime.DistortionGain <= 0 {
		config.Runtime.DistortionGain = 4
	}
	if config.Runtime.GrazeRadius <= 0 {
		config.Runtime.GrazeRadius = 310
	}
	if config.Objective.Kind == "" {
		config.Objective = ObjectiveConfig{Kind: "holdout", Target: config.DurationTicks}
	}
	for index := range config.Enemies {
		if len(config.Enemies[index].Attacks) == 0 {
			return fmt.Errorf("action: enemy %q has no authored attacks", config.Enemies[index].Slug)
		}
		normalizeEnemy(&config.Enemies[index])
	}
	return nil
}

func normalizeEnemy(spec *EnemySpec) {
	if spec.Pattern == "" {
		if spec.Kind == "boss" {
			spec.Pattern = "boss"
		} else {
			switch spec.Movement.Kind {
			case "orbit":
				spec.Pattern = "orbiter"
			case "strafe":
				spec.Pattern = "sweeper"
			case "charge":
				spec.Pattern = "charger"
			case "flee":
				spec.Pattern = "sniper"
			case "stationary":
				spec.Pattern = "turret"
			case "wander":
				spec.Pattern = "swarm"
			default:
				spec.Pattern = "chaser"
			}
		}
	}
	if len(spec.Attacks) > 0 {
		attack := spec.Attacks[0]
		spec.FireInterval, spec.ProjectileSpeed, spec.ProjectileDamage = attack.Interval, attack.ProjectileSpeed, attack.Damage
		if attack.Kind == "mine" && spec.Kind != "boss" {
			spec.Pattern = "mine"
		}
	}
}

func newSimulation(config Config) *simulation {
	seed := seedFromString(config.Seed)
	return &simulation{
		config: config, random: randomStream{state: seed},
		playerX: ArenaWidth / 2, playerY: 5200, health: config.PlayerHealth,
		shield: config.Runtime.StartingShield, lastGraze: -1000,
		warpReadyTick: -1000, lastSignalTick: -1000,
		routePattern:    int(seed % uint32(len(routePatterns))),
		weave:           make([]SignalType, 0, 3),
		signalWaypoints: make([]Vec, 0, 3),
		delayedWarps:    make([]delayedWarpEntity, 0, 4),
		friendlyShots:   make([]friendlyProjectileEntity, 0, MaxPlayerShots),
		blooms:          make([]Vec, 0, MaxSignals),
		safeZones:       make([]safeZoneEntity, 0, MaxSignals),
		enemies:         make([]enemyEntity, 0, config.MaxAlive), projectiles: make([]projectileEntity, 0, 64),
	}
}

func (sim *simulation) step(input InputFrame) (bool, bool) {
	sim.tick++
	if sim.warpClock > 0 {
		sim.warpClock--
		if sim.warpClock == 0 {
			sim.warpReadyTick = sim.tick
		}
	}
	if sim.invulnerable > 0 {
		sim.invulnerable--
	}
	if sim.reconnectFX > 0 {
		sim.reconnectFX--
	}
	if sim.warpFX > 0 {
		sim.warpFX--
	}
	if sim.signalPulse > 0 {
		sim.signalPulse--
	}
	for index := range sim.signalCooldown {
		if sim.signalCooldown[index] > 0 {
			sim.signalCooldown[index]--
		}
	}
	sim.movePlayer(input)
	sim.collectSignals()
	sim.spawnEnemies()
	sim.updateEnemies()
	sim.autoAttack()
	sim.updateKitEffects()
	sim.updateHazards()
	sim.updateProjectiles()
	sim.updateSignalDecay()
	if hasString(sim.config.Hazards, "distortion_rain") && sim.tick%90 == 0 {
		sim.distortion = min(99, sim.distortion+3)
	}
	decayInterval := 15 + sim.config.NoiseLevel*3
	if sim.distortion > 0 && sim.tick-sim.lastGraze > 60 && sim.tick%decayInterval == 0 {
		sim.distortion--
	}
	if sim.health <= 0 {
		if sim.config.EmergencyReconnectAvailable && !sim.emergencyUsed {
			sim.emergencyUsed = true
			sim.health = max(1, sim.config.PlayerMaxHealth*40/100)
			sim.projectiles = sim.projectiles[:0]
			sim.invulnerable = 45
			sim.reconnectFX = 90
		} else {
			return false, true
		}
	}
	if sim.config.Kind == "boss" || sim.config.Objective.Kind == "boss" {
		for _, enemy := range sim.enemies {
			if sim.config.Enemies[enemy.specIndex].Pattern == "boss" && enemy.health > 0 {
				if sim.tick >= sim.config.MaxTicks {
					return false, true
				}
				return false, false
			}
		}
		return true, true
	}
	if sim.config.Kind == "tutorial" && sim.routeWarpUsed {
		return true, true
	}
	sim.updateObjective()
	if sim.objectiveComplete() {
		return true, true
	}
	if sim.tick >= sim.config.MaxTicks {
		return false, true
	}
	return false, false
}

func (sim *simulation) movePlayer(input InputFrame) {
	vector := directionVectors[input.Direction&15]
	if input.Magnitude > 0 {
		speed := sim.config.Runtime.MoveSpeed * int(input.Magnitude) / 3
		sim.playerX += vector.X * speed / 1000
		sim.playerY += vector.Y * speed / 1000
	}
	if input.Skill && sim.warpClock == 0 {
		startX, startY := sim.playerX, sim.playerY
		if input.Magnitude == 0 {
			vector = directionVectors[12]
		}
		sim.playerX += vector.X * 620 / 1000
		sim.playerY += vector.Y * 620 / 1000
		sim.invulnerable = 12
		sim.warpFX = 10
		sim.warpClock = sim.config.Runtime.WarpCooldown
		sim.recordWarp(Vec{X: startX, Y: startY}, Vec{X: sim.playerX, Y: sim.playerY})
		empowered := sim.routeReady
		radius, damage := 330, max(4, sim.config.Runtime.WarpDamage/2)
		if empowered {
			radius, damage = 700, max(12, sim.config.Runtime.WarpDamage)
		}
		switch sim.config.Runtime.Passive {
		case "bella_perfect_warp":
			if sim.warpReadyTick >= 0 && sim.tick-sim.warpReadyTick <= bellaPerfectWindowTicks {
				radius += 180
				damage += max(3, damage/3)
				sim.shield += 5
				sim.invulnerable = max(sim.invulnerable, 18)
				sim.score += 75
				sim.launchFriendlyShot(Vec{X: sim.playerX, Y: sim.playerY}, max(4, sim.config.Runtime.WarpDamage/4))
			}
		}
		midpointX, midpointY := (startX+sim.playerX)/2, (startY+sim.playerY)/2
		for index := range sim.enemies {
			if nearTravelPath(sim.enemies[index].x, sim.enemies[index].y, startX, startY, midpointX, midpointY, sim.playerX, sim.playerY, radius) {
				sim.enemies[index].health -= damage
			}
		}
		if empowered {
			sim.routeWarpUsed = true
			sim.activateProtocol(startX, startY, sim.playerX, sim.playerY)
		}
		sim.activateKitWarp(empowered)
		kept := sim.projectiles[:0]
		for _, bullet := range sim.projectiles {
			if !nearTravelPath(bullet.x, bullet.y, startX, startY, midpointX, midpointY, sim.playerX, sim.playerY, radius) {
				kept = append(kept, bullet)
			}
		}
		sim.projectiles = kept
		if empowered {
			sim.routeReady = false
			sim.protocol = NoProtocol
			sim.weave = sim.weave[:0]
			sim.signalWaypoints = sim.signalWaypoints[:0]
			sim.routeStep = 0
		}
	}
	left, right := playerRadius, ArenaWidth-playerRadius
	if hasString(sim.config.Hazards, "narrow_arena") {
		left, right = 620, ArenaWidth-620
	}
	sim.playerX = clamp(sim.playerX, left, right)
	sim.playerY = clamp(sim.playerY, 700, ArenaHeight-playerRadius)
}

func hasString(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}
