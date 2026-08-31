package shooter

import (
	"fmt"
	"slices"
)

const (
	playerY      = 5200
	playerRadius = 95
	enemyRadius  = 120
	bulletRadius = 42
	grazeRadius  = 180
)

type enemyEntity struct {
	id, specIndex, x, y, health, maxHealth int
	fireClock, age, phase, warning, volley int
	marks                                  int
	boss                                   bool
}

type projectileEntity struct {
	id, x, y, vx, vy, damage, pierce int
	radius, width, health            int
	kind                             string
	hostile, grazed                  bool
}

type pickupEntity struct {
	id, x, y, value int
}

type effectEntity struct {
	id, x, y, ticks, power int
	kind                   string
}

type runtime struct {
	damage, fireInterval, multishot, pierce    int
	startingShield, maxHealth                  int
	rescueCharge, rescueDamage                 int
	companionPower, grazeCharge                int
	spread, guardOnSpecial, pickupMagnet       int
	echoVolley, bossBreak, lowHealthPower      int
	comboExtend, companionCharge, recoveryDrop int
}

type simulation struct {
	config             Config
	random             randomStream
	runtime            runtime
	tick               int
	playerX            int
	health             int
	shield             int
	invulnerableTicks  int
	rescueCharge       int
	rescueHeld         bool
	rescuesUsed        int
	grazeCount         int
	combo              int
	comboClock         int
	kills              int
	score              int
	attackClock        int
	attackSequence     int
	alignmentTicks     int
	companionClocks    []int
	nextEnemyID        int
	nextProjectileID   int
	nextPickupID       int
	nextEffectID       int
	spawnedBoss        bool
	lastRescueTick     int
	bossPhaseTick      int
	dailyVariant       string
	enemies            []enemyEntity
	enemyProjectiles   []projectileEntity
	playerProjectiles  []projectileEntity
	pickups            []pickupEntity
	pickupsCollected   int
	lastPickupTick     int
	pressureQuietTicks int
	effects            []effectEntity
}

func Simulate(config Config, trace InputTrace) (Result, error) {
	if err := normalizeConfig(&config); err != nil {
		return Result{}, err
	}
	frames, err := DecodeTrace(trace, config.DurationTicks)
	if err != nil {
		return Result{}, err
	}
	sim := newSimulation(config)
	for _, frame := range frames {
		sim.step(frame)
	}
	won := sim.health > 0
	if config.Boss != nil {
		won = won && !slices.ContainsFunc(sim.enemies, func(enemy enemyEntity) bool { return enemy.boss && enemy.health > 0 })
	}
	return sim.result(won), nil
}

