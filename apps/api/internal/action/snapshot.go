package action

func (sim *simulation) result(won bool) Result {
	final := sim.snapshot()
	sim.score += max(0, sim.health)*5 + sim.protocols*250 + max(0, sim.config.MaxTicks-sim.tick)/3
	final.Score = sim.score
	return Result{Won: won, Health: max(0, sim.health), Ticks: sim.tick, Kills: sim.kills,
		ProtocolsCompleted: sim.protocols, Distortion: sim.distortion, Score: sim.score, EmergencyReconnectUsed: sim.emergencyUsed,
		Final: final}
}

func (sim *simulation) snapshot() Snapshot {
	enemies := make([]EnemySnapshot, 0, len(sim.enemies))
	for _, enemy := range sim.enemies {
		spec := sim.config.Enemies[enemy.specIndex]
		phase, mimic := 0, ""
		if spec.Pattern == "boss" {
			maximum := enemy.maxHealth
			if maximum <= 0 {
				maximum = spec.MaxHealth
			}
			phase, mimic = bossPhase(enemy.health, maximum), sim.bossMimic()
		}
		attack := currentEnemyAttack(enemy, spec, sim.config.BossVariant)
		intentTicks, intentTarget := sim.enemyIntent(enemy, spec, attack)
		enemies = append(enemies, EnemySnapshot{ID: enemy.id, Slug: spec.Slug, Kind: spec.Kind, Movement: spec.Movement.Kind, Attack: attack.Kind, Traits: spec.Traits, Pattern: spec.Pattern, Position: Vec{enemy.x, enemy.y}, Health: enemy.health, MaxHealth: maximumHealth(enemy, spec), Boss: spec.Kind == "boss" || spec.Pattern == "boss", BossPhase: phase, BossMimic: mimic, IntentTicks: intentTicks, IntentTarget: intentTarget})
	}
	projectiles := make([]ProjectileSnapshot, 0, len(sim.projectiles))
	for _, bullet := range sim.projectiles {
		projectiles = append(projectiles, ProjectileSnapshot{ID: bullet.id, Pattern: bullet.pattern, Position: Vec{bullet.x, bullet.y}, Velocity: Vec{bullet.vx, bullet.vy}, Grazed: bullet.grazed, GlitchMarked: bullet.glitchMarked})
	}
	friendlyShots := make([]FriendlyProjectileSnapshot, 0, len(sim.friendlyShots))
	for _, shot := range sim.friendlyShots {
		friendlyShots = append(friendlyShots, FriendlyProjectileSnapshot{ID: shot.id, Position: Vec{X: shot.x, Y: shot.y}, TargetID: shot.targetID})
	}
	replays := make([]WarpReplaySnapshot, 0, len(sim.delayedWarps))
	for _, replay := range sim.delayedWarps {
		replays = append(replays, WarpReplaySnapshot{Start: replay.start, End: replay.end, TriggerTicks: max(0, replay.triggerTick-sim.tick)})
	}
	zones := make([]SafeZoneSnapshot, 0, len(sim.safeZones))
	for _, zone := range sim.safeZones {
		zones = append(zones, SafeZoneSnapshot{Position: zone.position, Radius: zone.radius, Ticks: max(0, zone.expiresTick-sim.tick)})
	}
	signals := make([]SignalSnapshot, 0, 3)
	positions := routePatterns[sim.routePattern%len(routePatterns)]
	types := [...]SignalType{SurgeSignal, GuardSignal, EchoSignal}
	for index, position := range positions {
		if sim.signalCooldown[index] == 0 {
			signals = append(signals, SignalSnapshot{ID: index + 1, Type: types[index], Position: position})
		}
	}
	return Snapshot{Tick: sim.tick, Player: Vec{sim.playerX, sim.playerY}, Health: max(0, sim.health), MaxHealth: sim.config.PlayerMaxHealth,
		Shield: sim.shield, Distortion: sim.distortion, WarpCooldown: sim.warpClock, Invulnerable: sim.invulnerable, ReconnectFX: sim.reconnectFX,
		WarpFX: sim.warpFX, SignalPulse: sim.signalPulse, Signals: signals, Weave: append([]SignalType(nil), sim.weave...), Protocol: sim.protocol, Objective: ObjectiveSnapshot{Kind: sim.config.Objective.Kind, Target: sim.config.Objective.Target, Progress: sim.objectiveProgress}, Score: sim.score, TotalGrazes: sim.totalGrazes,
		Enemies: enemies, Projectiles: projectiles,
		SignalWaypoints: append([]Vec(nil), sim.signalWaypoints...), Blooms: append([]Vec(nil), sim.blooms...), SafeZones: zones, FriendlyShots: friendlyShots, WarpReplays: replays}
}

func maximumHealth(enemy enemyEntity, spec EnemySpec) int {
	if enemy.maxHealth > 0 {
		return enemy.maxHealth
	}
	return spec.MaxHealth
}

func (sim *simulation) enemyIntent(enemy enemyEntity, spec EnemySpec, attack AttackSpec) (int, Vec) {
	if attack.Interval <= 0 {
		return 0, Vec{}
	}
	interval := max(20, attack.Interval-sim.config.NoiseLevel*3)
	remaining := interval - enemy.fireClock
	telegraphWindow := max(sim.intentWindow(), attack.TelegraphTicks)
	if remaining <= 0 || remaining > telegraphWindow {
		return 0, Vec{}
	}
	if attack.Kind == "ring" || attack.Kind == "mine" {
		return remaining, Vec{enemy.x, enemy.y}
	}
	if attack.Kind == "spiral" {
		vector := directionVectors[((sim.tick+remaining)/interval*2)&15]
		return remaining, Vec{enemy.x + vector.X*3, enemy.y + vector.Y*3}
	}
	if spec.Pattern == "mine" {
		return remaining, Vec{enemy.x, enemy.y}
	}
	if spec.Pattern == "orbiter" {
		start := ((sim.tick + remaining) / interval * 2) & 15
		vector := directionVectors[start]
		return remaining, Vec{enemy.x + vector.X*3, enemy.y + vector.Y*3}
	}
	return remaining, Vec{sim.playerX, sim.playerY}
}

func (sim *simulation) intentWindow() int {
	return max(8, 15-sim.config.NoiseLevel*2)
}

type randomStream struct{ state uint32 }
