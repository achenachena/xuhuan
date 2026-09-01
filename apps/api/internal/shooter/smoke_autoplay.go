//go:build smoke

package shooter

import (
	"errors"
	"fmt"
)

// ErrSmokeAutoplayFailed means the deterministic CI driver could not clear
// the supplied authoritative segment. It is intentionally available only to
// smoke builds and is never linked into the API or Lambda binaries.
var ErrSmokeAutoplayFailed = errors.New("shooter: smoke autoplay did not clear the segment")

// BuildSmokeTrace drives the same private fixed-step simulation that validates
// player traces. Production smoke tests use it to exercise real authority
// without adding an endpoint, credential, token, or alternate game rule.
func BuildSmokeTrace(config Config) (InputTrace, error) {
	if err := normalizeConfig(&config); err != nil {
		return InputTrace{}, err
	}
	profiles := smokeAutoplayProfiles[:1]
	if config.Boss != nil {
		profiles = smokeAutoplayProfiles[:]
	}
	bestBossHealth, bestHealth, bestScore := int(^uint(0)>>1), 0, 0
	bestAlive := false
	var bestTrace InputTrace
	for _, profile := range profiles {
		trace, sim := buildSmokeTrace(config, profile)
		bossHealth := smokeLivingBossHealth(sim.enemies)
		alive := sim.health > 0
		if alive && bossHealth == 0 {
			return trace, nil
		}
		betterFailure := alive && !bestAlive
		if alive == bestAlive && (bossHealth < bestBossHealth || bossHealth == bestBossHealth && sim.health > bestHealth) {
			betterFailure = true
		}
		if betterFailure {
			bestTrace, bestBossHealth, bestHealth, bestScore = trace, bossHealth, sim.health, sim.score
			bestAlive = alive
		}
	}
	return bestTrace, fmt.Errorf("%w: health=%d boss_health=%d score=%d", ErrSmokeAutoplayFailed, bestHealth, bestBossHealth, bestScore)
}

type smokeAutoplayProfile struct {
	bulletRisk, laneRisk, gapRisk, contactRisk int
	bulletPredictionTicks, bossTargetWeight    int
}

var smokeAutoplayProfiles = [...]smokeAutoplayProfile{
	// These are deterministic path-search policies, not alternate game rules.
	// Each generated trace must still clear the unchanged authority simulation.
	// Start conservatively, then trade more of the three-heart hit budget for
	// firing alignment when a legal low-damage build needs it.
	{bulletRisk: 850_000, laneRisk: 160_000, gapRisk: 220_000, contactRisk: 500_000, bulletPredictionTicks: 54, bossTargetWeight: 32},
	{bulletRisk: 240_000, laneRisk: 90_000, gapRisk: 130_000, contactRisk: 420_000, bulletPredictionTicks: 24, bossTargetWeight: 72},
	{bulletRisk: 80_000, laneRisk: 35_000, gapRisk: 55_000, contactRisk: 300_000, bulletPredictionTicks: 14, bossTargetWeight: 120},
	{bulletRisk: 25_000, laneRisk: 12_000, gapRisk: 20_000, contactRisk: 220_000, bulletPredictionTicks: 8, bossTargetWeight: 180},
}

func buildSmokeTrace(config Config, profile smokeAutoplayProfile) (InputTrace, *simulation) {
	sim := newSimulation(config)
	controls := make([]uint8, 0, config.DurationTicks)
	previous := uint8(63)
	for range config.DurationTicks {
		control := smokeAutoplayX(sim, previous, profile)
		if sim.rescueCharge >= RescueChargeLimit {
			control |= 0x80
		}
		sim.step(Input{X: control & 0x7f, Rescue: control&0x80 != 0})
		controls = append(controls, control)
		previous = control & 0x7f
	}
	return smokeEncodeControls(controls), sim
}

