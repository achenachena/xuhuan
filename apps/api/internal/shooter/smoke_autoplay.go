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
	sim := newSimulation(config)
	controls := make([]uint8, 0, config.DurationTicks)
	previous := uint8(63)
	for range config.DurationTicks {
		control := smokeAutoplayX(sim, previous)
		if sim.rescueCharge >= RescueChargeLimit {
			control |= 0x80
		}
		sim.step(Input{X: control & 0x7f, Rescue: control&0x80 != 0})
		controls = append(controls, control)
		previous = control & 0x7f
	}
	won := sim.health > 0
	if config.Boss != nil {
		won = won && !smokeHasLivingBoss(sim.enemies)
	}
	trace := smokeEncodeControls(controls)
	if !won {
		livingBossHealth := 0
		for _, enemy := range sim.enemies {
			if enemy.boss && enemy.health > 0 {
				livingBossHealth += enemy.health
			}
		}
		return trace, fmt.Errorf("%w: health=%d boss_health=%d score=%d", ErrSmokeAutoplayFailed, sim.health, livingBossHealth, sim.score)
	}
	return trace, nil
}

func smokeAutoplayX(sim *simulation, previous uint8) uint8 {
	bestControl, bestScore := previous, int(^uint(0)>>1)
	bulletRisk, laneRisk, gapRisk, contactRisk := 2_000_000, 350_000, 500_000, 1_000_000
	if sim.config.Boss != nil {
		// The release driver has three hearts and deterministic post-hit
		// invulnerability. During a timed Boss, accept a bounded amount of risk
		// so weak-but-legal offered builds keep their firing lane long enough to
		// validate completion rather than merely surviving the timer.
		bulletRisk, laneRisk, gapRisk, contactRisk = 850_000, 160_000, 220_000, 500_000
	}
	for control := 3; control <= 124; control += 3 {
		x := smokeInputX(sim.config.Kit.MoveLimit, uint8(control))
		score := abs(control-int(previous)) * 4
		for _, bullet := range sim.enemyProjectiles {
			radius := max(bulletRadius, bullet.radius)
			for future := 0; future <= 54; future++ {
				bx, by := bullet.x+bullet.vx*future, bullet.y+bullet.vy*future
				if abs(by-playerY) > radius+playerRadius {
					continue
				}
				overlap := abs(bx-x) <= radius+playerRadius
				if bullet.width > 0 {
					overlap = abs(bx-x) <= bullet.width/2+playerRadius
				}
				if overlap {
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
		targetX, targetWeight := smokeAutoplayTarget(sim, x)
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

func smokeAutoplayTarget(sim *simulation, candidateX int) (int, int) {
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
			return predicted.x, 32
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

func smokeHasLivingBoss(enemies []enemyEntity) bool {
	for _, enemy := range enemies {
		if enemy.boss && enemy.health > 0 {
			return true
		}
	}
	return false
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
