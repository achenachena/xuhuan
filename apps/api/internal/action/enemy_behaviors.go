package action

func (sim *simulation) spawnEnemies() {
	if len(sim.enemies) >= sim.config.MaxAlive {
		return
	}
	spawnDeadline := sim.config.DurationTicks - 90
	if sim.config.Objective.Kind != "holdout" {
		spawnDeadline = sim.config.MaxTicks - 90
	}
	shouldSpawn := sim.tick == 1 || (sim.config.Kind != "boss" && sim.tick%sim.config.SpawnInterval == 0 && sim.tick < spawnDeadline)
	if sim.config.Objective.Kind == "elite" && sim.tick > 1 {
		// Give the single-button auto-aim loop a readable opening duel before
		// support enemies enter. Later waves still use the authored cadence.
		supportStart := max(450, sim.config.SpawnInterval*3)
		shouldSpawn = sim.tick >= supportStart && (sim.tick-supportStart)%sim.config.SpawnInterval == 0 && sim.tick < spawnDeadline
	}
	if !shouldSpawn {
		return
	}
	specIndex := sim.spawnIndex % len(sim.config.Enemies)
	if sim.config.Objective.Kind == "elite" {
		specIndex = sim.nextEliteEncounterSpec(specIndex)
		if specIndex < 0 {
			return
		}
	}
	spec := sim.config.Enemies[specIndex]
	sim.spawnIndex++
	if spec.Kind == "elite" {
		sim.eliteSpawned++
	}
	edge := sim.random.intn(3)
	x, y := 300+sim.random.intn(ArenaWidth-600), 850
	if edge == 1 {
		x, y = 280, 900+sim.random.intn(2800)
	}
	if edge == 2 {
		x, y = ArenaWidth-280, 900+sim.random.intn(2800)
	}
	if spec.Pattern == "boss" {
		x, y = ArenaWidth/2, 1200
	}
	sim.nextEnemyID++
	health := spec.MaxHealth + spec.MaxHealth*sim.config.NoiseLevel/10
	sim.enemies = append(sim.enemies, enemyEntity{id: sim.nextEnemyID, specIndex: specIndex, x: x, y: y, health: health, maxHealth: health})
}

func (sim *simulation) nextEliteEncounterSpec(start int) int {
	for offset := range len(sim.config.Enemies) {
		index := (start + offset) % len(sim.config.Enemies)
		spec := sim.config.Enemies[index]
		if spec.Kind != "elite" || sim.eliteSpawned < sim.config.Objective.Target {
			return index
		}
	}
	return -1
}

func (sim *simulation) updateEnemies() {
	for index := range sim.enemies {
		enemy := &sim.enemies[index]
		if enemy.health <= 0 {
			continue
		}
		spec := sim.config.Enemies[enemy.specIndex]
		dx, dy := sim.playerX-enemy.x, sim.playerY-enemy.y
		distance := max(1, integerSqrt(dx*dx+dy*dy))
		attack := currentEnemyAttack(*enemy, spec, sim.config.BossVariant)
		interval := max(20, attack.Interval-sim.config.NoiseLevel*3)
		telegraphWindow := max(sim.intentWindow(), attack.TelegraphTicks)
		telegraphing := attack.Interval > 0 && interval-enemy.fireClock <= telegraphWindow
		sim.moveEnemy(enemy, spec, dx, dy, distance, telegraphing)
		if teleportEvery := traitAmount(spec, "teleport"); teleportEvery > 0 && sim.tick%teleportEvery == enemy.id%teleportEvery {
			enemy.x = 400 + sim.random.intn(ArenaWidth-800)
			enemy.y = 850 + sim.random.intn(2500)
			dx, dy = sim.playerX-enemy.x, sim.playerY-enemy.y
			distance = max(1, integerSqrt(dx*dx+dy*dy))
		}
		if distance < playerRadius+enemyRadius && sim.invulnerable == 0 {
			sim.damagePlayer(max(1, spec.ContactDamage))
			sim.invulnerable = 18
			if hasTrait(spec, "steal_signal") && len(sim.weave) > 0 {
				sim.weave = sim.weave[:len(sim.weave)-1]
				if len(sim.signalWaypoints) > len(sim.weave) {
					sim.signalWaypoints = sim.signalWaypoints[:len(sim.weave)]
				}
				sim.routeStep = len(sim.weave)
				sim.protocol, sim.routeReady = NoProtocol, false
			}
		}
		if hasTrait(spec, "distortion_aura") && distance < 900 && sim.tick%30 == 0 {
			sim.distortion = min(99, sim.distortion+2)
		}
		enemy.fireClock++
		if attack.Interval > 0 && enemy.fireClock >= interval && len(sim.projectiles) < MaxProjectiles {
			enemy.fireClock = 0
			sim.fireEnemyAttack(enemy, spec, attack, dx, dy, distance, interval)
			enemy.attackIndex++
		}
	}
	alive := sim.enemies[:0]
	splits := make([]enemyEntity, 0, 3)
	for _, enemy := range sim.enemies {
		if enemy.health > 0 {
			alive = append(alive, enemy)
		} else {
			sim.kills++
			sim.score += 100
			sim.onEnemyKilled()
			spec := sim.config.Enemies[enemy.specIndex]
			if spec.Kind == "elite" {
				sim.eliteKills++
			}
			if trait, ok := findTrait(spec, "death_split"); ok {
				childSpecIndex := enemySpecIndex(sim.config.Enemies, trait.Value)
				childCount := clamp(trait.Amount, 1, 3)
				available := max(0, sim.config.MaxAlive-len(alive)-len(splits))
				childCount = min(childCount, available)
				for child := 0; child < childCount && childSpecIndex >= 0; child++ {
					offset := (child - (childCount-1)/2) * 180
					if childCount%2 == 0 {
						offset = (child*2 - 1) * 120
					}
					sim.nextEnemyID++
					childSpec := sim.config.Enemies[childSpecIndex]
					health := max(1, childSpec.MaxHealth/2)
					splits = append(splits, enemyEntity{id: sim.nextEnemyID, specIndex: childSpecIndex, x: clamp(enemy.x+offset, enemyRadius, ArenaWidth-enemyRadius), y: enemy.y, health: health, maxHealth: health})
				}
			}
		}
	}
	sim.enemies = append(alive, splits...)
}

