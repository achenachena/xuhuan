package action

const (
	avaReplayDelayTicks = 18
	friendlyShotSpeed   = 180
	friendlyShotLife    = 60
	bloomSafeTicks      = 45
)

func (sim *simulation) launchFriendlyShot(position Vec, damage int) {
	targetID := sim.nearestEnemyID(position.X, position.Y)
	if targetID == 0 || len(sim.friendlyShots) >= MaxPlayerShots {
		return
	}
	sim.nextFriendlyID++
	sim.friendlyShots = append(sim.friendlyShots, friendlyProjectileEntity{
		id: sim.nextFriendlyID, x: position.X, y: position.Y,
		targetID: targetID, damage: damage, life: friendlyShotLife,
	})
}

func (sim *simulation) recordWarp(start, end Vec) {
	sim.lastWarpStart, sim.lastWarpEnd, sim.hasLastWarp = start, end, true
	for _, behavior := range sim.config.Runtime.Behaviors {
		if behavior.Kind == "warp_aftershock" {
			sim.scheduleWarpReplay(start, end, 6+behavior.Level*2, behavior.Amount, 360+behavior.Level*40)
		}
	}
	if sim.config.Runtime.Passive == "ava_afterimage" {
		sim.scheduleWarpReplay(start, end, avaReplayDelayTicks, max(5, sim.config.Runtime.WarpDamage/2), 380)
	}
}

func (sim *simulation) onGraze() {
	sim.totalGrazes++
	for _, behavior := range sim.config.Runtime.Behaviors {
		if behavior.Kind == "graze_guard" && behavior.Every > 0 && sim.totalGrazes%behavior.Every == 0 {
			sim.shield += behavior.Amount
		}
	}
}

func (sim *simulation) onProtocolComplete() {
	for _, behavior := range sim.config.Runtime.Behaviors {
		if behavior.Kind != "protocol_echo" || behavior.Every <= 0 || sim.protocols%behavior.Every != 0 {
			continue
		}
		for index := range sim.enemies {
			if sim.enemies[index].health > 0 {
				sim.enemies[index].health -= behavior.Amount
			}
		}
		sim.score += behavior.Amount * 5
	}
}

func (sim *simulation) onEnemyKilled() {
	for _, behavior := range sim.config.Runtime.Behaviors {
		if behavior.Kind != "kill_signal" || behavior.Every <= 0 || sim.kills%behavior.Every != 0 {
			continue
		}
		index := (sim.kills/behavior.Every + behavior.Level - 1) % len(sim.signalCooldown)
		sim.signalCooldown[index] = 0
		sim.signalPulse = max(sim.signalPulse, 12)
	}
}

func (sim *simulation) scheduleWarpReplay(start, end Vec, delay, damage, radius int) {
	replay := delayedWarpEntity{start: start, end: end, triggerTick: sim.tick + delay, damage: damage, radius: radius}
	if len(sim.delayedWarps) == 4 {
		copy(sim.delayedWarps, sim.delayedWarps[1:])
		sim.delayedWarps[len(sim.delayedWarps)-1] = replay
		return
	}
	sim.delayedWarps = append(sim.delayedWarps, replay)
}

func (sim *simulation) empowerLatestAvaReplay(power int) {
	if len(sim.delayedWarps) == 0 && sim.hasLastWarp {
		sim.scheduleWarpReplay(sim.lastWarpStart, sim.lastWarpEnd, avaReplayDelayTicks, power, 650)
		return
	}
	if len(sim.delayedWarps) == 0 {
		return
	}
	latest := &sim.delayedWarps[len(sim.delayedWarps)-1]
	latest.damage = max(latest.damage, power+sim.config.Runtime.WarpDamage/2)
	latest.radius = max(latest.radius, 650)
}

func (sim *simulation) activateKitWarp(empowered bool) {
	switch sim.config.Runtime.Passive {
	case "nana_route_chain":
		if empowered && sim.protocol != ResonanceProtocol {
			sim.detonateNanaWaypoints(max(8, sim.config.Runtime.WarpDamage/2+sim.config.Runtime.ProtocolDamage/3))
		}
	case "lulu_convert_projectiles":
		sim.convertMarkedProjectiles()
	case "nailu_memory_bloom":
		sim.detonateBlooms()
	}
}

func (sim *simulation) detonateNanaWaypoints(damage int) {
	for index, point := range sim.signalWaypoints {
		sim.damageArea(point, 560, damage+index*2)
		sim.clearProjectiles(point, 620)
	}
}

func (sim *simulation) plantBloom(position Vec) {
	if len(sim.blooms) == MaxSignals {
		copy(sim.blooms, sim.blooms[1:])
		sim.blooms[len(sim.blooms)-1] = position
		return
	}
	sim.blooms = append(sim.blooms, position)
}

