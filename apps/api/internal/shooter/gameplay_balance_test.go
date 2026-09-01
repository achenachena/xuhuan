package shooter

import (
	"reflect"
	"testing"

	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
)

// TestCampaignBalanceWithDeterministicHorizontalPlay is intentionally an
// executable balance contract rather than a reduced fixture. It loads all
// authored chapters, uses only the public left/right + Rescue inputs, and then
// replays the resulting trace through Simulate to prove the authority accepts
// the same beatable path.
func TestCampaignBalanceWithDeterministicHorizontalPlay(t *testing.T) {
	catalog := gamecontent.MustLoadV4()
	for _, chapter := range catalog.Chapters {
		chapter := chapter
		t.Run(chapter.ID, func(t *testing.T) {
			for segmentIndex := 0; segmentIndex < 4; segmentIndex++ {
				config := authoredBalanceConfig(t, catalog, chapter, segmentIndex)
				trace, direct := deterministicAutoplay(config)
				replayed, err := Simulate(config, trace)
				if err != nil {
					t.Fatalf("segment %d replay: %v", segmentIndex+1, err)
				}
				if !reflect.DeepEqual(direct, replayed) {
					t.Fatalf("segment %d direct/replay authority drift", segmentIndex+1)
				}
				if !replayed.Won {
					t.Fatalf("segment %d is not beatable by deterministic horizontal play: health=%d kills=%d score=%d enemies=%#v", segmentIndex+1, replayed.Health, replayed.Kills, replayed.Score, replayed.Final.Enemies)
				}
			}
		})
	}
}

func TestTutorialFillsAndUsesRescueWithinThirtySeconds(t *testing.T) {
	catalog := gamecontent.MustLoadV4()
	chapter, ok := catalog.Chapter("seventh-dock")
	if !ok {
		t.Fatal("missing tutorial chapter")
	}
	config := authoredBalanceConfig(t, catalog, chapter, 0)
	trace, result := deterministicAutoplay(config)
	if result.RescuesUsed == 0 {
		t.Fatalf("tutorial never filled Rescue in %d ticks: charge=%d kills=%d", trace.Ticks, result.Final.RescueCharge, result.Kills)
	}
	frames, err := DecodeTrace(trace, trace.Ticks)
	if err != nil {
		t.Fatal(err)
	}
	sim := newSimulation(config)
	firstRescueTick := 0
	for _, input := range frames {
		sim.step(input)
		if sim.rescuesUsed > 0 {
			firstRescueTick = sim.tick
			break
		}
	}
	if firstRescueTick == 0 || firstRescueTick > 30*TicksPerSecond {
		t.Fatalf("first tutorial Rescue tick=%d, want <=%d", firstRescueTick, 30*TicksPerSecond)
	}
}

func TestEveryAuthoredIntermissionChoiceHasAuthoritySemantics(t *testing.T) {
	catalog := gamecontent.MustLoadV4()
	for _, chapter := range catalog.Chapters {
		for _, choice := range chapter.Story.Intermission.Choices {
			if storyChoiceMode(choice.ID) == 0 {
				t.Fatalf("chapter %s choice %s has no shooter semantics", chapter.ID, choice.ID)
			}
		}
	}
}

func TestAuthoredSurvivalSegmentsHaveNoFourSecondPressureDeadZone(t *testing.T) {
	catalog := gamecontent.MustLoadV4()
	for _, chapter := range catalog.Chapters {
		for segmentIndex := range 3 {
			config := authoredBalanceConfig(t, catalog, chapter, segmentIndex)
			sim := newSimulation(config)
			longest, quiet := 0, 0
			for range config.DurationTicks {
				sim.step(Input{X: 63})
				if len(sim.enemies) == 0 && len(sim.enemyProjectiles) == 0 {
					quiet++
					longest = max(longest, quiet)
				} else {
					quiet = 0
				}
			}
			if longest > 4*TicksPerSecond {
				t.Fatalf("%s segment %d has a %d-tick pressure dead zone", chapter.ID, segmentIndex+1, longest)
			}
		}
	}
}