func hasTrait(spec EnemySpec, kind string) bool {
	_, ok := findTrait(spec, kind)
	return ok
}

func findTrait(spec EnemySpec, kind string) (TraitSpec, bool) {
	for _, trait := range spec.Traits {
		if trait.Kind == kind {
			return trait, true
		}
	}
	return TraitSpec{}, false
}

func enemySpecIndex(specs []EnemySpec, slug string) int {
	for index, spec := range specs {
		if spec.Slug == slug {
			return index
		}
	}
	return -1
}

func traitAmount(spec EnemySpec, kind string) int {
	for _, trait := range spec.Traits {
		if trait.Kind == kind {
			return trait.Amount
		}
	}
	return 0
}

func currentEnemyAttack(enemy enemyEntity, spec EnemySpec, bossVariant string) AttackSpec {
	index := enemy.attackIndex % len(spec.Attacks)
	if spec.Kind == "boss" || spec.Pattern == "boss" {
		return bossVariantAttack(enemy, spec, bossVariant)
	}
	return spec.Attacks[index]
}

func (sim *simulation) moveEnemy(enemy *enemyEntity, spec EnemySpec, dx, dy, distance int, telegraphing bool) {
	moveX, moveY := 0, 0
	behavior := spec.Movement.Kind
	if behavior == "" {
		behavior = spec.Pattern
	}
	switch behavior {
	case "chase", "chaser", "swarm", "boss":
		moveX, moveY = dx*spec.Speed/distance, dy*spec.Speed/distance
	case "strafe", "sweeper", "wander":
		direction := 1
		if ((sim.tick + enemy.id*37) / 105 & 1) != 0 {
			direction = -1
		}
		moveX = direction * spec.Speed
		moveY = clamp(dy/90, -spec.Speed, spec.Speed)
	case "stationary", "mine":
		if distance > 1450 {
			moveX, moveY = 0, 0
		}
	case "orbit", "orbiter", "sniper":
		orbitDirection := 1
		if enemy.id&1 != 0 {
			orbitDirection = -1
		}
		preferred := 1500
		if spec.Pattern == "sniper" {
			preferred = 2450
		}
		radial := 0
		if distance > preferred+260 {
			radial = 1
		} else if distance < preferred-260 {
			radial = -1
		}
		moveX = dx*spec.Speed*radial/distance + -dy*spec.Speed*orbitDirection/(distance*2)
		moveY = dy*spec.Speed*radial/distance + dx*spec.Speed*orbitDirection/(distance*2)
	case "flee":
		moveX, moveY = -dx*spec.Speed/distance, -dy*spec.Speed/distance
	case "charge", "charger":
		if !telegraphing {
			moveX, moveY = dx*spec.Speed/distance, dy*spec.Speed/distance
		}
	}
	enemy.x = clamp(enemy.x+moveX, enemyRadius, ArenaWidth-enemyRadius)
	enemy.y = clamp(enemy.y+moveY, 700, ArenaHeight-enemyRadius)
}