func (sim *simulation) detonateBlooms() {
	for index, bloom := range sim.blooms {
		damage := max(5, sim.config.Runtime.WarpDamage/2) + index*2
		sim.damageArea(bloom, 650, damage)
		sim.clearProjectiles(bloom, 720)
		zone := safeZoneEntity{position: bloom, radius: 460, expiresTick: sim.tick + bloomSafeTicks}
		if len(sim.safeZones) == MaxSignals {
			copy(sim.safeZones, sim.safeZones[1:])
			sim.safeZones[len(sim.safeZones)-1] = zone
		} else {
			sim.safeZones = append(sim.safeZones, zone)
		}
	}
	sim.blooms = sim.blooms[:0]
}

func (sim *simulation) markAllProjectiles() {
	for index := range sim.projectiles {
		sim.projectiles[index].glitchMarked = true
	}
}

func (sim *simulation) convertMarkedProjectiles() {
	kept := sim.projectiles[:0]
	for _, bullet := range sim.projectiles {
		if !bullet.glitchMarked {
			kept = append(kept, bullet)
			continue
		}
		damage := max(3, sim.config.Runtime.AttackDamage/2+sim.config.Runtime.ResonancePower/4)
		sim.launchFriendlyShot(Vec{X: bullet.x, Y: bullet.y}, damage)
	}
	sim.projectiles = kept
}

func (sim *simulation) updateKitEffects() {
	activeZones := sim.safeZones[:0]
	for _, zone := range sim.safeZones {
		if zone.expiresTick > sim.tick {
			activeZones = append(activeZones, zone)
		}
	}
	sim.safeZones = activeZones

	pending := sim.delayedWarps[:0]
	for _, replay := range sim.delayedWarps {
		if replay.triggerTick > sim.tick {
			pending = append(pending, replay)
			continue
		}
		middle := Vec{X: (replay.start.X + replay.end.X) / 2, Y: (replay.start.Y + replay.end.Y) / 2}
		for index := range sim.enemies {
			if nearTravelPath(sim.enemies[index].x, sim.enemies[index].y, replay.start.X, replay.start.Y, middle.X, middle.Y, replay.end.X, replay.end.Y, replay.radius) {
				sim.enemies[index].health -= replay.damage
			}
		}
		kept := sim.projectiles[:0]
		for _, bullet := range sim.projectiles {
			if !nearTravelPath(bullet.x, bullet.y, replay.start.X, replay.start.Y, middle.X, middle.Y, replay.end.X, replay.end.Y, replay.radius) {
				kept = append(kept, bullet)
			}
		}
		sim.projectiles = kept
		sim.score += 40
	}
	sim.delayedWarps = pending
	sim.updateFriendlyProjectiles()
}

func (sim *simulation) updateFriendlyProjectiles() {
	kept := sim.friendlyShots[:0]
	for _, shot := range sim.friendlyShots {
		shot.life--
		if shot.life <= 0 {
			continue
		}
		targetIndex := sim.enemyIndexByID(shot.targetID)
		if targetIndex < 0 || sim.enemies[targetIndex].health <= 0 {
			shot.targetID = sim.nearestEnemyID(shot.x, shot.y)
			targetIndex = sim.enemyIndexByID(shot.targetID)
		}
		if targetIndex < 0 {
			continue
		}
		target := &sim.enemies[targetIndex]
		dx, dy := target.x-shot.x, target.y-shot.y
		distance := max(1, integerSqrt(dx*dx+dy*dy))
		if distance <= enemyRadius+bulletRadius {
			target.health -= shot.damage
			sim.score += 20
			continue
		}
		shot.x += dx * friendlyShotSpeed / distance
		shot.y += dy * friendlyShotSpeed / distance
		kept = append(kept, shot)
	}
	sim.friendlyShots = kept
}

func (sim *simulation) nearestEnemyID(x, y int) int {
	nearestID, nearestDistance := 0, int(^uint(0)>>1)
	for _, enemy := range sim.enemies {
		distance := distanceSquared(x, y, enemy.x, enemy.y)
		if enemy.health > 0 && distance < nearestDistance {
			nearestID, nearestDistance = enemy.id, distance
		}
	}
	return nearestID
}

func (sim *simulation) enemyIndexByID(id int) int {
	for index, enemy := range sim.enemies {
		if enemy.id == id {
			return index
		}
	}
	return -1
}

func (sim *simulation) damageArea(center Vec, radius, damage int) {
	for index := range sim.enemies {
		if distanceSquared(center.X, center.Y, sim.enemies[index].x, sim.enemies[index].y) <= radius*radius {
			sim.enemies[index].health -= damage
		}
	}
}

func (sim *simulation) clearProjectiles(center Vec, radius int) {
	kept := sim.projectiles[:0]
	for _, bullet := range sim.projectiles {
		if distanceSquared(center.X, center.Y, bullet.x, bullet.y) > radius*radius {
			kept = append(kept, bullet)
		}
	}
	sim.projectiles = kept
}

func (sim *simulation) insideSafeZone(x, y int) bool {
	for _, zone := range sim.safeZones {
		if zone.expiresTick > sim.tick && distanceSquared(x, y, zone.position.X, zone.position.Y) <= zone.radius*zone.radius {
			return true
		}
	}
	return false
}
