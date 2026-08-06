package battle

import (
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"fmt"
	"math"

	"github.com/achenachena/xuhuan/apps/api/internal/character"
)

var (
	ErrInvalidAction       = errors.New("battle: invalid action")
	ErrInsufficientMeter   = errors.New("battle: insufficient special meter")
	ErrBattleNotActive     = errors.New("battle: battle is not active")
	ErrVersionConflict     = errors.New("battle: expected version conflict")
	ErrInsufficientEnergy  = errors.New("battle: insufficient energy")
	ErrIdempotencyConflict = errors.New("battle: idempotency key reused with different request")
)

const (
	EnergyCost            = 10
	damageVariationMin    = 0.85
	damageVariationSpan   = 0.30
	defenseWeight         = 0.60
	criticalBase          = 1.50
	minimumDamage         = 1
	lightMultiplier       = 0.80
	heavyMultiplier       = 1.50
	specialMultiplier     = 2.20
	counterMultiplier     = 1.80
	blockDamageMultiplier = 0.30
	specialMeterCost      = 50
	meterGainOnHit        = 15
	meterGainOnDamage     = 10
)

type randomStream struct {
	seed   string
	cursor uint64
}

func (r *randomStream) Float64() float64 {
	input := make([]byte, len(r.seed)+8)
	copy(input, r.seed)
	binary.BigEndian.PutUint64(input[len(r.seed):], r.cursor)
	digest := sha256.Sum256(input)
	r.cursor++
	value := binary.BigEndian.Uint64(digest[:8]) >> 11
	return float64(value) / float64(uint64(1)<<53)
}

func NewState(hero character.Character, encounter character.Encounter, playerLevel int) State {
	if playerLevel < 1 {
		playerLevel = 1
	}
	scale := func(value int) int {
		return int(math.Round(float64(value) * (1 + float64(playerLevel-1)*0.15)))
	}
	heroHealth := scale(hero.BaseHealth)
	return State{
		Turn: 1,
		Hero: Combatant{
			Slug: hero.Slug, Name: hero.Name.ZHCN, Level: playerLevel, MaxHealth: heroHealth,
			CurrentHealth: heroHealth, Attack: scale(hero.BaseAttack), Defense: scale(hero.BaseDefense),
			Speed: scale(hero.BaseSpeed), CritRate: hero.BaseCritRate, CritDamage: hero.BaseCritDamage,
		},
		Enemy: Combatant{
			Slug: encounter.Slug, Name: encounter.Name.ZHCN, Level: encounter.Level,
			MaxHealth: encounter.MaxHealth, CurrentHealth: encounter.MaxHealth, Attack: encounter.Attack,
			Defense: encounter.Defense, Speed: encounter.Speed, CritRate: encounter.CritRate, CritDamage: encounter.CritDamage,
		},
	}
}

