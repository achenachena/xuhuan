package action

const (
	authenticBossTelegraph = 20
	retainedBossTelegraph  = 16
	balancedBossTelegraph  = 12
)

func bossPhase(health, maxHealth int) int {
	if health*3 > maxHealth*2 {
		return 1
	}
	if health*3 > maxHealth {
		return 2
	}
	return 3
}

// bossVariantAttack resolves story projection into an authored attack. The
// variants change pattern composition and readable timing, never health.
func bossVariantAttack(enemy enemyEntity, spec EnemySpec, variant string) AttackSpec {
	phase := bossPhase(enemy.health, maximumHealth(enemy, spec))
	index := bossVariantAttackIndex(phase, enemy.attackIndex, len(spec.Attacks), variant)
	attack := spec.Attacks[index]

	minimumTelegraph := 0
	if attack.Damage >= 8 {
		minimumTelegraph = balancedBossTelegraph
	}
	switch variant {
	case "authentic":
		attack.Interval += 6
		attack.TelegraphTicks = max(attack.TelegraphTicks, authenticBossTelegraph)
		switch attack.Kind {
		case "ring", "spiral":
			attack.Count = max(4, attack.Count-2)
		case "fan":
			attack.Spread = max(2, attack.Spread-1)
		}
	case "retained":
		attack.Interval = max(20, attack.Interval-3)
		attack.TelegraphTicks = max(attack.TelegraphTicks, retainedBossTelegraph)
		switch attack.Kind {
		case "ring", "spiral":
			attack.Count = min(16, max(8, attack.Count*2))
		case "fan":
			attack.Spread = max(6, attack.Spread+2)
		case "aimed":
			attack.Kind = "delayed_echo"
			attack.TelegraphTicks = max(attack.TelegraphTicks, authenticBossTelegraph)
		}
	default:
		attack.TelegraphTicks = max(attack.TelegraphTicks, minimumTelegraph)
	}
	return attack
}

func bossVariantAttackIndex(phase, attackIndex, attackCount int, variant string) int {
	if attackCount <= 1 {
		return 0
	}
	switch variant {
	case "authentic":
		switch phase {
		case 1:
			return 0
		case 2:
			return attackIndex % min(2, attackCount)
		default:
			return attackIndex % attackCount
		}
	case "retained":
		switch phase {
		case 1:
			return attackCount - 1
		case 2:
			return 1 + attackIndex%(attackCount-1)
		default:
			return attackCount - 1 - attackIndex%attackCount
		}
	default:
		index := min(phase-1, attackCount-1)
		if phase == 3 && attackCount > 3 {
			index = 2 + attackIndex%(attackCount-2)
		}
		return index
	}
}

func (sim *simulation) bossMimic() string {
	route := max(0, sim.config.Runtime.WarpDamage-14)*2 + sim.config.Runtime.HealOnProtocol*5 + max(0, 240-sim.config.Runtime.WarpCooldown)/5
	distortion := sim.config.Runtime.OverloadBonus + max(0, sim.config.Runtime.DistortionGain-4)*8
	echo := sim.config.Runtime.StartingShield*3 + sim.config.Runtime.ReflectDamage*6
	if distortion > route && distortion >= echo {
		return "distortion"
	}
	if echo > route && echo > distortion {
		return "echo"
	}
	return "route"
}
