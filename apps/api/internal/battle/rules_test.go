package battle

import (
	"errors"
	"fmt"
	"reflect"
	"testing"

	"github.com/achenachena/xuhuan/apps/api/internal/character"
)

func testCharacter() character.Character {
	return character.Character{
		Slug: "hero", Name: character.LocalizedText{ZHCN: "英雄"},
		BaseHealth: 100, BaseAttack: 28, BaseDefense: 22, BaseSpeed: 18,
		BaseCritRate: .12, BaseCritDamage: .45,
	}
}

func testEncounter() character.Encounter {
	return character.Encounter{
		Slug: "enemy", Name: character.LocalizedText{ZHCN: "敌人"}, Level: 2,
		MaxHealth: 90, Attack: 22, Defense: 18, Speed: 12, CritRate: .08, CritDamage: .35,
	}
}

func TestNewStateScalesHeroFromPlayerLevel(t *testing.T) {
	t.Parallel()
	state := NewState(testCharacter(), testEncounter(), 3)
	if state.Hero.MaxHealth != 130 || state.Hero.Attack != 36 || state.Enemy.MaxHealth != 90 || state.Turn != 1 {
		t.Fatalf("state = %#v", state)
	}
}

func TestDamageBoundsCriticalAndBlock(t *testing.T) {
	t.Parallel()
	attacker := Combatant{Attack: 28, CritRate: 0, CritDamage: .45}
	defender := Combatant{Defense: 18, MaxHealth: 100, CurrentHealth: 100}
	for index := range 100 {
		stream := &randomStream{seed: fmt.Sprintf("bounds-%d", index)}
		damage := calculateDamage(attacker, defender, stream, LightAttack, false)
		if damage.Amount < 9 || damage.Amount > 14 || damage.Critical {
			t.Fatalf("damage out of bounds: %#v", damage)
		}
	}

	criticalAttacker := attacker
	criticalAttacker.CritRate = 1
	critical := calculateDamage(criticalAttacker, defender, &randomStream{seed: "critical"}, HeavyAttack, false)
	if !critical.Critical {
		t.Fatal("guaranteed critical hit was not critical")
	}

	unblocked := calculateDamage(attacker, defender, &randomStream{seed: "blocked"}, HeavyAttack, false)
	defender.IsBlocking = true
	blocked := calculateDamage(attacker, defender, &randomStream{seed: "blocked"}, HeavyAttack, false)
	if !blocked.Blocked || blocked.Amount >= unblocked.Amount {
		t.Fatalf("unblocked=%#v blocked=%#v", unblocked, blocked)
	}
	special := calculateDamage(attacker, defender, &randomStream{seed: "blocked"}, SpecialMove, false)
	if special.Blocked {
		t.Fatal("special move did not break block")
	}
}

func TestResolveTurnValidatesActionsAndSpecialMeter(t *testing.T) {
	t.Parallel()
	state := NewState(testCharacter(), testEncounter(), 1)
	if _, _, _, _, err := ResolveTurn(state, "seed", ActionKind("cheat"), 2); !errors.Is(err, ErrInvalidAction) {
		t.Fatalf("invalid action error = %v", err)
	}
	if _, _, _, _, err := ResolveTurn(state, "seed", SpecialMove, 2); !errors.Is(err, ErrInsufficientMeter) {
		t.Fatalf("special move error = %v", err)
	}
	state.Hero.SpecialMeter = specialMeterCost
	next, _, _, _, err := ResolveTurn(state, "seed", SpecialMove, 2)
	if err != nil || next.Hero.SpecialMeter != meterGainOnDamage {
		t.Fatalf("special next=%#v error=%v", next.Hero, err)
	}
}

func TestBlockReducesEnemyDamageAndEnemyActionsVary(t *testing.T) {
	t.Parallel()
	state := NewState(testCharacter(), testEncounter(), 1)
	seen := map[ActionKind]bool{}
	for index := range 200 {
		next, result, _, _, err := ResolveTurn(state, fmt.Sprintf("enemy-%d", index), Block, 2)
		if err != nil {
			t.Fatal(err)
		}
		if len(result.Events) != 2 || result.Events[1].Damage == nil || !result.Events[1].Damage.Blocked {
			t.Fatalf("block result = %#v", result)
		}
		if next.Hero.IsBlocking {
			t.Fatal("block was not consumed by enemy response")
		}
		seen[result.Events[1].Action] = true
	}
	if !seen[LightAttack] || !seen[HeavyAttack] {
		t.Fatalf("enemy actions seen = %#v", seen)
	}
}

func TestCounterCanSucceedAndFailDeterministically(t *testing.T) {
	t.Parallel()
	state := NewState(testCharacter(), testEncounter(), 1)
	var success, failure bool
	for index := range 500 {
		next, result, _, _, err := ResolveTurn(state, fmt.Sprintf("counter-%d", index), Counter, 2)
		if err != nil {
			t.Fatal(err)
		}
		if result.Events[0].Damage != nil && result.Events[0].Damage.Countered {
			success = true
			if next.Hero.CurrentHealth != state.Hero.CurrentHealth || next.Enemy.CurrentHealth >= state.Enemy.CurrentHealth {
				t.Fatalf("successful counter state = %#v", next)
			}
		} else if len(result.Events) == 2 {
			failure = true
			if next.Hero.CurrentHealth >= state.Hero.CurrentHealth {
				t.Fatalf("failed counter state = %#v", next)
			}
		}
		if success && failure {
			break
		}
	}
	if !success || !failure {
		t.Fatalf("success=%t failure=%t", success, failure)
	}
}

func TestVictoryDefeatRewardsAndStateTransitions(t *testing.T) {
	t.Parallel()

	victoryState := NewState(testCharacter(), testEncounter(), 1)
	victoryState.Enemy.CurrentHealth = 1
	next, result, outcome, reward, err := ResolveTurn(victoryState, "victory", LightAttack, 2)
	if err != nil || outcome == nil || *outcome != Victory || reward == nil || reward.Experience != 36 || reward.Credits != 24 || reward.Energy != -EnergyCost {
		t.Fatalf("victory next=%#v result=%#v outcome=%v reward=%#v error=%v", next, result, outcome, reward, err)
	}

	defeatState := NewState(testCharacter(), testEncounter(), 1)
	defeatState.Hero.CurrentHealth = 1
	for index := range 200 {
		next, _, outcome, reward, err := ResolveTurn(defeatState, fmt.Sprintf("defeat-%d", index), Block, 2)
		if err != nil {
			t.Fatal(err)
		}
		if outcome != nil && *outcome == Defeat {
			if next.Hero.CurrentHealth != 0 || reward == nil || reward.Experience != 0 || reward.Credits != 0 {
				t.Fatalf("defeat next=%#v reward=%#v", next, reward)
			}
			return
		}
	}
	t.Fatal("no deterministic defeat found")
}

func TestSameSeedAndStateProduceSameResolution(t *testing.T) {
	t.Parallel()
	state := NewState(testCharacter(), testEncounter(), 1)
	firstState, firstResult, firstOutcome, firstReward, firstErr := ResolveTurn(state, "repeatable", HeavyAttack, 2)
	secondState, secondResult, secondOutcome, secondReward, secondErr := ResolveTurn(state, "repeatable", HeavyAttack, 2)
	if firstErr != nil || secondErr != nil || !reflect.DeepEqual(firstState, secondState) ||
		!reflect.DeepEqual(firstResult, secondResult) || !reflect.DeepEqual(firstOutcome, secondOutcome) || !reflect.DeepEqual(firstReward, secondReward) {
		t.Fatalf("resolutions differ")
	}
}
