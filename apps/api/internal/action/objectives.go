package action

func (sim *simulation) updateObjective() {
	switch sim.config.Objective.Kind {
	case "purge":
		sim.objectiveProgress = sim.kills
	case "stabilize":
		if sim.tick%TicksPerSecond == 0 && distanceSquared(sim.playerX, sim.playerY, ArenaWidth/2, ArenaHeight/2) <= 820*820 {
			sim.objectiveProgress++
		}
	case "holdout":
		sim.objectiveProgress = sim.tick
	case "elite":
		sim.objectiveProgress = sim.eliteKills
	case "boss":
		if sim.spawnIndex > 0 && len(sim.enemies) == 0 {
			sim.objectiveProgress = sim.config.Objective.Target
		}
	}
	if sim.config.Objective.Kind != "holdout" && sim.tick >= sim.config.DurationTicks && sim.objectiveProgress < sim.config.Objective.Target {
		// Non-survival encounters keep spawning until their objective is met or
		// the hard replay limit is reached.
		sim.score = max(0, sim.score-1)
	}
}

func (sim *simulation) objectiveComplete() bool {
	if sim.config.Kind == "tutorial" {
		return sim.routeWarpUsed
	}
	if sim.config.Objective.Target <= 0 {
		return sim.tick >= sim.config.DurationTicks
	}
	return sim.objectiveProgress >= sim.config.Objective.Target
}
