package shooter

func (sim *simulation) updateEnemies() {
	for index := range sim.enemies {
		enemy := &sim.enemies[index]
		if enemy.health <= 0 {
			continue
		}
		enemy.age++
		if enemy.boss {
			sim.updateBoss(enemy)
			continue
		}
		spec := sim.config.Enemies[enemy.specIndex]
		sim.moveEnemy(enemy, spec)
		enemy.fireClock++
		interval := encoreInterval(spec.FireInterval, sim.config.EncoreLevel, 12)
		if enemy.fireClock >= interval {
			enemy.fireClock = 0
			sim.fireEnemy(enemy, spec, spec.ShotPattern)
			if sim.config.EncoreLevel >= 2 && enemy.volley&1 != 0 {
				sim.fireEnemySecondary(enemy, spec)
			}
			enemy.volley++
		}
		if enemy.y >= playerY-enemyRadius && abs(enemy.x-sim.playerX) < playerRadius+enemyRadius {
			sim.damagePlayer(max(1, spec.ContactDamage))
			if hasTrait(spec, "steal_pickup") {
				sim.rescueCharge = max(0, sim.rescueCharge-20)
			}
			enemy.health = 0
		}
	}
	sim.removeDefeatedEnemies()
}

func (sim *simulation) moveEnemy(enemy *enemyEntity, spec EnemySpec) {
	// Chassis define the readable decision. Content move names remain useful as
	// fallback data, but these six silhouettes always keep their promised role.
	switch spec.Chassis {
	case ChassisSpamBot:
		enemy.y += max(4, spec.Speed/3)
		return
	case ChassisClipCutter:
		if enemy.y < 1250 {
			enemy.y += max(5, spec.Speed/3)
		}
		direction := 1
		if (enemy.age/45+enemy.id)&1 != 0 {
			direction = -1
		}
		enemy.x = clamp(enemy.x+direction*max(5, spec.Speed), enemyRadius, ArenaWidth-enemyRadius)
		return
	case ChassisCaptionBlob:
		if enemy.y < 1500 {
			enemy.y += max(3, spec.Speed/4)
		}
		direction := 1
		if enemy.id&1 != 0 {
			direction = -1
		}
		enemy.x = clamp(enemy.x+direction*max(3, spec.Speed/3), enemyRadius, ArenaWidth-enemyRadius)
		return
	case ChassisBlackScreenGhost:
		target := ArenaWidth - sim.playerX
		enemy.x = clamp(enemy.x+clamp(target-enemy.x, -spec.Speed, spec.Speed), enemyRadius, ArenaWidth-enemyRadius)
		if enemy.y < 1350 {
			enemy.y += max(4, spec.Speed/3)
		}
		return
	case ChassisGiftThief:
		if enemy.age < 35 {
			enemy.y += max(8, spec.Speed/3)
		} else if enemy.age < 120 {
			direction := 1
			if enemy.id&1 != 0 {
				direction = -1
			}
			enemy.x = clamp(enemy.x+direction*max(5, spec.Speed/2), enemyRadius, ArenaWidth-enemyRadius)
		} else {
			enemy.y -= max(14, spec.Speed/2)
		}
		return
	case ChassisCensorFrame:
		if enemy.y < 1150 {
			enemy.y += max(2, spec.Speed/4)
		}
		return
	}
	pattern := spec.MovePattern
	if pattern == "" {
		pattern = map[Chassis]string{ChassisSpamBot: "drift", ChassisClipCutter: "sweep", ChassisCaptionBlob: "orbit", ChassisBlackScreenGhost: "dive", ChassisGiftThief: "mirror", ChassisCensorFrame: "anchor"}[spec.Chassis]
	}
	switch pattern {
	case "drift":
		direction := 1
		if (enemy.age/45+enemy.id)&1 != 0 {
			direction = -1
		}
		enemy.x += direction * max(4, spec.Speed/2)
		enemy.y += max(3, spec.Speed/3)
	case "sweep":
		if enemy.y < 1450 {
			enemy.y += max(4, spec.Speed/2)
		}
		direction := 1
		if (enemy.age/60)&1 != 0 {
			direction = -1
		}
		enemy.x += direction * max(3, spec.Speed)
	case "dive":
		cycle := enemy.age % max(45, spec.FireInterval)
		if cycle < 24 {
			enemy.warning = 24 - cycle
		} else {
			enemy.warning = 0
			enemy.y += max(12, spec.Speed*2)
		}
	case "orbit":
		direction := 1
		if enemy.id&1 != 0 {
			direction = -1
		}
		enemy.x += direction * max(3, spec.Speed/2)
		enemy.y += max(3, spec.Speed/3)
	case "anchor":
		enemy.y += max(2, spec.Speed/4)
	case "mirror":
		dx := (ArenaWidth - sim.playerX) - enemy.x
		enemy.x += clamp(dx, -spec.Speed, spec.Speed)
		enemy.y += max(5, spec.Speed/2)
	}
	enemy.x = clamp(enemy.x, enemyRadius, ArenaWidth-enemyRadius)
}

