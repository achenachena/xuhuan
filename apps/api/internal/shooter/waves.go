package shooter

import "slices"

func (sim *simulation) spawnWave() {
	for _, spawn := range sim.config.Wave.Spawns {
		count := max(1, spawn.Count)
		every := max(1, spawn.IntervalTicks)
		for occurrence := 0; occurrence < count; occurrence++ {
			if sim.tick-1 != spawn.AtTick+occurrence*every {
				continue
			}
			sim.spawnEnemy(spawn.EnemyID, formationX(spawn.Formation, occurrence, count, sim.tick))
		}
	}
	sim.spawnLatePressure()
}

// spawnLatePressure keeps a survival segment active after its authored opening
// formations have finished. The selected chassis and formation are derived
// only from the segment seed and cycle number, so Go replay and browser
// prediction can reproduce the same late-show pressure without more content
// payload. Boss segments never receive these reinforcements.
func (sim *simulation) spawnLatePressure() {
	if sim.config.Boss != nil || len(sim.config.Wave.Spawns) == 0 || len(sim.enemies) >= sim.config.Limits.Enemies {
		return
	}
	if len(sim.enemies) == 0 && len(sim.enemyProjectiles) == 0 {
		sim.pressureQuietTicks++
	} else {
		sim.pressureQuietTicks = 0
	}
	lastAuthoredTick := 0
	pool := make([]string, 0, len(sim.config.Wave.Spawns))
	for _, spawn := range sim.config.Wave.Spawns {
		lastAuthoredTick = max(lastAuthoredTick, spawn.AtTick+(max(1, spawn.Count)-1)*max(1, spawn.IntervalTicks))
		if !slices.Contains(pool, spawn.EnemyID) {
			pool = append(pool, spawn.EnemyID)
		}
	}
	start := lastAuthoredTick + 90
	interval := 120
	if sim.config.EncoreLevel >= 1 {
		interval = 105
	}
	elapsed := sim.tick - 1 - start
	finalTick := sim.config.DurationTicks - 90
	regularPulse := elapsed >= 0 && elapsed%interval == 0 && sim.tick-1 <= sim.config.DurationTicks-60
	lastRegular := start
	if finalTick > start {
		lastRegular = start + (finalTick-start)/interval*interval
	}
	finalPulse := sim.tick-1 == finalTick && finalTick != lastRegular
	emergencyPulse := sim.tick-1 > 30 && sim.pressureQuietTicks >= 90
	if !regularPulse && !finalPulse && !emergencyPulse {
		return
	}
	cycle := max(0, elapsed/interval)
	seedOffset := int(seedFromString(sim.config.Seed+":late-pressure") % uint32(len(pool)))
	enemyID := pool[(seedOffset+cycle)%len(pool)]
	formations := [...]string{"pincer", "sweep", "staggered", "fan"}
	formation := formations[(seedOffset+cycle)%len(formations)]
	count := 1
	if sim.config.EncoreLevel >= 1 && cycle&1 != 0 {
		count = 2
	}
	for index := 0; index < count && len(sim.enemies) < sim.config.Limits.Enemies; index++ {
		sim.spawnEnemy(enemyID, formationX(formation, index, count, sim.tick))
	}
	sim.pressureQuietTicks = 0
}

func formationX(formation string, index, count, tick int) int {
	center := ArenaWidth / 2
	step := 520
	switch formation {
	case "line":
		return center + (index*2-(count-1))*step/2
	case "fan":
		return center + (index*2-(count-1))*360/2
	case "staggered":
		return 520 + (index*760)%2560
	case "pincer":
		if index&1 == 0 {
			return 400 + (index/2)*220
		}
		return ArenaWidth - 400 - (index/2)*220
	case "center":
		return center + (index*2-(count-1))*180/2
	case "sweep":
		return 320 + ((tick*17 + index*540) % (ArenaWidth - 640))
	default:
		return center
	}
}

func (sim *simulation) spawnEnemy(specID string, authoredX int) {
	if len(sim.enemies) >= sim.config.Limits.Enemies {
		return
	}
	specIndex := -1
	for index, spec := range sim.config.Enemies {
		if spec.ID == specID {
			specIndex = index
			break
		}
	}
	if specIndex < 0 {
		return
	}
	x := authoredX
	if x <= 0 || x >= ArenaWidth {
		x = 320 + sim.random.intn(ArenaWidth-640)
	}
	x = clamp(x, enemyRadius, ArenaWidth-enemyRadius)
	spec := sim.config.Enemies[specIndex]
	// Encore changes formations and attack semantics; it deliberately does not
	// turn enemies into larger health bars.
	health := spec.Health
	sim.nextEnemyID++
	sim.enemies = append(sim.enemies, enemyEntity{id: sim.nextEnemyID, specIndex: specIndex, x: x, y: 500, health: health, maxHealth: health})
}