func normalizeConfig(config *Config) error {
	if config.Seed == "" || config.DurationTicks <= 0 || config.DurationTicks > MaxSegmentTicks || config.EncoreLevel < 0 || config.EncoreLevel > 3 {
		return fmt.Errorf("shooter: invalid segment configuration")
	}
	if config.StoryChoiceID != "" && storyChoiceMode(config.StoryChoiceID) == 0 {
		return fmt.Errorf("shooter: invalid story choice")
	}
	if !slices.Contains(SupportedKits[:], config.Kit.ID) || config.Kit.MaxHealth != 3 || config.Kit.AttackDamage <= 0 || config.Kit.FireInterval <= 0 || config.Kit.RescueDamage <= 0 {
		return fmt.Errorf("shooter: invalid character kit")
	}
	if config.PlayerHealth <= 0 || config.PlayerHealth > config.Kit.MaxHealth || config.StartingRescueCharge < 0 || config.StartingRescueCharge > RescueChargeLimit {
		return fmt.Errorf("shooter: invalid player health")
	}
	if config.SpecialChargePenaltyPercent < 0 || config.SpecialChargePenaltyPercent > 75 {
		return fmt.Errorf("shooter: invalid special charge penalty")
	}
	if config.Limits == (Limits{}) {
		config.Limits = DefaultLimits()
	}
	if config.Limits.Enemies <= 0 || config.Limits.Enemies > MaxEnemies || config.Limits.EnemyProjectiles <= 0 || config.Limits.EnemyProjectiles > MaxEnemyBullets || config.Limits.PlayerProjectiles <= 0 || config.Limits.PlayerProjectiles > MaxPlayerBullets || config.Limits.Pickups <= 0 || config.Limits.Pickups > MaxPickups || config.Limits.Effects <= 0 || config.Limits.Effects > MaxEffects {
		return fmt.Errorf("shooter: invalid entity limits")
	}
	seenEnemies := make(map[string]bool, len(config.Enemies))
	for _, enemy := range config.Enemies {
		if enemy.ID == "" || seenEnemies[enemy.ID] || !slices.Contains(SupportedChassis[:], enemy.Chassis) || enemy.Health <= 0 || enemy.Speed < 0 || enemy.FireInterval <= 0 || enemy.ProjectileSpeed <= 0 || enemy.Damage <= 0 {
			return fmt.Errorf("shooter: invalid enemy %q", enemy.ID)
		}
		seenEnemies[enemy.ID] = true
	}
	validFormations := []string{"line", "fan", "staggered", "pincer", "center", "sweep"}
	for _, spawn := range config.Wave.Spawns {
		if spawn.AtTick < 0 || spawn.AtTick >= config.DurationTicks || !seenEnemies[spawn.EnemyID] || spawn.Count <= 0 || spawn.IntervalTicks < 0 || !slices.Contains(validFormations, spawn.Formation) {
			return fmt.Errorf("shooter: invalid wave spawn")
		}
	}
	seenCompanions := make(map[CompanionID]bool, len(config.Companions))
	validTriggers := []string{"segment_start", "graze_streak", "low_health", "special_used", "boss_stage", "pickup_chain", "wave_clear"}
	validAssists := []string{"side_shot", "shield", "echo_shot", "clear_lane", "convert_bullet", "focus_beam", "heal"}
	for _, companion := range config.Companions {
		if !slices.Contains(SupportedCompanions[:], companion.ID) || seenCompanions[companion.ID] || !slices.Contains(validTriggers, companion.Trigger) || !slices.Contains(validAssists, companion.Behavior) || companion.Amount <= 0 || companion.CooldownTicks < 0 {
			return fmt.Errorf("shooter: invalid companion")
		}
		seenCompanions[companion.ID] = true
	}
	for _, effect := range config.ShowEffects {
		if !slices.Contains(SupportedShowEffects[:], effect.Kind) || effect.Amount <= 0 {
			return fmt.Errorf("shooter: invalid show effect %q", effect.Kind)
		}
	}
	if config.Boss != nil {
		if !slices.Contains(SupportedBosses[:], config.Boss.ID) || config.Boss.Health <= 0 || len(config.Boss.Stages) != 3 {
			return fmt.Errorf("shooter: invalid boss")
		}
		lastThreshold := 101
		for _, stage := range config.Boss.Stages {
			if stage.HealthThreshold < 0 || stage.HealthThreshold >= lastThreshold || stage.FireInterval <= 0 || stage.ProjectileSpeed <= 0 || stage.Damage <= 0 || stage.TelegraphTicks < 0 || stage.TelegraphTicks >= stage.FireInterval {
				return fmt.Errorf("shooter: invalid boss stage")
			}
			lastThreshold = stage.HealthThreshold
		}
	}
	return nil
}