func (sim *simulation) fireEnemy(enemy *enemyEntity, spec EnemySpec, pattern string) {
	if len(sim.enemyProjectiles) >= sim.config.Limits.EnemyProjectiles {
		return
	}
	speed := spec.ProjectileSpeed
	switch spec.Chassis {
	case ChassisSpamBot:
		sim.addEnemyHazard("spam_stream", enemy.x, enemy.y, 0, speed, spec.Damage, bulletRadius, 0, 0)
		return
	case ChassisClipCutter:
		sim.addEnemyHazard("horizontal_cut", enemy.x, enemy.y, 0, max(20, speed/2), spec.Damage, 65, 1700, 0)
		return
	case ChassisCaptionBlob:
		x := clamp(sim.playerX+(enemy.id%3-1)*520, 420, ArenaWidth-420)
		sim.addEnemyHazard("caption_block", x, enemy.y, 0, max(45, speed/2), spec.Damage, 150, 600, 0)
		return
	case ChassisBlackScreenGhost:
		sim.addEnemyHazard("black_wall", enemy.x, enemy.y, 0, max(28, speed/3), spec.Damage, 125, 900, max(16, spec.Health/2))
		return
	case ChassisGiftThief:
		// A thief is pressure by opportunity cost: it escapes with a valuable
		// support note instead of adding another visually similar bullet fan.
		return
	case ChassisCensorFrame:
		sim.fireCensorFrame(enemy, speed, spec.Damage, "censor_bar")
		return
	}
	if pattern == "" {
		pattern = map[Chassis]string{ChassisSpamBot: "aimed", ChassisClipCutter: "fan", ChassisCaptionBlob: "ring", ChassisBlackScreenGhost: "delayed", ChassisGiftThief: "beam", ChassisCensorFrame: "lane"}[spec.Chassis]
	}
	switch pattern {
	case "aimed":
		dx, dy := sim.playerX-enemy.x, playerY-enemy.y
		distance := max(1, integerSqrt(square(dx)+square(dy)))
		sim.addEnemyBullet(enemy.x, enemy.y, dx*speed/distance, dy*speed/distance, spec.Damage)
	case "beam":
		sim.addEnemyBullet(enemy.x, enemy.y, 0, speed, spec.Damage)
	case "fan":
		for _, vx := range []int{-speed / 2, 0, speed / 2} {
			sim.addEnemyBullet(enemy.x, enemy.y, vx, speed, spec.Damage)
		}
	case "delayed":
		sim.addEnemyBullet(enemy.x, enemy.y, 0, max(1, speed/2), spec.Damage)
		sim.addEnemyBullet(enemy.x+180, enemy.y-240, 0, speed, spec.Damage)
	case "ring":
		for _, vx := range []int{-speed, speed} {
			sim.addEnemyBullet(enemy.x, enemy.y, vx/2, speed, spec.Damage)
		}
	case "lane":
		for _, vx := range []int{-speed, -speed / 2, 0, speed / 2, speed} {
			sim.addEnemyBullet(enemy.x, enemy.y, vx, speed, spec.Damage)
		}
	}
	if hasTrait(spec, "echo") {
		sim.addEnemyBullet(enemy.x+120, enemy.y-180, 0, speed, spec.Damage)
	}
}

