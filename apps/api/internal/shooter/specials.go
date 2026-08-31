package shooter

func (sim *simulation) activateRescue() {
	if sim.rescueCharge < RescueChargeLimit || sim.health <= 0 {
		return
	}
	sim.rescueCharge = 0
	sim.rescuesUsed++
	sim.lastRescueTick = sim.tick
	damage := sim.runtime.rescueDamage
	sim.shield += sim.runtime.guardOnSpecial
	behavior := sim.config.Kit.SpecialBehavior
	if behavior == "" {
		behavior = map[KitID]string{KitNana: "barrage_break", KitJiaran: "cheer_guard", KitXiangwan: "afterimage_replay", KitBella: "captain_parry", KitLulu: "subtitle_flip", KitXingtong: "prism_shift", KitNailu: "memory_bloom"}[sim.config.Kit.ID]
	}
	switch behavior {
	case "barrage_break":
		damage += sim.combo * 2
		for index := range sim.enemies {
			if sim.enemies[index].marks == 0 {
				continue
			}
			extra := sim.enemies[index].marks * max(4, damage/3)
			sim.enemies[index].health -= extra
			sim.addEffect("mark_detonation", sim.enemies[index].x, sim.enemies[index].y, 24, extra)
			sim.enemies[index].marks = 0
		}
	case "cheer_guard":
		sim.shield += 8
	case "afterimage_replay":
		damage += len(sim.enemyProjectiles) / 3
		for _, offset := range []int{-180, 0, 180} {
			if len(sim.playerProjectiles) >= sim.config.Limits.PlayerProjectiles {
				break
			}
			sim.nextProjectileID++
			sim.playerProjectiles = append(sim.playerProjectiles, projectileEntity{id: sim.nextProjectileID, x: clamp(sim.playerX+offset, playerRadius, ArenaWidth-playerRadius), y: playerY + 240, vy: -205, damage: max(1, sim.runtime.damage)})
		}
		sim.addEffect("afterimage_replay", sim.playerX, playerY, 36, damage)
	case "captain_parry":
		sim.shield += 18
		for _, vx := range []int{-140, -70, 0, 70, 140} {
			if len(sim.playerProjectiles) >= sim.config.Limits.PlayerProjectiles {
				break
			}
			sim.nextProjectileID++
			sim.playerProjectiles = append(sim.playerProjectiles, projectileEntity{id: sim.nextProjectileID, x: sim.playerX, y: playerY, vx: vx, vy: -190, damage: max(1, sim.runtime.damage)})
		}
		sim.addEffect("captain_parry", sim.playerX, playerY, 24, sim.shield)
	case "subtitle_flip":
		damage += len(sim.enemyProjectiles) / 2
		for len(sim.enemyProjectiles) > 0 && len(sim.playerProjectiles) < sim.config.Limits.PlayerProjectiles {
			bullet := sim.enemyProjectiles[len(sim.enemyProjectiles)-1]
			sim.enemyProjectiles = sim.enemyProjectiles[:len(sim.enemyProjectiles)-1]
			sim.nextProjectileID++
			sim.playerProjectiles = append(sim.playerProjectiles, projectileEntity{id: sim.nextProjectileID, x: bullet.x, y: bullet.y, vy: -190, damage: max(1, sim.runtime.damage/2), pierce: 1})
		}
		sim.addEffect("subtitle_flip", sim.playerX, playerY, 30, damage)
	case "prism_shift":
		damage += max(4, sim.runtime.damage)
		for index := range sim.enemies {
			if abs(sim.enemies[index].x-sim.playerX) <= 420 {
				sim.enemies[index].health -= damage
			}
		}
		sim.addEffect("prism_shift", sim.playerX, 0, 30, damage)
	case "memory_bloom":
		plants := sim.effects[:0]
		bloomed := 0
		for _, effect := range sim.effects {
			if effect.kind != "memory_plant" {
				plants = append(plants, effect)
				continue
			}
			bloomed++
			for index := range sim.enemies {
				if square(sim.enemies[index].x-effect.x)+square(sim.enemies[index].y-effect.y) <= square(720) {
					sim.enemies[index].health -= max(4, effect.power*2)
				}
			}
		}
		sim.effects = plants
		if bloomed > 0 {
			sim.health = min(sim.runtime.maxHealth, sim.health+1)
			sim.shield += bloomed
		}
		sim.addEffect("memory_bloom", sim.playerX, playerY, 45, bloomed)
	}
	for index := range sim.enemies {
		sim.enemies[index].health -= damage
	}
	sim.enemyProjectiles = sim.enemyProjectiles[:0]
	sim.combo += 3
	sim.comboClock = 120 + sim.runtime.comboExtend
	sim.score += 250
}

func (sim *simulation) earnRescue(amount int) {
	if amount <= 0 {
		return
	}
	// Encore content authors express this value as a penalty: positive values
	// must make Rescue slower, never faster. Keep at least one point for a
	// legitimate scoring event so low-value pickups still provide feedback.
	multiplier := 100 - sim.config.SpecialChargePenaltyPercent
	amount = max(1, amount*multiplier/100)
	sim.rescueCharge = min(RescueChargeLimit, sim.rescueCharge+amount)
}