func TestProductionSmokeSweepClearsBaseAuthority(t *testing.T) {
	catalog := gamecontent.MustLoadV4()
	chapter, ok := catalog.Chapter("seventh-dock")
	if !ok {
		t.Fatal("missing tutorial chapter")
	}
	config := authoredBalanceConfig(t, catalog, chapter, 0)
	for index := range config.Enemies {
		if config.Enemies[index].Chassis == ChassisClipCutter {
			config.Enemies[index].FireInterval *= 2
		}
	}
	result, err := Simulate(config, productionSmokeTrace(config.DurationTicks))
	if err != nil || !result.Won {
		t.Fatalf("tutorial smoke trace result=%#v err=%v", result, err)
	}
}

func authoredBalanceConfig(t *testing.T, catalog *gamecontent.V4Catalog, chapter gamecontent.V4Chapter, segmentIndex int) Config {
	t.Helper()
	characterID := chapter.FeaturedCharacter
	if characterID == "player-choice" {
		characterID = "nana7mi"
	}
	character, ok := catalog.Character(characterID)
	if !ok {
		t.Fatalf("chapter %s character %s missing", chapter.ID, characterID)
	}
	config := Config{
		Seed: "balance:" + chapter.ID, PlayerHealth: 3,
		Kit:        Kit{ID: KitID(character.ID), MaxHealth: character.BaseStats.MaxHealth, AttackDamage: character.BaseStats.ShotDamage, FireInterval: character.BaseStats.ShotInterval, RescueDamage: character.Special.Power, MoveLimit: character.BaseStats.MoveLimit, SpecialBehavior: character.Special.Behavior, SpecialDuration: character.Special.DurationTicks},
		Companions: []Companion{}, ShowEffects: []Effect{}, Enemies: make([]EnemySpec, 0, len(catalog.Enemies)), Limits: DefaultLimits(),
	}
	if chapter.ID == "seventh-dock" && segmentIndex == 0 {
		config.StartingRescueCharge = 20
		config.Kit.StartingShield = 2
	}
	for _, item := range catalog.Enemies {
		config.Enemies = append(config.Enemies, EnemySpec{ID: item.ID, Chassis: Chassis(item.ID), Health: item.MaxHealth, Speed: item.Speed, ContactDamage: item.ContactDamage, MovePattern: item.MovePattern, ShotPattern: item.ShotPattern, FireInterval: item.ShotInterval, ProjectileSpeed: item.ProjectileSpeed, Damage: item.ProjectileDamage, Score: max(50, item.MaxHealth*4), TelegraphTicks: item.TelegraphTicks, Traits: append([]string{}, item.Traits...)})
	}
	if segmentIndex < 3 {
		segment := chapter.Segments[segmentIndex]
		wave, exists := catalog.Wave(segment.WaveID, chapter.ID)
		if !exists {
			t.Fatalf("chapter %s wave %s missing", chapter.ID, segment.WaveID)
		}
		config.DurationTicks, config.Wave.ID = segment.DurationTicks, wave.ID
		for _, spawn := range wave.Spawns {
			config.Wave.Spawns = append(config.Wave.Spawns, Spawn{AtTick: spawn.AtTick, EnemyID: spawn.EnemyID, Count: spawn.Count, Formation: spawn.Formation, IntervalTicks: spawn.IntervalTicks})
		}
		return config
	}
	config.DurationTicks = chapter.Boss.DurationTicks
	config.Wave = Wave{ID: "boss", Spawns: []Spawn{}}
	// A campaign Boss is reached after the three mandatory, one-level show
	// choices. Use a valid representative loadout rather than testing a state
	// the run state machine can never produce.
	config.ShowEffects = []Effect{{Kind: EffectTwinShot, Amount: 1}, {Kind: EffectGuardOnSpecial, Amount: 1}}
	config.Companions = []Companion{{ID: CompanionXingtong, Trigger: "boss_stage", Behavior: "focus_beam", Amount: 40, CooldownTicks: 300}}
	config.Boss = &Boss{ID: BossID(chapter.Boss.ID), Health: chapter.Boss.MaxHealth, Score: max(1000, chapter.Boss.MaxHealth*5)}
	for _, stage := range chapter.Boss.Stages {
		config.Boss.Stages = append(config.Boss.Stages, BossStage{ID: stage.ID, HealthThreshold: stage.HealthThreshold, MovePattern: stage.MovePattern, ShotPattern: stage.ShotPattern, FireInterval: stage.ShotInterval, ProjectileSpeed: stage.ProjectileSpeed, Damage: stage.ProjectileDamage, TelegraphTicks: stage.TelegraphTicks, Special: stage.Special})
	}
	return config
}