func (sim *simulation) addEnemyBullet(x, y, vx, vy, damage int) {
	sim.addEnemyHazard("enemy_shot", x, y, vx, vy, damage, bulletRadius, 0, 0)
}

func (sim *simulation) addEnemyHazard(kind string, x, y, vx, vy, damage, radius, width, health int) {
	if len(sim.enemyProjectiles) >= sim.config.Limits.EnemyProjectiles {
		return
	}
	if limit := structuredHazardLimit(kind); limit > 0 {
		active := 0
		for _, projectile := range sim.enemyProjectiles {
			if structuredHazardFamily(projectile.kind) == structuredHazardFamily(kind) {
				active++
			}
		}
		if active >= limit {
			return
		}
	}
	sim.nextProjectileID++
	sim.enemyProjectiles = append(sim.enemyProjectiles, projectileEntity{
		id: sim.nextProjectileID, x: x, y: y, vx: vx, vy: vy, damage: damage,
		kind: kind, radius: max(1, radius), width: max(0, width), health: max(0, health), hostile: true,
	})
}

func structuredHazardLimit(kind string) int {
	switch structuredHazardFamily(kind) {
	case "caption":
		return 3
	case "wall", "cut":
		return 2
	case "frame":
		return 4
	default:
		return 0
	}
}

func structuredHazardFamily(kind string) string {
	switch kind {
	case "caption_block":
		return "caption"
	case "black_wall":
		return "wall"
	case "horizontal_cut", "highlight_cut":
		return "cut"
	case "censor_bar", "censor_bar_fast", "boss_lane", "audit_bar", "finale_lane", "special_frame", "encore_frame", "choice_frame":
		return "frame"
	default:
		return kind
	}
}

func (sim *simulation) fireCensorFrame(enemy *enemyEntity, speed, damage int, kind string) {
	// All frames currently on screen share a broadcast-safe gap. Independent
	// enemy IDs previously produced contradictory frames with no legal lane.
	gap := (sim.tick / 150) % 5
	for lane := range 5 {
		if lane == gap {
			continue
		}
		sim.addEnemyHazard(kind, 360+lane*720, enemy.y, 0, speed, damage, 110, 460, 0)
	}
}

func (sim *simulation) fireEnemySecondary(enemy *enemyEntity, spec EnemySpec) {
	speed := max(1, spec.ProjectileSpeed)
	switch spec.Chassis {
	case ChassisSpamBot:
		sim.addEnemyHazard("spam_cross", enemy.x, enemy.y, speed/3, speed, spec.Damage, bulletRadius, 0, 0)
		sim.addEnemyHazard("spam_cross", enemy.x, enemy.y, -speed/3, speed, spec.Damage, bulletRadius, 0, 0)
	case ChassisClipCutter:
		x := ArenaWidth - enemy.x
		sim.addEnemyHazard("horizontal_cut", x, enemy.y-220, 0, max(20, speed/2), spec.Damage, 65, 1300, 0)
	case ChassisCaptionBlob:
		x := clamp(ArenaWidth-sim.playerX, 420, ArenaWidth-420)
		sim.addEnemyHazard("caption_block", x, enemy.y-180, 0, max(48, speed/2), spec.Damage, 135, 520, 0)
	case ChassisBlackScreenGhost:
		sim.addEnemyHazard("black_wall", ArenaWidth-enemy.x, enemy.y-220, 0, max(30, speed/3), spec.Damage, 110, 720, max(12, spec.Health/3))
	case ChassisGiftThief:
		enemy.age = max(enemy.age, 105)
	case ChassisCensorFrame:
		sim.fireCensorFrame(enemy, speed, spec.Damage, "censor_bar_fast")
	}
}