func newSimulation(config Config) *simulation {
	resolved := resolveRuntime(config)
	variant := ""
	if config.Daily {
		variant = config.DailyModifierID
	}
	sim := &simulation{
		config: config, random: randomStream{state: seedFromString(config.Seed)}, runtime: resolved,
		playerX: ArenaWidth / 2, health: config.PlayerHealth, shield: resolved.startingShield,
		rescueCharge: clamp(resolved.rescueCharge, 0, RescueChargeLimit), dailyVariant: variant,
		companionClocks:   make([]int, len(config.Companions)),
		enemies:           make([]enemyEntity, 0, config.Limits.Enemies),
		enemyProjectiles:  make([]projectileEntity, 0, config.Limits.EnemyProjectiles),
		playerProjectiles: make([]projectileEntity, 0, config.Limits.PlayerProjectiles),
		pickups:           make([]pickupEntity, 0, config.Limits.Pickups),
		effects:           make([]effectEntity, 0, config.Limits.Effects),
	}
	for index, companion := range config.Companions {
		if companion.Trigger == "segment_start" {
			sim.companionClocks[index] = max(1, companion.CooldownTicks)
		}
	}
	return sim
}

func resolveRuntime(config Config) runtime {
	result := runtime{
		damage: config.Kit.AttackDamage, fireInterval: config.Kit.FireInterval,
		multishot: 1, maxHealth: config.Kit.MaxHealth, startingShield: config.Kit.StartingShield,
		rescueCharge: config.StartingRescueCharge, rescueDamage: config.Kit.RescueDamage, grazeCharge: 4,
	}
	for _, effect := range config.ShowEffects {
		switch effect.Kind {
		case EffectTwinShot:
			result.multishot += effect.Amount
		case EffectPiercingShot:
			result.pierce += effect.Amount
		case EffectSpreadShot:
			result.spread += effect.Amount
			result.multishot += 2
		case EffectGrazeCharge:
			result.grazeCharge += effect.Amount
		case EffectGuardOnSpecial:
			result.guardOnSpecial += effect.Amount
		case EffectPickupMagnet:
			result.pickupMagnet += effect.Amount
		case EffectEchoVolley:
			result.echoVolley += effect.Amount
		case EffectBossBreak:
			result.bossBreak += effect.Amount
		case EffectLowHealthPower:
			result.lowHealthPower += effect.Amount
		case EffectComboExtend:
			result.comboExtend += effect.Amount
		case EffectCompanionCharge:
			result.companionCharge += effect.Amount
		case EffectRecoveryDrop:
			result.recoveryDrop += effect.Amount
		}
	}
	result.fireInterval = max(3, result.fireInterval)
	result.multishot = clamp(result.multishot, 1, 5)
	return result
}

func (sim *simulation) step(input Input) {
	sim.tick++
	if sim.invulnerableTicks > 0 {
		sim.invulnerableTicks--
	}
	moveLimit := sim.config.Kit.MoveLimit
	if moveLimit <= 0 || moveLimit > ArenaWidth/2-playerRadius {
		moveLimit = ArenaWidth/2 - playerRadius
	}
	sim.playerX = ArenaWidth/2 - moveLimit + int(input.X)*(moveLimit*2)/127
	if input.Rescue && !sim.rescueHeld {
		sim.activateRescue()
	}
	sim.rescueHeld = input.Rescue
	sim.spawnWave()
	sim.spawnBoss()
	sim.updateWeapons()
	sim.updateCompanions()
	sim.updateEnemies()
	sim.updateKitPassives()
	sim.updateProjectiles()
	sim.updatePickups()
	sim.updateEffects()
	if sim.comboClock > 0 {
		sim.comboClock--
	} else {
		sim.combo = 0
	}
	if sim.health < 0 {
		sim.health = 0
	}
}

func (sim *simulation) result(won bool) Result {
	if won {
		sim.score += sim.health*10 + sim.rescueCharge*2
	}
	final := sim.snapshot()
	final.Score = sim.score
	return Result{Won: won, Health: sim.health, Ticks: sim.tick, Kills: sim.kills, RescuesUsed: sim.rescuesUsed, Grazes: sim.grazeCount, Score: sim.score, DailyVariant: sim.dailyVariant, Final: final}
}

