package action

func (sim *simulation) collectSignals() {
	pattern := routePatterns[sim.routePattern%len(routePatterns)]
	for index, position := range pattern {
		if sim.signalCooldown[index] > 0 || distanceSquared(sim.playerX, sim.playerY, position.X, position.Y) > (playerRadius+beaconRadius)*(playerRadius+beaconRadius) {
			continue
		}
		sim.collectSignal(index, position)
		return
	}
}

func (sim *simulation) collectSignal(index int, position Vec) {
	signalTypes := [...]SignalType{SurgeSignal, GuardSignal, EchoSignal}
	protocolLocked := sim.routeReady
	sim.signalCooldown[index] = 45
	sim.signalPulse = 18
	sim.lastSignal = signalTypes[index]
	sim.lastSignalTick = sim.tick
	if !protocolLocked {
		sim.weave = append(sim.weave, signalTypes[index])
		sim.routeStep = len(sim.weave)
		if sim.config.Runtime.Passive == "nana_route_chain" {
			sim.signalWaypoints = append(sim.signalWaypoints, position)
		}
	}
	if sim.config.Runtime.Passive == "nailu_memory_bloom" {
		sim.plantBloom(position)
	}
	if sim.config.Objective.Kind == "recover" {
		sim.objectiveProgress++
	}
	kept := sim.projectiles[:0]
	for _, bullet := range sim.projectiles {
		if distanceSquared(position.X, position.Y, bullet.x, bullet.y) > 720*720 {
			kept = append(kept, bullet)
		}
	}
	sim.projectiles = kept
	for enemyIndex := range sim.enemies {
		if distanceSquared(position.X, position.Y, sim.enemies[enemyIndex].x, sim.enemies[enemyIndex].y) <= 620*620 {
			sim.enemies[enemyIndex].health -= max(2, sim.config.Runtime.AttackDamage/2)
		}
	}
	if !protocolLocked && len(sim.weave) == 3 {
		sim.protocol = weaveProtocol(sim.weave)
		sim.protocols++
		sim.onProtocolComplete()
		sim.routes = sim.protocols
		sim.routeReady = true
		sim.warpClock = 0
		sim.warpReadyTick = sim.tick
		if sim.config.Runtime.HealOnProtocol > 0 {
			sim.health = min(sim.config.PlayerMaxHealth, sim.health+sim.config.Runtime.HealOnProtocol)
		}
	}
}

func weaveProtocol(weave []SignalType) Protocol {
	counts := map[SignalType]int{}
	for _, signal := range weave {
		counts[signal]++
	}
	if counts[SurgeSignal] == 1 && counts[GuardSignal] == 1 && counts[EchoSignal] == 1 {
		return ResonanceProtocol
	}
	if counts[SurgeSignal] >= 2 {
		return SurgeBreak
	}
	if counts[GuardSignal] >= 2 {
		return GuardAegis
	}
	return EchoReplay
}

func (sim *simulation) activateProtocol(startX, startY, endX, endY int) {
	sim.score += 250
	switch sim.protocol {
	case SurgeBreak:
		damage := max(18, sim.config.Runtime.WarpDamage+sim.config.Runtime.ProtocolDamage)
		for index := range sim.enemies {
			if nearTravelPath(sim.enemies[index].x, sim.enemies[index].y, startX, startY, (startX+endX)/2, (startY+endY)/2, endX, endY, 900) {
				sim.enemies[index].health -= damage
			}
		}
	case GuardAegis:
		sim.shield += max(8, 12+sim.config.Runtime.ProtocolShield)
		sim.projectiles = sim.projectiles[:0]
		sim.invulnerable = max(sim.invulnerable, 24)
	case EchoReplay:
		damage := max(10, sim.config.Runtime.WarpDamage/2+sim.config.Runtime.EchoPower)
		for index := range sim.enemies {
			if nearTravelPath(sim.enemies[index].x, sim.enemies[index].y, startX, startY, (startX+endX)/2, (startY+endY)/2, endX, endY, 700) {
				sim.enemies[index].health -= damage
			}
		}
	case ResonanceProtocol:
		sim.activateResonance()
	}
}

func (sim *simulation) activateResonance() {
	power := max(12, 18+sim.config.Runtime.ResonancePower)
	switch sim.config.Runtime.Resonance {
	case "diana_cheer_pulse":
		sim.shield += power / 2
		for index := range sim.enemies {
			sim.enemies[index].health -= power
		}
	case "nana_route_chain":
		sim.detonateNanaWaypoints(power)
	case "ava_afterimage":
		sim.empowerLatestAvaReplay(power)
	case "bella_perfect_warp":
		sim.shield += power
		sim.invulnerable = max(sim.invulnerable, 30)
	case "lulu_convert_projectiles":
		sim.markAllProjectiles()
	case "xingtong_signal_stance":
		for index := range sim.enemies {
			sim.enemies[index].health -= power + index%3
		}
	case "nailu_memory_bloom":
		sim.health = min(sim.config.PlayerMaxHealth, sim.health+power/3)
		sim.plantBloom(Vec{X: sim.playerX, Y: sim.playerY})
	default:
		for index := range sim.enemies {
			sim.enemies[index].health -= power
		}
	}
}

func (sim *simulation) collectBeacon() {
	index := len(sim.weave) % 3
	sim.collectSignal(index, sim.activeBeacon())
}

func (sim *simulation) activeBeacon() Vec {
	pattern := routePatterns[sim.routePattern%len(routePatterns)]
	return pattern[len(sim.weave)%3]
}