func encoreInterval(base, level, minimum int) int {
	if level >= 1 {
		base = base * 9 / 10
	}
	return max(minimum, base)
}

func (sim *simulation) removeDefeatedEnemies() {
	alive := sim.enemies[:0]
	for _, enemy := range sim.enemies {
		if enemy.health > 0 && enemy.y > -enemyRadius && enemy.y < ArenaHeight+enemyRadius {
			alive = append(alive, enemy)
			continue
		}
		if enemy.health <= 0 {
			sim.kills++
			sim.combo++
			sim.comboClock = 90 + sim.runtime.comboExtend
			score := 100
			if enemy.boss && sim.config.Boss != nil {
				score = max(1000, sim.config.Boss.Score)
			} else if enemy.specIndex >= 0 && enemy.specIndex < len(sim.config.Enemies) {
				spec := sim.config.Enemies[enemy.specIndex]
				score = max(50, spec.Score)
				if hasTrait(spec, "split") && len(alive) < sim.config.Limits.Enemies-1 {
					for _, offset := range []int{-160, 160} {
						sim.nextEnemyID++
						alive = append(alive, enemyEntity{id: sim.nextEnemyID, specIndex: enemy.specIndex, x: clamp(enemy.x+offset, enemyRadius, ArenaWidth-enemyRadius), y: enemy.y, health: max(1, enemy.maxHealth/3), maxHealth: max(1, enemy.maxHealth/3)})
					}
				}
			}
			sim.score += score * max(1, sim.combo)
			sim.earnRescue(10)
			noteValue := 12
			if !enemy.boss && enemy.specIndex >= 0 && enemy.specIndex < len(sim.config.Enemies) && sim.config.Enemies[enemy.specIndex].Chassis == ChassisGiftThief {
				noteValue = 30
				sim.score += 200
			}
			sim.dropSupportNote(enemy.x, enemy.y, noteValue)
			if sim.runtime.recoveryDrop > 0 && sim.kills%max(2, 6-sim.runtime.recoveryDrop) == 0 {
				sim.health = min(sim.runtime.maxHealth, sim.health+1)
			}
		}
	}
	sim.enemies = alive
}

func (sim *simulation) dropSupportNote(x, y, value int) {
	if len(sim.pickups) >= sim.config.Limits.Pickups {
		return
	}
	sim.nextPickupID++
	sim.pickups = append(sim.pickups, pickupEntity{id: sim.nextPickupID, x: x, y: y, value: max(1, value)})
}

func (sim *simulation) updatePickups() {
	kept := sim.pickups[:0]
	for _, pickup := range sim.pickups {
		pickup.y += 70
		magnetRange := 220 + sim.runtime.pickupMagnet
		if pickup.y >= playerY-900 && abs(pickup.x-sim.playerX) <= magnetRange {
			pickup.x += clamp(sim.playerX-pickup.x, -90, 90)
		}
		if square(pickup.x-sim.playerX)+square(pickup.y-playerY) <= square(playerRadius+70) {
			sim.pickupsCollected++
			sim.lastPickupTick = sim.tick
			sim.earnRescue(pickup.value)
			sim.score += 40 * max(1, sim.combo)
			continue
		}
		if pickup.y <= ArenaHeight+70 {
			kept = append(kept, pickup)
		}
	}
	sim.pickups = kept
}