func (sim *simulation) snapshot() Snapshot {
	enemies := make([]EnemySnapshot, 0, len(sim.enemies))
	for _, enemy := range sim.enemies {
		var spec EnemySpec
		id, chassis, intent := "", ChassisSpamBot, ""
		if enemy.boss && sim.config.Boss != nil {
			id, chassis = string(sim.config.Boss.ID), ChassisCensorFrame
			if stage := enemy.phase - 1; stage >= 0 && stage < len(sim.config.Boss.Stages) && sim.config.Boss.Stages[stage].TelegraphTicks > 0 && enemy.fireClock >= max(1, sim.config.Boss.Stages[stage].FireInterval-sim.config.Boss.Stages[stage].TelegraphTicks) {
				intent = "fire"
			}
		} else {
			spec = sim.config.Enemies[enemy.specIndex]
			id, chassis, intent = spec.ID, spec.Chassis, enemyIntent(enemy, spec, sim.config.EncoreLevel)
		}
		enemies = append(enemies, EnemySnapshot{ID: enemy.id, SpecID: id, Chassis: chassis, Position: Position{X: enemy.x, Y: enemy.y}, Health: max(0, enemy.health), MaxHealth: enemy.maxHealth, Boss: enemy.boss, Stage: enemy.phase, Intent: intent, Marks: enemy.marks})
	}
	return Snapshot{
		Tick: sim.tick, PlayerX: sim.playerX, Health: sim.health, MaxHealth: sim.runtime.maxHealth,
		Shield: sim.shield, InvulnerableTicks: sim.invulnerableTicks, RescueCharge: sim.rescueCharge, RescuesUsed: sim.rescuesUsed,
		GrazeCount: sim.grazeCount, Combo: sim.combo, Score: sim.score, DailyVariant: sim.dailyVariant,
		Enemies: enemies, EnemyProjectiles: projectileSnapshots(sim.enemyProjectiles), PlayerProjectiles: projectileSnapshots(sim.playerProjectiles),
		Pickups: pickupSnapshots(sim.pickups), Threats: sim.threatSnapshots(), Effects: effectSnapshots(sim.effects),
	}
}

func projectileSnapshots(entities []projectileEntity) []ProjectileSnapshot {
	result := make([]ProjectileSnapshot, 0, len(entities))
	for _, item := range entities {
		result = append(result, ProjectileSnapshot{
			ID: item.id, Position: Position{X: item.x, Y: item.y}, Velocity: Position{X: item.vx, Y: item.vy}, Hostile: item.hostile,
			Kind: item.kind, Radius: item.radius, Width: item.width, Health: max(0, item.health),
		})
	}
	return result
}

func pickupSnapshots(entities []pickupEntity) []PickupSnapshot {
	result := make([]PickupSnapshot, 0, len(entities))
	for _, item := range entities {
		result = append(result, PickupSnapshot{ID: item.id, Kind: "support_note", Position: Position{X: item.x, Y: item.y}, Value: item.value})
	}
	return result
}

func effectSnapshots(entities []effectEntity) []EffectSnapshot {
	result := make([]EffectSnapshot, 0, len(entities))
	for _, item := range entities {
		result = append(result, EffectSnapshot{ID: item.id, Kind: item.kind, Position: Position{X: item.x, Y: item.y}, Ticks: item.ticks, Power: item.power})
	}
	return result
}

func (sim *simulation) addEffect(kind string, x, y, ticks, power int) {
	if kind == "" || ticks <= 0 || len(sim.effects) >= sim.config.Limits.Effects {
		return
	}
	sim.nextEffectID++
	sim.effects = append(sim.effects, effectEntity{id: sim.nextEffectID, kind: kind, x: x, y: y, ticks: ticks, power: power})
}

func (sim *simulation) updateEffects() {
	kept := sim.effects[:0]
	for _, effect := range sim.effects {
		effect.ticks--
		if effect.ticks > 0 {
			kept = append(kept, effect)
		}
	}
	sim.effects = kept
}