func ResolveTurn(current State, seed string, action ActionKind, encounterLevel int) (State, ActionResult, *Outcome, *Reward, error) {
	if !validAction(action) {
		return State{}, ActionResult{}, nil, nil, ErrInvalidAction
	}
	if action == SpecialMove && current.Hero.SpecialMeter < specialMeterCost {
		return State{}, ActionResult{}, nil, nil, ErrInsufficientMeter
	}
	stream := &randomStream{seed: seed, cursor: current.RNGCursor}
	next := current
	events := make([]Event, 0, 2)

	switch action {
	case Block:
		next.Hero.IsBlocking = true
		events = append(events, Event{Actor: "hero", Action: Block, Description: "Hero blocks"})
	case Counter:
		events = append(events, Event{Actor: "hero", Action: Counter, Description: "Hero prepares a counter"})
	default:
		damage := calculateDamage(next.Hero, next.Enemy, stream, action, false)
		next.Enemy = applyDamage(next.Enemy, damage, meterGainOnDamage)
		if action == SpecialMove {
			next.Hero.SpecialMeter = clampMeter(next.Hero.SpecialMeter - specialMeterCost)
		} else {
			next.Hero.SpecialMeter = clampMeter(next.Hero.SpecialMeter + meterGainOnHit)
		}
		next.Hero.ComboCount++
		events = append(events, Event{Actor: "hero", Action: action, Damage: &damage, Description: describeDamage("Hero", action, damage)})
	}

	if next.Enemy.CurrentHealth <= 0 {
		outcome := Victory
		reward := calculateReward(encounterLevel, outcome)
		next.RNGCursor = stream.cursor
		return next, ActionResult{Sequence: current.Turn, Events: events}, &outcome, &reward, nil
	}

	enemyAction := LightAttack
	if stream.Float64() > 0.60 {
		enemyAction = HeavyAttack
	}

	if action == Counter && stream.Float64() < 0.50 {
		damage := calculateDamage(next.Hero, next.Enemy, stream, LightAttack, true)
		damage.Countered = true
		next.Enemy = applyDamage(next.Enemy, damage, meterGainOnDamage)
		next.Hero.SpecialMeter = clampMeter(next.Hero.SpecialMeter + meterGainOnHit)
		next.Hero.ComboCount++
		events[0].Damage = &damage
		events[0].Description = describeDamage("Hero", Counter, damage)
	} else {
		damage := calculateDamage(next.Enemy, next.Hero, stream, enemyAction, false)
		next.Hero = applyDamage(next.Hero, damage, meterGainOnDamage)
		next.Enemy.SpecialMeter = clampMeter(next.Enemy.SpecialMeter + meterGainOnHit)
		next.Enemy.ComboCount++
		events = append(events, Event{Actor: "enemy", Action: enemyAction, Damage: &damage, Description: describeDamage("Enemy", enemyAction, damage)})
	}

	next.Turn++
	next.RNGCursor = stream.cursor
	if next.Enemy.CurrentHealth <= 0 {
		outcome := Victory
		reward := calculateReward(encounterLevel, outcome)
		return next, ActionResult{Sequence: current.Turn, Events: events}, &outcome, &reward, nil
	}
	if next.Hero.CurrentHealth <= 0 {
		outcome := Defeat
		reward := calculateReward(encounterLevel, outcome)
		return next, ActionResult{Sequence: current.Turn, Events: events}, &outcome, &reward, nil
	}
	return next, ActionResult{Sequence: current.Turn, Events: events}, nil, nil, nil
}

func validAction(action ActionKind) bool {
	switch action {
	case LightAttack, HeavyAttack, SpecialMove, Block, Counter:
		return true
	default:
		return false
	}
}

func calculateDamage(attacker, defender Combatant, stream *randomStream, action ActionKind, countered bool) DamageResult {
	multiplier := lightMultiplier
	switch action {
	case HeavyAttack:
		multiplier = heavyMultiplier
	case SpecialMove:
		multiplier = specialMultiplier
	}
	if countered {
		multiplier *= counterMultiplier
	}
	variation := damageVariationMin + stream.Float64()*damageVariationSpan
	raw := math.Max(minimumDamage, (float64(attacker.Attack)*multiplier-float64(defender.Defense)*defenseWeight)*variation)
	critical := stream.Float64() < attacker.CritRate
	if critical {
		raw *= criticalBase + attacker.CritDamage
	}
	blocked := defender.IsBlocking && action != SpecialMove
	if blocked {
		raw *= blockDamageMultiplier
	}
	return DamageResult{
		Amount: max(minimumDamage, int(math.Round(raw))), Critical: critical, Blocked: blocked, Countered: countered,
	}
}

func applyDamage(target Combatant, damage DamageResult, meterGain int) Combatant {
	target.CurrentHealth = max(0, target.CurrentHealth-damage.Amount)
	target.SpecialMeter = clampMeter(target.SpecialMeter + meterGain)
	if !damage.Blocked {
		target.ComboCount = 0
	}
	target.IsBlocking = false
	return target
}

func clampMeter(value int) int {
	return min(100, max(0, value))
}

func calculateReward(encounterLevel int, outcome Outcome) Reward {
	reward := Reward{Energy: -EnergyCost}
	if outcome == Victory {
		reward.Experience = int64(encounterLevel * 18)
		reward.Credits = int64(encounterLevel * 12)
	}
	return reward
}

func describeDamage(actor string, action ActionKind, damage DamageResult) string {
	return fmt.Sprintf("%s used %s for %d damage", actor, action, damage.Amount)
}