func (sim *simulation) updateProjectiles() {
	playerShots := sim.playerProjectiles[:0]
	bossDefeated := false
	for _, shot := range sim.playerProjectiles {
		shot.x += shot.vx
		shot.y += shot.vy
		if shot.y < -bulletRadius || shot.x < -bulletRadius || shot.x > ArenaWidth+bulletRadius {
			continue
		}
		hit := sim.hitBreakableHazard(shot)
		if hit {
			continue
		}
		for index := range sim.enemies {
			if sim.enemies[index].health <= 0 || square(shot.x-sim.enemies[index].x)+square(shot.y-sim.enemies[index].y) > square(enemyRadius+bulletRadius) {
				continue
			}
			damage := shot.damage
			if sim.enemies[index].boss {
				damage += sim.runtime.bossBreak
			}
			if !sim.enemies[index].boss && hasTrait(sim.config.Enemies[sim.enemies[index].specIndex], "armor") {
				damage = max(1, damage*2/3)
			}
			sim.enemies[index].health -= damage
			if sim.enemies[index].boss && sim.enemies[index].health <= 0 {
				bossDefeated = true
			}
			sim.applyKitOnHit(index, shot.damage)
			hit = true
			if shot.pierce > 0 {
				shot.pierce--
				hit = false
			}
			break
		}
		if !hit {
			playerShots = append(playerShots, shot)
		}
	}
	sim.playerProjectiles = playerShots
	if bossDefeated {
		// A successful live-show finish cuts the hostile feed immediately. The
		// fixed-length trace may contain trailing input, but a player cannot lose
		// to an already defeated Boss's lingering projectile on the same Tick.
		sim.enemyProjectiles = sim.enemyProjectiles[:0]
		sim.addEffect("boss_cut", ArenaWidth/2, playerY/2, 30, 1)
	}

	hostile := sim.enemyProjectiles[:0]
	for _, bullet := range sim.enemyProjectiles {
		if bullet.kind == "black_wall" && bullet.health <= 0 {
			continue
		}
		bullet.x += bullet.vx
		bullet.y += bullet.vy
		radius := max(bulletRadius, bullet.radius)
		if bullet.y > ArenaHeight+radius || bullet.y < -radius || bullet.x < -radius-bullet.width/2 || bullet.x > ArenaWidth+radius+bullet.width/2 {
			continue
		}
		distance := square(bullet.x-sim.playerX) + square(bullet.y-playerY)
		if hostileHitsPlayer(bullet, sim.playerX) {
			sim.damagePlayer(bullet.damage)
			continue
		}
		if !bullet.grazed && bullet.width == 0 && distance <= square(grazeRadius) {
			bullet.grazed = true
			sim.grazeCount++
			sim.combo++
			sim.comboClock = 75 + sim.runtime.comboExtend
			sim.earnRescue(sim.runtime.grazeCharge)
			sim.score += 25 * max(1, sim.combo)
		}
		hostile = append(hostile, bullet)
	}
	sim.enemyProjectiles = hostile
}

func (sim *simulation) hitBreakableHazard(shot projectileEntity) bool {
	for index := range sim.enemyProjectiles {
		hazard := &sim.enemyProjectiles[index]
		if hazard.kind != "black_wall" || hazard.health <= 0 || abs(shot.y-hazard.y) > max(hazard.radius, 120)+bulletRadius || abs(shot.x-hazard.x) > hazard.width/2+bulletRadius {
			continue
		}
		hazard.health -= max(1, shot.damage)
		sim.addEffect("wall_hit", shot.x, shot.y, 8, shot.damage)
		if hazard.health <= 0 {
			sim.score += 120
			sim.earnRescue(4)
			sim.addEffect("wall_break", hazard.x, hazard.y, 24, hazard.width)
		}
		return true
	}
	return false
}

func hostileHitsPlayer(bullet projectileEntity, playerX int) bool {
	radius := max(bulletRadius, bullet.radius)
	if bullet.width > 0 {
		return abs(bullet.y-playerY) <= radius+playerRadius && abs(bullet.x-playerX) <= bullet.width/2+playerRadius
	}
	return square(bullet.x-playerX)+square(bullet.y-playerY) <= square(playerRadius+radius)
}