func deterministicAutoplay(config Config) (InputTrace, Result) {
	if err := normalizeConfig(&config); err != nil {
		panic(err)
	}
	sim := newSimulation(config)
	controls := make([]uint8, 0, config.DurationTicks)
	previous := uint8(63)
	for range config.DurationTicks {
		control := chooseAutoplayX(sim, previous)
		if sim.rescueCharge >= RescueChargeLimit {
			control |= 0x80
		}
		sim.step(Input{X: control & 0x7f, Rescue: control&0x80 != 0})
		controls = append(controls, control)
		previous = control & 0x7f
	}
	won := sim.health > 0
	if config.Boss != nil {
		won = won && !hasLivingBoss(sim.enemies)
	}
	return encodeControls(controls), sim.result(won)
}

func chooseAutoplayX(sim *simulation, previous uint8) uint8 {
	bestControl, bestScore := previous, int(^uint(0)>>1)
	for control := 3; control <= 124; control += 3 {
		x := inputX(sim.config.Kit.MoveLimit, uint8(control))
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
					score += 2_000_000 - future*20_000
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
					score += 500_000
				}
				continue
			}
			width := max(180, threat.Width)
			if abs(x-threat.Target.X) <= width/2+playerRadius {
				score += 350_000
			}
		}
		for _, enemy := range sim.enemies {
			if enemy.health > 0 && enemy.y > playerY-700 && abs(enemy.x-x) < enemyRadius+playerRadius {
				score += 1_000_000
			}
		}
		targetX, targetWeight := autoplayTarget(sim, x)
		score += abs(x-targetX) * targetWeight
		if score < bestScore {
			bestControl, bestScore = uint8(control), score
		}
	}
	return bestControl
}

func autoplayTarget(sim *simulation, candidateX int) (int, int) {
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
			for future := 1; future <= flightTicks; future++ {
				moveBoss(&predicted, sim.config.Boss.ID, stage.MovePattern, sim.tick+future, candidateX)
			}
			return predicted.x, 12
		}
		if enemy.health > 0 && (enemy.boss || enemy.y > targetY) {
			targetX, targetY = enemy.x, enemy.y
		}
	}
	return targetX, 2
}

func inputX(moveLimit int, control uint8) int {
	if moveLimit <= 0 || moveLimit > ArenaWidth/2-playerRadius {
		moveLimit = ArenaWidth/2 - playerRadius
	}
	return ArenaWidth/2 - moveLimit + int(control)*(moveLimit*2)/127
}

func hasLivingBoss(enemies []enemyEntity) bool {
	for _, enemy := range enemies {
		if enemy.boss && enemy.health > 0 {
			return true
		}
	}
	return false
}

func encodeControls(controls []uint8) InputTrace {
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

func productionSmokeTrace(ticks int) InputTrace {
	controls := make([]uint8, ticks)
	for tick := range ticks {
		phase := tick % 180
		x := 64
		if phase < 60 {
			x = 18 + phase*92/60
		} else if phase < 120 {
			x = 110 - (phase-60)*92/60
		}
		controls[tick] = uint8(x)
		if tick > 0 && tick%30 == 0 {
			controls[tick] |= 0x80
		}
	}
	return encodeControls(controls)
}
