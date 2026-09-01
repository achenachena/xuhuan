package shooter

func (sim *simulation) updateWeapons() {
	sim.attackClock++
	if sim.attackClock < sim.runtime.fireInterval || len(sim.playerProjectiles) >= sim.config.Limits.PlayerProjectiles {
		return
	}
	sim.attackClock = 0
	sim.attackSequence++
	damage := sim.runtime.damage
	if sim.health == 1 {
		damage += sim.runtime.lowHealthPower
	}
	count := sim.runtime.multishot
	if sim.config.Kit.ID == KitJiaran && sim.combo >= 6 {
		damage += max(1, damage/4)
	}
	for index := 0; index < count && len(sim.playerProjectiles) < sim.config.Limits.PlayerProjectiles; index++ {
		lane := index*2 - (count - 1)
		// Twin shots are parallel barrels. Only the explicit wide-angle effect
		// adds a restrained outward velocity; the previous implementation used
		// the barrel offset as velocity and made both shots miss a centred boss.
		offset := lane * 34
		velocityX := 0
		if sim.runtime.spread > 0 {
			velocityX = lane * (5 + sim.runtime.spread*2)
		}
		sim.nextProjectileID++
		sim.playerProjectiles = append(sim.playerProjectiles, projectileEntity{id: sim.nextProjectileID, x: clamp(sim.playerX+offset, playerRadius, ArenaWidth-playerRadius), y: playerY, vx: velocityX, vy: -190, damage: damage, pierce: sim.runtime.pierce})
	}
	if sim.config.Kit.ID == KitBella && sim.attackSequence%3 == 0 {
		for _, velocity := range []Position{{X: -75, Y: -175}, {X: 75, Y: -175}} {
			if len(sim.playerProjectiles) >= sim.config.Limits.PlayerProjectiles {
				break
			}
			sim.nextProjectileID++
			sim.playerProjectiles = append(sim.playerProjectiles, projectileEntity{id: sim.nextProjectileID, x: sim.playerX, y: playerY, vx: velocity.X, vy: velocity.Y, damage: max(1, damage*3/4), pierce: sim.runtime.pierce})
		}
		sim.addEffect("cadence_volley", sim.playerX, playerY, 12, sim.attackSequence)
	}
	if sim.runtime.echoVolley > 0 && sim.tick%max(1, sim.runtime.fireInterval*max(2, 6-sim.runtime.echoVolley)) == 0 && len(sim.playerProjectiles) < sim.config.Limits.PlayerProjectiles {
		sim.nextProjectileID++
		sim.playerProjectiles = append(sim.playerProjectiles, projectileEntity{id: sim.nextProjectileID, x: sim.playerX, y: playerY + 220, vy: -155, damage: max(1, damage/2), pierce: sim.runtime.pierce})
	}
	if sim.config.Kit.ID == KitXiangwan && sim.attackClock == 0 && sim.tick%max(1, sim.runtime.fireInterval*4) == 0 && len(sim.playerProjectiles) < sim.config.Limits.PlayerProjectiles {
		sim.nextProjectileID++
		sim.playerProjectiles = append(sim.playerProjectiles, projectileEntity{id: sim.nextProjectileID, x: sim.playerX, y: playerY + 180, vy: -150, damage: max(1, damage/2), pierce: sim.runtime.pierce})
	}
}

func (sim *simulation) updateCompanions() {
	for index, companion := range sim.config.Companions {
		sim.companionClocks[index]++
		cooldown := companion.CooldownTicks
		if storyChoiceMode(sim.config.StoryChoiceID) == 2 {
			cooldown = cooldown * 3 / 4
		}
		if sim.companionClocks[index] < max(1, cooldown) || !sim.companionTriggered(companion.Trigger) {
			continue
		}
		sim.companionClocks[index] = 0
		amount := max(1, companion.Amount+sim.runtime.companionPower)
		if storyChoiceMode(sim.config.StoryChoiceID) == 1 {
			amount += max(1, amount/2)
		}
		sim.activateCompanion(index, companion.Behavior, amount)
		if sim.config.StoryChoiceID != "" {
			sim.addEffect("choice_assist", sim.playerX, playerY, 18, storyChoiceMode(sim.config.StoryChoiceID))
		}
		sim.earnRescue(sim.runtime.companionCharge)
	}
}

func (sim *simulation) companionTriggered(trigger string) bool {
	switch trigger {
	case "segment_start":
		return sim.tick == 1
	case "graze_streak":
		return sim.grazeCount > 0 && sim.grazeCount%5 == 0
	case "low_health":
		return sim.health == 1
	case "special_used":
		return sim.lastRescueTick == sim.tick-1
	case "boss_stage":
		// Boss phases update after companion processing in the previous Tick.
		return sim.bossPhaseTick == sim.tick-1
	case "pickup_chain":
		return sim.lastPickupTick == sim.tick-1 && sim.pickupsCollected%3 == 0
	case "wave_clear":
		return len(sim.enemies) == 0 && sim.tick > sim.config.DurationTicks/2
	default:
		return false
	}
}

func (sim *simulation) activateCompanion(index int, behavior string, amount int) {
	switch behavior {
	case "shield":
		sim.shield += amount
		return
	case "clear_lane":
		kept := sim.enemyProjectiles[:0]
		for _, bullet := range sim.enemyProjectiles {
			if abs(bullet.x-sim.playerX) > 220+amount*20 {
				kept = append(kept, bullet)
			}
		}
		sim.enemyProjectiles = kept
		return
	case "convert_bullet":
		converted := min(amount, len(sim.enemyProjectiles))
		for converted > 0 && len(sim.playerProjectiles) < sim.config.Limits.PlayerProjectiles {
			bullet := sim.enemyProjectiles[len(sim.enemyProjectiles)-1]
			sim.enemyProjectiles = sim.enemyProjectiles[:len(sim.enemyProjectiles)-1]
			sim.nextProjectileID++
			sim.playerProjectiles = append(sim.playerProjectiles, projectileEntity{id: sim.nextProjectileID, x: bullet.x, y: bullet.y, vy: -165, damage: max(1, amount)})
			converted--
		}
		return
	case "heal":
		sim.health = min(sim.runtime.maxHealth, sim.health+amount)
		return
	}
	if len(sim.playerProjectiles) >= sim.config.Limits.PlayerProjectiles {
		return
	}
	offset := -220
	if index&1 != 0 {
		offset = 220
	}
	count, damage := 1, amount
	if behavior == "echo_shot" {
		count = 2
	}
	if behavior == "focus_beam" {
		damage *= 2
	}
	for shot := 0; shot < count && len(sim.playerProjectiles) < sim.config.Limits.PlayerProjectiles; shot++ {
		sim.nextProjectileID++
		sim.playerProjectiles = append(sim.playerProjectiles, projectileEntity{id: sim.nextProjectileID, x: clamp(sim.playerX+offset, playerRadius, ArenaWidth-playerRadius), y: playerY + 80 + shot*80, vy: -165, damage: damage})
	}
}