func (sim *simulation) damagePlayer(amount int) {
	if amount <= 0 || sim.health <= 0 || sim.invulnerableTicks > 0 {
		return
	}
	absorbed := min(sim.shield, amount)
	sim.shield -= absorbed
	amount -= absorbed
	sim.health = max(0, sim.health-amount)
	sim.invulnerableTicks = HitInvulnerabilityTicks
	sim.combo = 0
	sim.comboClock = 0
}

func (sim *simulation) applyKitOnHit(enemyIndex, baseDamage int) {
	if enemyIndex < 0 || enemyIndex >= len(sim.enemies) {
		return
	}
	enemy := &sim.enemies[enemyIndex]
	switch sim.config.Kit.ID {
	case KitNana:
		enemy.marks = min(3, enemy.marks+1)
		sim.addEffect("route_mark", enemy.x, enemy.y, 45, enemy.marks)
	case KitNailu:
		for _, effect := range sim.effects {
			if effect.kind == "memory_plant" && square(effect.x-enemy.x)+square(effect.y-enemy.y) <= square(180) {
				return
			}
		}
		sim.addEffect("memory_plant", enemy.x, enemy.y, 450, max(1, baseDamage))
	}
}

func (sim *simulation) updateKitPassives() {
	switch sim.config.Kit.ID {
	case KitLulu:
		sim.rewriteNearbyBullet()
	case KitXingtong:
		sim.updateAlignmentBeam()
	}
}

func (sim *simulation) rewriteNearbyBullet() {
	if sim.tick%12 != 0 || len(sim.playerProjectiles) >= sim.config.Limits.PlayerProjectiles {
		return
	}
	bestIndex, bestDistance := -1, square(520)+1
	for index, bullet := range sim.enemyProjectiles {
		distance := square(bullet.x-sim.playerX) + square(bullet.y-playerY)
		if distance < bestDistance {
			bestIndex, bestDistance = index, distance
		}
	}
	if bestIndex < 0 {
		return
	}
	bullet := sim.enemyProjectiles[bestIndex]
	sim.enemyProjectiles = append(sim.enemyProjectiles[:bestIndex], sim.enemyProjectiles[bestIndex+1:]...)
	sim.nextProjectileID++
	sim.playerProjectiles = append(sim.playerProjectiles, projectileEntity{id: sim.nextProjectileID, x: bullet.x, y: bullet.y, vy: -175, damage: max(1, sim.runtime.damage/2), pierce: 1})
	sim.addEffect("subtitle_rewrite", bullet.x, bullet.y, 18, 1)
}

func (sim *simulation) updateAlignmentBeam() {
	target := -1
	for index := range sim.enemies {
		if sim.enemies[index].health <= 0 || abs(sim.enemies[index].x-sim.playerX) > 135 {
			continue
		}
		if target < 0 || sim.enemies[index].y > sim.enemies[target].y {
			target = index
		}
	}
	if target < 0 {
		sim.alignmentTicks = 0
		return
	}
	sim.alignmentTicks++
	if sim.alignmentTicks < 12 || sim.alignmentTicks%6 != 0 {
		return
	}
	damage := max(1, sim.runtime.damage/3)
	sim.enemies[target].health -= damage
	sim.addEffect("alignment_beam", sim.playerX, sim.enemies[target].y, 7, damage)
}

