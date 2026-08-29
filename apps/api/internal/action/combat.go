package action

func (sim *simulation) autoAttack() {
	sim.attackClock++
	if sim.attackClock < sim.playerAttackInterval() {
		return
	}
	sim.attackClock = 0
	damage := sim.config.Runtime.AttackDamage
	if sim.distortion >= 60 {
		damage += damage * max(25, sim.config.Runtime.OverloadBonus) / 100
	}
	targetCount := max(1, sim.config.Runtime.ProjectileCount+sim.config.Runtime.ProjectilePierce)
	if sim.config.Runtime.Passive == "xingtong_signal_stance" {
		switch sim.lastSignal {
		case SurgeSignal:
			damage += max(1, damage/4)
		case EchoSignal:
			targetCount++
		}
	}
	selected := make([]bool, len(sim.enemies))
	primary := -1
	for shot := 0; shot < targetCount; shot++ {
		nearest, nearestDistance := -1, int(^uint(0)>>1)
		for index, enemy := range sim.enemies {
			distance := distanceSquared(sim.playerX, sim.playerY, enemy.x, enemy.y)
			if enemy.health > 0 && !selected[index] && distance < nearestDistance {
				nearest, nearestDistance = index, distance
			}
		}
		if nearest < 0 {
			break
		}
		selected[nearest] = true
		if primary < 0 {
			primary = nearest
		}
		shotDamage := damage
		if shot >= max(1, sim.config.Runtime.ProjectileCount) {
			shotDamage = max(1, damage*70/100)
		}
		spec := sim.config.Enemies[sim.enemies[nearest].specIndex]
		if armor := traitAmount(spec, "armored"); armor > 0 {
			// Armor is a bounded flat reduction. It changes target priority without
			// turning low-level builds into one-damage chip attacks.
			shotDamage -= min(armor, max(1, shotDamage/3))
		}
		if link, ok := findTrait(spec, "linked_shield"); ok {
			for index, other := range sim.enemies {
				otherSpec := sim.config.Enemies[other.specIndex]
				if index != nearest && other.health > 0 && otherSpec.Slug == link.Value {
					mitigation := clamp(100-link.Amount*10, 50, 90)
					shotDamage = max(1, shotDamage*mitigation/100)
					break
				}
			}
		}
		sim.enemies[nearest].health -= shotDamage
	}
	if primary < 0 {
		return
	}
	sim.autoAttacks++
	if sim.config.Runtime.Passive == "xingtong_signal_stance" && sim.lastSignal == GuardSignal && sim.autoAttacks%3 == 0 {
		sim.shield++
	}
	if sim.config.Runtime.Passive == "diana_cheer_pulse" && sim.autoAttacks%3 == 0 {
		for index := range sim.enemies {
			if index != primary && distanceSquared(sim.enemies[primary].x, sim.enemies[primary].y, sim.enemies[index].x, sim.enemies[index].y) < 900*900 {
				sim.enemies[index].health -= max(1, damage/2)
			}
		}
	}
}

func (sim *simulation) playerAttackInterval() int {
	// Player shots resolve as deterministic hits; projectile speed represents
	// their travel cadence in the authoritative model while the client renders
	// the corresponding flight animation.
	speed := max(1, sim.config.Runtime.ProjectileSpeed)
	return max(4, sim.config.Runtime.AttackInterval*100/speed)
}

func (sim *simulation) updateProjectiles() {
	kept := sim.projectiles[:0]
	for _, bullet := range sim.projectiles {
		if sim.insideSafeZone(bullet.x, bullet.y) {
			continue
		}
		if bullet.delay > 0 {
			bullet.delay--
			kept = append(kept, bullet)
			continue
		}
		bullet.x += bullet.vx
		bullet.y += bullet.vy
		if bullet.x < -100 || bullet.x > ArenaWidth+100 || bullet.y < 500 || bullet.y > ArenaHeight+100 {
			continue
		}
		if sim.insideSafeZone(bullet.x, bullet.y) {
			continue
		}
		distance := distanceSquared(sim.playerX, sim.playerY, bullet.x, bullet.y)
		if distance <= (playerRadius+bulletRadius)*(playerRadius+bulletRadius) {
			if sim.invulnerable == 0 {
				sim.damagePlayer(bullet.damage)
				sim.invulnerable = 10
			}
			continue
		}
		grazeRadius := sim.config.Runtime.GrazeRadius
		if grazeRadius <= 0 {
			grazeRadius = 310
		}
		if !bullet.grazed && distance <= grazeRadius*grazeRadius {
			bullet.grazed = true
			if sim.config.Runtime.Passive == "lulu_convert_projectiles" {
				bullet.glitchMarked = true
			}
			sim.lastGraze = sim.tick
			sim.distortion += sim.config.Runtime.DistortionGain + sim.config.NoiseLevel
			sim.onGraze()
			if sim.distortion >= 100 {
				sim.damagePlayer(12)
				sim.distortion = min(55, 40+sim.config.NoiseLevel*5)
				sim.projectiles = sim.projectiles[:0]
				return
			}
		}
		kept = append(kept, bullet)
	}
	sim.projectiles = kept
}

func (sim *simulation) damagePlayer(amount int) {
	if sim.shield > 0 {
		absorbed := min(sim.shield, amount)
		sim.shield -= absorbed
		amount -= absorbed
		if absorbed > 0 && sim.config.Runtime.ReflectDamage > 0 {
			for index := range sim.enemies {
				if distanceSquared(sim.playerX, sim.playerY, sim.enemies[index].x, sim.enemies[index].y) < 800*800 {
					sim.enemies[index].health -= sim.config.Runtime.ReflectDamage
				}
			}
		}
	}
	if amount > 0 {
		sim.health -= amount
	}
}