func smokeAutoplayX(sim *simulation, previous uint8, profile smokeAutoplayProfile) uint8 {
	bestControl, bestScore := previous, int(^uint(0)>>1)
	bulletRisk, laneRisk, gapRisk, contactRisk := 2_000_000, 350_000, 500_000, 1_000_000
	bulletPredictionTicks := 54
	if sim.config.Boss != nil {
		bulletRisk, laneRisk, gapRisk, contactRisk = profile.bulletRisk, profile.laneRisk, profile.gapRisk, profile.contactRisk
		bulletPredictionTicks = profile.bulletPredictionTicks
		if sim.health <= 1 && sim.shield == 0 {
			bulletRisk, laneRisk, gapRisk, contactRisk = 900_000, 190_000, 260_000, 600_000
			bulletPredictionTicks = 42
		}
	}
	for control := 3; control <= 124; control += 3 {
		x := smokeInputX(sim.config.Kit.MoveLimit, uint8(control))
		score := abs(control-int(previous)) * 4
		for _, bullet := range sim.enemyProjectiles {
			radius := max(bulletRadius, bullet.radius)
			for future := 0; future <= bulletPredictionTicks; future++ {
				bx, by := bullet.x+bullet.vx*future, bullet.y+bullet.vy*future
				if abs(by-playerY) > radius+playerRadius {
					continue
				}
				overlap := abs(bx-x) <= radius+playerRadius
				if bullet.width > 0 {
					overlap = abs(bx-x) <= bullet.width/2+playerRadius
				}
				if overlap {
					// A collision that resolves inside the active post-hit window cannot
					// consume another heart and must not be counted as a second risk.
					if future < sim.invulnerableTicks {
						break
					}
					score += bulletRisk - future*min(20_000, bulletRisk/60)
					break
				}
			}
		}
		for _, threat := range sim.threatSnapshots() {
			if threat.TicksRemaining > 18 {
				continue
			}
			if threat.Kind == "censor_gap" {
				if abs(x-threat.Target.X) > max(130, threat.Width/2) {
					score += gapRisk
				}
				continue
			}
			width := max(180, threat.Width)
			if abs(x-threat.Target.X) <= width/2+playerRadius {
				score += laneRisk
			}
		}
		for _, enemy := range sim.enemies {
			if enemy.health > 0 && enemy.y > playerY-700 && abs(enemy.x-x) < enemyRadius+playerRadius {
				score += contactRisk
			}
		}
		targetX, targetWeight := smokeAutoplayTarget(sim, x, profile.bossTargetWeight)
		score += abs(x-targetX) * targetWeight
		if sim.config.Kit.ID == KitXingtong {
			for _, enemy := range sim.enemies {
				if enemy.health > 0 && (enemy.boss || enemy.y > playerY-1000) {
					score += abs(x-enemy.x) * 96
					break
				}
			}
		}
		if score < bestScore {
			bestControl, bestScore = uint8(control), score
		}
	}
	return bestControl
}

func smokeAutoplayTarget(sim *simulation, candidateX, bossTargetWeight int) (int, int) {
	for _, pickup := range sim.pickups {
		if pickup.y >= playerY-1100 {
			return pickup.x, 8
		}
	}
	targetX, targetY := ArenaWidth/2, -1
	for _, enemy := range sim.enemies {
		if enemy.boss && enemy.health > 0 && sim.config.Boss != nil {
			predicted := enemy
			stage := sim.config.Boss.Stages[clamp(enemy.phase-1, 0, len(sim.config.Boss.Stages)-1)]
			flightTicks := max(1, (playerY-enemy.y)/190)
			if sim.config.Boss.ID == BossAutoArchiveSystem {
				flightTicks = max(1, flightTicks-1)
			}
			for future := 1; future <= flightTicks; future++ {
				moveBoss(&predicted, sim.config.Boss.ID, stage.MovePattern, sim.tick+future, candidateX)
			}
			// Production validation must still finish the authored Boss within its
			// exact window. Keep firing alignment meaningful after avoiding any
			// imminent lethal lane.
			return predicted.x, bossTargetWeight
		}
		if enemy.health > 0 && (enemy.boss || enemy.y > targetY) {
			targetX, targetY = enemy.x, enemy.y
		}
	}
	return targetX, 2
}

func smokeInputX(moveLimit int, control uint8) int {
	if moveLimit <= 0 || moveLimit > ArenaWidth/2-playerRadius {
		moveLimit = ArenaWidth/2 - playerRadius
	}
	return ArenaWidth/2 - moveLimit + int(control)*(moveLimit*2)/127
}

func smokeLivingBossHealth(enemies []enemyEntity) int {
	health := 0
	for _, enemy := range enemies {
		if enemy.boss && enemy.health > 0 {
			health += enemy.health
		}
	}
	return health
}

func smokeEncodeControls(controls []uint8) InputTrace {
	runs := make([]TraceRun, 0, len(controls)/8)
	for index := 0; index < len(controls); {
		count := 1
		for index+count < len(controls) && controls[index+count] == controls[index] && count < 255 {
			count++
		}
		runs = append(runs, TraceRun{controls[index], uint8(count)})
		index += count
	}
	return InputTrace{Encoding: TraceEncoding, Ticks: len(controls), Runs: runs}
}