func (sim *simulation) threatSnapshots() []ThreatSnapshot {
	result := make([]ThreatSnapshot, 0, len(sim.enemies))
	for _, enemy := range sim.enemies {
		if enemy.health <= 0 {
			continue
		}
		if enemy.warning > 0 {
			result = append(result, ThreatSnapshot{SourceID: enemy.id, Kind: "charge_lane", TicksRemaining: enemy.warning, Origin: Position{X: enemy.x, Y: enemy.y}, Target: Position{X: enemy.x, Y: playerY}, Width: enemyRadius * 2})
			continue
		}
		pattern, special, telegraph, interval := "", "", 0, 0
		if enemy.boss && sim.config.Boss != nil {
			stageIndex := clamp(enemy.phase-1, 0, len(sim.config.Boss.Stages)-1)
			stage := sim.config.Boss.Stages[stageIndex]
			pattern, special, telegraph, interval = stage.ShotPattern, stage.Special, stage.TelegraphTicks, encoreInterval(stage.FireInterval, sim.config.EncoreLevel, 10)
			if pattern == "" {
				pattern = bossDefaultPattern(sim.config.Boss.ID, enemy.phase)
			}
		} else {
			spec := sim.config.Enemies[enemy.specIndex]
			pattern, telegraph, interval = spec.ShotPattern, spec.TelegraphTicks, encoreInterval(spec.FireInterval, sim.config.EncoreLevel, 12)
		}
		remaining := interval - enemy.fireClock
		if telegraph <= 0 || remaining <= 0 || remaining > telegraph {
			continue
		}
		if enemy.boss {
			if warning, ok := sim.bossSpecialThreat(enemy, special, remaining); ok {
				result = append(result, warning)
			}
			if warning, ok := sim.storyChoiceThreat(enemy, remaining); ok {
				result = append(result, warning)
			}
			if sim.config.EncoreLevel >= 3 {
				result = append(result, sim.bossRemixThreat(enemy, remaining))
			}
		}
		if !enemy.boss {
			spec := sim.config.Enemies[enemy.specIndex]
			switch spec.Chassis {
			case ChassisClipCutter:
				result = append(result, ThreatSnapshot{SourceID: enemy.id, Kind: "horizontal_cut", TicksRemaining: remaining, Origin: Position{X: enemy.x, Y: enemy.y}, Target: Position{X: enemy.x, Y: playerY}, Width: 1700})
				continue
			case ChassisCaptionBlob:
				x := clamp(sim.playerX+(enemy.id%3-1)*520, 420, ArenaWidth-420)
				result = append(result, ThreatSnapshot{SourceID: enemy.id, Kind: "caption_block", TicksRemaining: remaining, Origin: Position{X: enemy.x, Y: enemy.y}, Target: Position{X: x, Y: playerY}, Width: 600, Radius: 150})
				continue
			case ChassisBlackScreenGhost:
				result = append(result, ThreatSnapshot{SourceID: enemy.id, Kind: "black_wall", TicksRemaining: remaining, Origin: Position{X: enemy.x, Y: enemy.y}, Target: Position{X: enemy.x, Y: playerY}, Width: 900, Radius: 125})
				continue
			case ChassisGiftThief:
				continue
			case ChassisCensorFrame:
				gap := ((sim.tick + remaining) / 150) % 5
				result = append(result, ThreatSnapshot{SourceID: enemy.id, Kind: "censor_gap", TicksRemaining: remaining, Origin: Position{X: enemy.x, Y: enemy.y}, Target: Position{X: 360 + gap*720, Y: playerY}, Width: 260})
				continue
			}
		}
		kind, width, radius := "aimed_line", 120, 0
		switch pattern {
		case "beam", "lane", "lanes", "highlight", "audit":
			kind, width = "danger_lane", 260
		case "fan", "applause", "translation":
			kind, width = "fan_cone", 900
		case "ring", "spiral", "finale":
			kind, radius, width = "radial_burst", 520, 0
		case "delayed", "echo":
			kind, radius, width = "delayed_echo", 180, 0
		}
		result = append(result, ThreatSnapshot{SourceID: enemy.id, Kind: kind, TicksRemaining: remaining, Origin: Position{X: enemy.x, Y: enemy.y}, Target: Position{X: sim.playerX, Y: playerY}, Radius: radius, Width: width})
	}
	return result
}