func (sim *simulation) fireEnemyAttack(enemy *enemyEntity, spec EnemySpec, attack AttackSpec, dx, dy, distance, interval int) {
	attackKind, count, spread := attack.Kind, attack.Count, attack.Spread
	if attack.Interval > 0 {
		spec.FireInterval = attack.Interval
	}
	if attack.ProjectileSpeed > 0 {
		spec.ProjectileSpeed = attack.ProjectileSpeed
	}
	if attack.Damage > 0 {
		spec.ProjectileDamage = attack.Damage
	}
	if attackKind == "" {
		switch spec.Pattern {
		case "mine":
			attackKind = "mine"
		case "orbiter":
			attackKind = "spiral"
		case "sweeper", "sniper":
			attackKind = "fan"
		case "charger":
			attackKind = "beam"
		default:
			attackKind = "aimed"
		}
	}
	switch attackKind {
	case "ring", "mine":
		speed := max(12, spec.ProjectileSpeed)
		if count <= 0 {
			count = 8
		}
		step := max(1, 16/count)
		for index := 0; index < 16; index += step {
			vector := directionVectors[index]
			sim.fireProjectileVelocity(*enemy, spec, vector.X*speed/1000, vector.Y*speed/1000)
		}
	case "spiral":
		speed := max(12, spec.ProjectileSpeed)
		start := (sim.tick / interval * 2) & 15
		if count <= 0 {
			count = 4
		}
		step := max(1, 16/count)
		for index := 0; index < 16; index += step {
			vector := directionVectors[(start+index)&15]
			sim.fireProjectileVelocity(*enemy, spec, vector.X*speed/1000, vector.Y*speed/1000)
		}
	case "beam":
		enemy.x = clamp(enemy.x+dx*860/distance, enemyRadius, ArenaWidth-enemyRadius)
		enemy.y = clamp(enemy.y+dy*860/distance, 700, ArenaHeight-enemyRadius)
	case "fan":
		speed := max(12, spec.ProjectileSpeed)
		vx, vy := dx*speed/distance, dy*speed/distance
		if spread <= 0 {
			spread = 4
		}
		sim.fireProjectileVelocity(*enemy, spec, vx, vy)
		sim.fireProjectileVelocity(*enemy, spec, (vx*10-vy*spread)/10, (vy*10+vx*spread)/10)
		sim.fireProjectileVelocity(*enemy, spec, (vx*10+vy*spread)/10, (vy*10-vx*spread)/10)
	case "delayed_echo":
		sim.fireProjectile(*enemy, spec, dx, dy, distance)
		before := len(sim.projectiles)
		sim.fireProjectileVelocity(*enemy, spec, dx*max(12, spec.ProjectileSpeed)/distance, dy*max(12, spec.ProjectileSpeed)/distance)
		if len(sim.projectiles) > before {
			sim.projectiles[len(sim.projectiles)-1].delay = max(12, attack.TelegraphTicks)
		}
	default:
		sim.fireProjectile(*enemy, spec, dx, dy, distance)
	}
}

func (sim *simulation) fireProjectile(enemy enemyEntity, spec EnemySpec, dx, dy, distance int) {
	speed := max(12, spec.ProjectileSpeed)
	sim.fireProjectileVelocity(enemy, spec, dx*speed/distance, dy*speed/distance)
}

func (sim *simulation) fireProjectileVelocity(enemy enemyEntity, spec EnemySpec, vx, vy int) {
	if len(sim.projectiles) >= MaxProjectiles {
		return
	}
	sim.nextBulletID++
	sim.projectiles = append(sim.projectiles, projectileEntity{
		id: sim.nextBulletID, x: enemy.x, y: enemy.y,
		vx: vx, vy: vy, damage: max(1, spec.ProjectileDamage), pattern: spec.Pattern,
	})
}

func (sim *simulation) updateHazards() {
	if !hasString(sim.config.Hazards, "crossfire") {
		return
	}
	interval := max(90, 150-sim.config.NoiseLevel*10)
	if sim.tick%interval != 0 || len(sim.projectiles)+2 > MaxProjectiles {
		return
	}
	y := 1100 + sim.random.intn(3600)
	speed := 24 + sim.config.NoiseLevel*2
	damage := 3 + sim.config.NoiseLevel
	for _, shot := range []struct{ x, vx int }{{80, speed}, {ArenaWidth - 80, -speed}} {
		sim.nextBulletID++
		sim.projectiles = append(sim.projectiles, projectileEntity{id: sim.nextBulletID, x: shot.x, y: y, vx: shot.vx, damage: damage, pattern: "crossfire"})
	}
}

func (sim *simulation) updateSignalDecay() {
	if !hasString(sim.config.Hazards, "signal_decay") || len(sim.weave) == 0 || sim.tick-sim.lastSignalTick < 150 {
		return
	}
	sim.weave = sim.weave[1:]
	if len(sim.signalWaypoints) > 0 {
		sim.signalWaypoints = sim.signalWaypoints[1:]
	}
	sim.routeStep = len(sim.weave)
	sim.protocol, sim.routeReady = NoProtocol, false
	sim.lastSignalTick = sim.tick
}