func (sim *simulation) storyChoiceThreat(enemy enemyEntity, remaining int) (ThreatSnapshot, bool) {
	warning := ThreatSnapshot{SourceID: enemy.id, TicksRemaining: remaining, Origin: Position{X: enemy.x, Y: enemy.y}, Target: Position{X: sim.playerX, Y: playerY}}
	switch storyChoiceMode(sim.config.StoryChoiceID) {
	case 1:
		warning.Kind, warning.Width = "aimed_line", 150
	case 2:
		warning.Kind, warning.Width = "censor_gap", 260
		warning.Target.X = 360 + ((enemy.volley+int(seedFromString(string(sim.config.Boss.ID))%5)+4)%5)*720
	default:
		return ThreatSnapshot{}, false
	}
	return warning, true
}

func (sim *simulation) bossRemixThreat(enemy enemyEntity, remaining int) ThreatSnapshot {
	warning := ThreatSnapshot{SourceID: enemy.id, TicksRemaining: remaining, Origin: Position{X: enemy.x, Y: enemy.y}, Target: Position{X: sim.playerX, Y: playerY}}
	switch sim.config.Boss.ID {
	case BossOptimalNana, BossPerfectHighlight:
		warning.Kind, warning.Width = "censor_gap", 260
		warning.Target.X = 360 + ((enemy.volley+int(seedFromString(string(sim.config.Boss.ID))%5)+3)%5)*720
	case BossAlwaysOnIdol, BossApprovedTranslation:
		warning.Kind, warning.Width = "horizontal_cut", 1450
		warning.Target.X = ArenaWidth - enemy.x
	case BossPerfectCaptain, BossRealityAuditor:
		warning.Kind, warning.Radius = "radial_burst", 520
	case BossPhysicalOriginal, BossAutoArchiveSystem:
		warning.Kind, warning.Width, warning.Radius = "black_wall", 1050, 125
		warning.Target.X = clamp(ArenaWidth-sim.playerX, 650, ArenaWidth-650)
	}
	return warning
}

func (sim *simulation) bossSpecialThreat(enemy enemyEntity, special string, remaining int) (ThreatSnapshot, bool) {
	warning := ThreatSnapshot{SourceID: enemy.id, TicksRemaining: remaining, Origin: Position{X: enemy.x, Y: enemy.y}, Target: Position{X: sim.playerX, Y: playerY}}
	switch special {
	case "tidy-intro", "word-by-word", "prove-the-address", "helpful-rewrite", "erase-the-flowers", "overwrite-drafts":
		warning.Kind, warning.Width, warning.Radius = "caption_block", 720, 170
	case "empty-horizon", "delete-loss", "overtime-wall", "nothing-happened":
		warning.Kind, warning.Width, warning.Radius = "black_wall", 1200, 135
	case "reply-now", "crop-the-miss", "assign-everything", "remove-duplicates":
		warning.Kind, warning.Width = "censor_gap", 260
		warning.Target.X = 360 + ((enemy.volley+2)%5)*720
	case "endless-encore", "approved-only", "split-stage", "archive-everyone":
		warning.Kind, warning.Radius = "radial_burst", 520
	case "applause-loop", "carry-the-room", "copied-laugh", "bad-take-echo", "tone-correction", "double-exposure", "copy-position":
		warning.Kind, warning.Width = "aimed_line", 150
	default:
		return ThreatSnapshot{}, false
	}
	return warning, true
}

func enemyIntent(enemy enemyEntity, spec EnemySpec, encoreLevel int) string {
	if enemy.warning > 0 {
		return "charge"
	}
	remaining := encoreInterval(spec.FireInterval, encoreLevel, 12) - enemy.fireClock
	if remaining <= 15 {
		return "fire"
	}
	return ""
}

func hasTrait(spec EnemySpec, trait string) bool {
	for _, candidate := range spec.Traits {
		if candidate == trait {
			return true
		}
	}
	return false
}

func abs(value int) int {
	if value < 0 {
		return -value
	}
	return value
}
