package shooter

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestTraceJSONUsesTupleArraysAndExactTicks(t *testing.T) {
	trace := InputTrace{Encoding: TraceEncoding, Ticks: 4, Runs: []TraceRun{{0x21, 3}, {0xa2, 1}}}
	encoded, err := json.Marshal(trace)
	if err != nil {
		t.Fatal(err)
	}
	if string(encoded) != `{"encoding":"x-position-rle-v1","ticks":4,"runs":[[33,3],[162,1]]}` {
		t.Fatalf("trace JSON=%s", encoded)
	}
	var decoded InputTrace
	if err := json.Unmarshal(encoded, &decoded); err != nil || !reflect.DeepEqual(decoded, trace) {
		t.Fatalf("decoded trace=%#v error=%v", decoded, err)
	}
	for _, invalidJSON := range []string{
		`{"encoding":"x-position-rle-v1","ticks":1,"runs":[[63]]}`,
		`{"encoding":"x-position-rle-v1","ticks":1,"runs":[[63,1,99]]}`,
	} {
		if err := json.Unmarshal([]byte(invalidJSON), &decoded); !errors.Is(err, ErrInvalidTrace) {
			t.Fatalf("json.Unmarshal(%s) error=%v", invalidJSON, err)
		}
	}
	frames, err := DecodeTrace(trace, 4)
	if err != nil || len(frames) != 4 || frames[0].X != 33 || !frames[3].Rescue || frames[3].X != 34 {
		t.Fatalf("frames=%#v err=%v", frames, err)
	}
	for _, invalid := range []InputTrace{
		{Encoding: TraceEncoding, Ticks: 3, Runs: []TraceRun{{4, 2}}},
		{Encoding: TraceEncoding, Ticks: 3, Runs: []TraceRun{{4, 1}, {4, 2}}},
		{Encoding: "wrong-encoding", Ticks: 3, Runs: []TraceRun{{4, 3}}},
	} {
		if _, err := DecodeTrace(invalid, 3); !errors.Is(err, ErrInvalidTrace) {
			t.Fatalf("DecodeTrace(%#v) error=%v", invalid, err)
		}
	}
}

func FuzzDecodeTrace(f *testing.F) {
	f.Add([]byte{64, 10}, 10)
	f.Fuzz(func(t *testing.T, raw []byte, ticks int) {
		if ticks < 1 || ticks > MaxSegmentTicks || len(raw) < 2 {
			return
		}
		runs := make([]TraceRun, 0, len(raw)/2)
		for index := 0; index+1 < len(raw) && len(runs) < ticks; index += 2 {
			runs = append(runs, TraceRun{raw[index], raw[index+1]})
		}
		frames, err := DecodeTrace(InputTrace{Encoding: TraceEncoding, Ticks: ticks, Runs: runs}, ticks)
		if err == nil && len(frames) != ticks {
			t.Fatalf("decoded %d frames for %d ticks", len(frames), ticks)
		}
	})
}

func TestNormalSegmentSurvivesExactTicksAndBossRequiresDefeat(t *testing.T) {
	config := testConfig(90)
	result, err := Simulate(config, constantTrace(90, 63))
	if err != nil || !result.Won || result.Ticks != 90 {
		t.Fatalf("normal result=%#v err=%v", result, err)
	}
	bossConfig := config
	bossConfig.Kit.AttackDamage = 1000
	bossConfig.Kit.FireInterval = 1
	bossConfig.Boss = testBoss(BossOptimalNana, 100)
	cleared, err := Simulate(bossConfig, constantTrace(90, 63))
	if err != nil || !cleared.Won {
		t.Fatalf("cleared boss=%#v err=%v", cleared, err)
	}
	bossConfig.Kit.AttackDamage = 1
	failed, err := Simulate(bossConfig, constantTrace(90, 63))
	if err != nil || failed.Won {
		t.Fatalf("uncleared boss=%#v err=%v", failed, err)
	}
}

func TestSupportNotesAreAuthoritativeAndPickupMagnetChangesCollection(t *testing.T) {
	config := testConfig(100)
	config.Kit.AttackDamage = 100
	config.Kit.FireInterval = 1
	config.Enemies = []EnemySpec{testEnemy("spam-bot", ChassisSpamBot, 1, 999)}
	config.Wave = Wave{ID: "notes", Spawns: []Spawn{{AtTick: 0, EnemyID: "spam-bot", Count: 1, Formation: "center", IntervalTicks: 1}}}
	without, err := Simulate(config, constantTrace(100, 47))
	if err != nil {
		t.Fatal(err)
	}
	if without.Final.RescueCharge != 0 {
		t.Fatalf("off-axis support note was unexpectedly collected: %d", without.Final.RescueCharge)
	}
	magnet := newSimulation(config)
	magnet.runtime.pickupMagnet = 320
	magnet.playerX = ArenaWidth / 2
	magnet.dropSupportNote(magnet.playerX+400, playerY-350, 8)
	plain := newSimulation(config)
	plain.playerX = ArenaWidth / 2
	plain.dropSupportNote(plain.playerX+400, playerY-350, 8)
	for range 5 {
		magnet.updatePickups()
		plain.updatePickups()
	}
	if plain.rescueCharge != 0 || magnet.rescueCharge != 8 {
		t.Fatalf("pickup charge plain=%d magnet=%d", plain.rescueCharge, magnet.rescueCharge)
	}
}

func TestAllAuthoredPrimitivesAndCapsValidate(t *testing.T) {
	config := testConfig(120)
	for _, kind := range SupportedShowEffects {
		config.ShowEffects = append(config.ShowEffects, Effect{Kind: kind, Amount: 1})
	}
	for index, id := range SupportedCompanions {
		config.Companions = append(config.Companions, Companion{ID: id, Trigger: []string{"segment_start", "graze_streak", "low_health", "special_used", "boss_stage", "pickup_chain", "wave_clear"}[index], Behavior: []string{"side_shot", "shield", "echo_shot", "clear_lane", "convert_bullet", "focus_beam", "heal"}[index], Amount: 1, CooldownTicks: 30})
	}
	for index, chassis := range SupportedChassis {
		id := string(chassis)
		config.Enemies = append(config.Enemies, testEnemy(id, chassis, 200, 12))
		config.Wave.Spawns = append(config.Wave.Spawns, Spawn{AtTick: index, EnemyID: id, Count: 8, Formation: []string{"line", "fan", "staggered", "pincer", "center", "sweep"}[index], IntervalTicks: 1})
	}
	result, err := Simulate(config, constantTrace(120, 63))
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Final.Enemies) > MaxEnemies || len(result.Final.EnemyProjectiles) > MaxEnemyBullets || len(result.Final.PlayerProjectiles) > MaxPlayerBullets || len(result.Final.Pickups) > MaxPickups {
		t.Fatalf("entity caps exceeded: %#v", result.Final)
	}
}

func TestAllCharacterSpecialsAndBossesAreImplemented(t *testing.T) {
	behaviors := []string{"barrage_break", "cheer_guard", "afterimage_replay", "captain_parry", "subtitle_flip", "prism_shift", "memory_bloom"}
	for index, kitID := range SupportedKits {
		config := testConfig(1)
		config.Kit.ID, config.Kit.SpecialBehavior = kitID, behaviors[index]
		sim := newSimulation(config)
		sim.rescueCharge = RescueChargeLimit
		sim.enemies = []enemyEntity{{id: 1, health: 100, maxHealth: 100}}
		sim.activateRescue()
		if sim.rescuesUsed != 1 || sim.enemies[0].health >= 100 {
			t.Fatalf("kit %s did not activate: %#v", kitID, sim)
		}
	}
	for _, bossID := range SupportedBosses {
		boss := testBoss(bossID, 100)
		if got := bossStageIndex(30, 100, boss.Stages); got != 2 {
			t.Fatalf("boss %s final stage=%d", bossID, got)
		}
	}
}

func TestDamageUsesDeterministicPostHitInvulnerability(t *testing.T) {
	sim := newSimulation(testConfig(60))
	sim.damagePlayer(1)
	sim.damagePlayer(1)
	if sim.health != 2 || sim.invulnerableTicks != HitInvulnerabilityTicks {
		t.Fatalf("same-tick hits health=%d invulnerability=%d", sim.health, sim.invulnerableTicks)
	}
	for range HitInvulnerabilityTicks {
		sim.step(Input{X: 63})
	}
	sim.damagePlayer(1)
	if sim.health != 1 {
		t.Fatalf("post-window hit health=%d", sim.health)
	}
}

func TestSnapshotExposesRendererReadyThreatGeometry(t *testing.T) {
	config := testConfig(13)
	config.Enemies = []EnemySpec{testEnemy("censor-frame", ChassisCensorFrame, 500, 18)}
	config.Wave = Wave{ID: "warning", Spawns: []Spawn{{AtTick: 0, EnemyID: "censor-frame", Count: 1, Formation: "center", IntervalTicks: 1}}}
	result, err := Simulate(config, constantTrace(13, 63))
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Final.Threats) != 1 {
		t.Fatalf("threats=%#v", result.Final.Threats)
	}
	threat := result.Final.Threats[0]
	if threat.Kind != "censor_gap" || threat.Width <= 0 || threat.TicksRemaining <= 0 || threat.Target.Y != playerY {
		t.Fatalf("threat=%#v", threat)
	}
}

func TestLatePressureKeepsSurvivalSegmentsActiveWithoutExceedingCaps(t *testing.T) {
	config := testConfig(900)
	config.Enemies = []EnemySpec{testEnemy("spam-bot", ChassisSpamBot, 100000, 999)}
	config.Wave = Wave{ID: "opening", Spawns: []Spawn{{AtTick: 0, EnemyID: "spam-bot", Count: 1, Formation: "center", IntervalTicks: 1}}}
	sim := newSimulation(config)
	spawnTicks := make([]int, 0, 10)
	previousID := 0
	for range config.DurationTicks {
		sim.step(Input{X: 63})
		if sim.nextEnemyID != previousID {
			spawnTicks = append(spawnTicks, sim.tick-1)
			previousID = sim.nextEnemyID
		}
		if len(sim.enemies) > config.Limits.Enemies {
			t.Fatalf("enemy cap exceeded: %d", len(sim.enemies))
		}
	}
	if len(spawnTicks) < 6 || spawnTicks[len(spawnTicks)-1] < config.DurationTicks-90 {
		t.Fatalf("late pressure ended too early: %v", spawnTicks)
	}
	for index := 1; index < len(spawnTicks); index++ {
		if gap := spawnTicks[index] - spawnTicks[index-1]; gap > 120 {
			t.Fatalf("pressure gap=%d ticks in %v", gap, spawnTicks)
		}
	}
}

func TestSixChassisProduceDistinctAuthoritativeDecisions(t *testing.T) {
	expected := map[Chassis]struct {
		kind  string
		count int
	}{
		ChassisSpamBot:          {"spam_stream", 1},
		ChassisClipCutter:       {"horizontal_cut", 1},
		ChassisCaptionBlob:      {"caption_block", 1},
		ChassisBlackScreenGhost: {"black_wall", 1},
		ChassisGiftThief:        {"", 0},
		ChassisCensorFrame:      {"censor_bar", 4},
	}
	for chassis, want := range expected {
		t.Run(string(chassis), func(t *testing.T) {
			config := testConfig(60)
			spec := testEnemy(string(chassis), chassis, 60, 30)
			config.Enemies = []EnemySpec{spec}
			sim := newSimulation(config)
			enemy := enemyEntity{id: 2, specIndex: 0, x: ArenaWidth / 2, y: 900, health: spec.Health, maxHealth: spec.Health}
			sim.fireEnemy(&enemy, spec, spec.ShotPattern)
			if len(sim.enemyProjectiles) != want.count {
				t.Fatalf("projectiles=%#v", sim.enemyProjectiles)
			}
			for _, projectile := range sim.enemyProjectiles {
				if projectile.kind != want.kind {
					t.Fatalf("kind=%q want=%q", projectile.kind, want.kind)
				}
			}
			if chassis == ChassisBlackScreenGhost && (sim.enemyProjectiles[0].health <= 0 || sim.enemyProjectiles[0].width <= 0) {
				t.Fatal("black-screen wall is not breakable geometry")
			}
			if chassis == ChassisClipCutter && sim.enemyProjectiles[0].width < 1000 {
				t.Fatal("clip cutter did not author a horizontal cut")
			}
		})
	}

	config := testConfig(60)
	thief := testEnemy("gift-thief", ChassisGiftThief, 1, 60)
	config.Enemies = []EnemySpec{thief}
	sim := newSimulation(config)
	sim.enemies = []enemyEntity{{id: 1, specIndex: 0, x: 1800, y: 1200, health: 0, maxHealth: 1}}
	sim.removeDefeatedEnemies()
	if len(sim.pickups) != 1 || sim.pickups[0].value != 30 {
		t.Fatalf("gift thief drop=%#v", sim.pickups)
	}
}

func TestBlackScreenWallCanBeShotOpen(t *testing.T) {
	sim := newSimulation(testConfig(30))
	sim.addEnemyHazard("black_wall", 1800, 1800, 0, 10, 1, 120, 1200, 20)
	if !sim.hitBreakableHazard(projectileEntity{x: 1800, y: 1800, damage: 20}) || sim.enemyProjectiles[0].health > 0 {
		t.Fatalf("wall=%#v", sim.enemyProjectiles)
	}
}

func TestAuthoredBossSpecialsAndEncoreRemixChangeSafeRoutes(t *testing.T) {
	specials := []string{
		"tidy-intro", "copied-laugh", "empty-horizon",
		"applause-loop", "reply-now", "endless-encore",
		"crop-the-miss", "bad-take-echo", "delete-loss",
		"assign-everything", "overtime-wall", "carry-the-room",
		"word-by-word", "tone-correction", "approved-only",
		"copy-position", "double-exposure", "split-stage",
		"prove-the-address", "erase-the-flowers", "nothing-happened",
		"remove-duplicates", "overwrite-drafts", "archive-everyone",
	}
	for _, special := range specials {
		sim := newSimulation(testConfig(60))
		enemy := enemyEntity{id: 1, x: 1800, y: 900, health: 100, maxHealth: 100, boss: true, phase: 1}
		before := len(sim.enemyProjectiles)
		sim.fireBossSpecial(&enemy, special, 90, 1)
		if len(sim.enemyProjectiles) <= before {
			t.Fatalf("boss special %q produced no authority change", special)
		}
		if _, ok := sim.bossSpecialThreat(enemy, special, 10); !ok {
			t.Fatalf("boss special %q has no renderer-ready warning", special)
		}
	}

	for _, bossID := range SupportedBosses {
		config := testConfig(60)
		config.EncoreLevel = 3
		config.Boss = testBoss(bossID, 100)
		sim := newSimulation(config)
		enemy := enemyEntity{id: 1, x: 1800, y: 900, health: 100, maxHealth: 100, boss: true, phase: 1}
		sim.fireBossRemix(&enemy, bossID, 90, 1)
		if len(sim.enemyProjectiles) == 0 {
			t.Fatalf("Encore 3 boss %q has no remix", bossID)
		}
	}
}

func TestEncoreChangesBehaviorWithoutAddingEnemyHealth(t *testing.T) {
	base := testConfig(120)
	base.Enemies = []EnemySpec{testEnemy("spam-bot", ChassisSpamBot, 50, 30)}
	base.Wave = Wave{ID: "encore", Spawns: []Spawn{{AtTick: 0, EnemyID: "spam-bot", Count: 1, Formation: "center", IntervalTicks: 1}}}
	levelThree := base
	levelThree.EncoreLevel = 3
	plain, remix := newSimulation(base), newSimulation(levelThree)
	plain.spawnEnemy("spam-bot", 1800)
	remix.spawnEnemy("spam-bot", 1800)
	if plain.enemies[0].health != remix.enemies[0].health {
		t.Fatalf("Encore inflated health: base=%d encore=%d", plain.enemies[0].health, remix.enemies[0].health)
	}
	enemy := &remix.enemies[0]
	remix.fireEnemy(enemy, levelThree.Enemies[0], "")
	primary := len(remix.enemyProjectiles)
	remix.fireEnemySecondary(enemy, levelThree.Enemies[0])
	if len(remix.enemyProjectiles) <= primary {
		t.Fatal("Encore 2 enemy secondary mode is missing")
	}
}

func TestSpecialChargePenaltyAlwaysSlowsRescue(t *testing.T) {
	baseline := &simulation{config: testConfig(30)}
	baseline.earnRescue(20)
	if baseline.rescueCharge != 20 {
		t.Fatalf("baseline Rescue charge=%d, want 20", baseline.rescueCharge)
	}

	penalizedConfig := testConfig(30)
	penalizedConfig.SpecialChargePenaltyPercent = 25
	penalized := &simulation{config: penalizedConfig}
	penalized.earnRescue(20)
	if penalized.rescueCharge != 15 || penalized.rescueCharge >= baseline.rescueCharge {
		t.Fatalf("penalized Rescue charge=%d, want 15 and less than baseline", penalized.rescueCharge)
	}

	invalid := testConfig(30)
	invalid.SpecialChargePenaltyPercent = 76
	if err := normalizeConfig(&invalid); err == nil {
		t.Fatal("special charge penalty above 75 percent was accepted")
	}
}

func TestConcreteStoryChoicesChangeBossBeatAndCompanionSupport(t *testing.T) {
	branchA := testConfig(60)
	branchA.StoryChoiceID = "keep-seven-second-voice"
	branchA.Companions = []Companion{{ID: CompanionJiaran, Trigger: "segment_start", Behavior: "shield", Amount: 2, CooldownTicks: 1}}
	branchB := branchA
	branchB.StoryChoiceID = "delete-learned-reply"

	a, b := newSimulation(branchA), newSimulation(branchB)
	enemyA := enemyEntity{id: 1, x: 1800, y: 900, health: 100, maxHealth: 100, boss: true}
	enemyB := enemyA
	a.fireStoryChoiceBeat(&enemyA, 90, 1)
	b.fireStoryChoiceBeat(&enemyB, 90, 1)
	if len(a.enemyProjectiles) != 1 || a.enemyProjectiles[0].kind != "choice_echo" {
		t.Fatalf("branch A Boss beat=%#v", a.enemyProjectiles)
	}
	if len(b.enemyProjectiles) != 4 || b.enemyProjectiles[0].kind != "choice_frame" {
		t.Fatalf("branch B Boss beat=%#v", b.enemyProjectiles)
	}
	a.step(Input{X: 63})
	b.step(Input{X: 63})
	if a.shield <= b.shield || len(a.effects) == 0 || a.effects[len(a.effects)-1].kind != "choice_assist" {
		t.Fatalf("choice companion support A=%d B=%d effects=%#v", a.shield, b.shield, a.effects)
	}
}

func TestDailyUsesOnlyTheAuthoredRuntimeModifier(t *testing.T) {
	config := testConfig(30)
	config.Daily = true
	config.DailyModifierID = "dock-crosswind"
	plain := resolveRuntime(config)
	sim := newSimulation(config)
	if sim.dailyVariant != "dock-crosswind" || sim.runtime != plain {
		t.Fatalf("daily modifier was duplicated in shooter runtime: variant=%q runtime=%#v plain=%#v", sim.dailyVariant, sim.runtime, plain)
	}
	config.DailyModifierID = ""
	if fallback := newSimulation(config); fallback.dailyVariant != "" || fallback.runtime != resolveRuntime(config) {
		t.Fatalf("shooter invented an unauthored daily variant: %#v", fallback)
	}
}

func TestCharacterPassivesAreDistinctAndAuthoritative(t *testing.T) {
	for _, kitID := range SupportedKits {
		config := testConfig(30)
		config.Kit.ID = kitID
		sim := newSimulation(config)
		sim.enemies = []enemyEntity{{id: 1, x: sim.playerX, y: 1200, health: 200, maxHealth: 200}}
		switch kitID {
		case KitNana:
			sim.applyKitOnHit(0, 10)
			if sim.enemies[0].marks != 1 {
				t.Fatal("Nana did not place a route mark")
			}
		case KitJiaran:
			sim.combo, sim.attackClock = 6, sim.runtime.fireInterval
			before := len(sim.playerProjectiles)
			sim.updateWeapons()
			if len(sim.playerProjectiles) <= before || sim.playerProjectiles[0].damage <= sim.runtime.damage {
				t.Fatal("Jiaran combo did not empower her volley")
			}
		case KitXiangwan:
			sim.tick, sim.attackClock = sim.runtime.fireInterval*4, sim.runtime.fireInterval
			sim.updateWeapons()
			if len(sim.playerProjectiles) < 2 {
				t.Fatal("Xiangwan did not replay an afterimage shot")
			}
		case KitBella:
			sim.attackSequence, sim.attackClock = 2, sim.runtime.fireInterval
			sim.updateWeapons()
			if len(sim.playerProjectiles) < 3 {
				t.Fatal("Bella did not fire a cadence volley")
			}
		case KitLulu:
			sim.tick = 12
			sim.enemyProjectiles = []projectileEntity{{id: 1, x: sim.playerX, y: playerY - 100, hostile: true}}
			sim.updateKitPassives()
			if len(sim.enemyProjectiles) != 0 || len(sim.playerProjectiles) != 1 {
				t.Fatal("Lulu did not rewrite a nearby bullet")
			}
		case KitXingtong:
			for range 18 {
				sim.updateKitPassives()
			}
			if sim.enemies[0].health >= 200 {
				t.Fatal("Xingtong alignment beam dealt no damage")
			}
		case KitNailu:
			sim.applyKitOnHit(0, 10)
			if len(sim.effects) == 0 || sim.effects[0].kind != "memory_plant" {
				t.Fatal("Nailu did not plant a memory bloom")
			}
		}
	}
}

type goldenVector struct {
	Name   string     `json:"name"`
	Config Config     `json:"config"`
	Trace  InputTrace `json:"trace"`
	Result Result     `json:"result"`
}

func TestShooterV1GoldenVectors(t *testing.T) {
	vectors := []goldenVector{
		baselineGoldenVector(t),
		sixChassisGoldenVector(t),
		bossBranchGoldenVector(t),
		dailyPenaltyGoldenVector(t),
	}
	actual, err := json.Marshal(vectors)
	if err != nil {
		t.Fatal(err)
	}
	actual = append(actual, '\n')
	if os.Getenv("PRINT_SHOOTER_GOLDEN") == "1" {
		t.Logf("\n%s", actual)
		return
	}
	expected, err := os.ReadFile(filepath.Join("testdata", "shooter-v1-golden.json"))
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(actual, expected) {
		t.Fatal("shooter-v1 golden vectors changed; review authority behavior and regenerate deliberately")
	}
}

func baselineGoldenVector(t *testing.T) goldenVector {
	t.Helper()
	config := testConfig(45)
	config.Kit.AttackDamage, config.Kit.FireInterval = 40, 3
	config.Enemies = []EnemySpec{
		testEnemy("censor-frame", ChassisCensorFrame, 30, 18),
		testEnemy("spam-bot", ChassisSpamBot, 500, 24),
	}
	config.Wave = Wave{ID: "golden", Spawns: []Spawn{
		{AtTick: 0, EnemyID: "censor-frame", Count: 1, Formation: "center", IntervalTicks: 1},
		{AtTick: 4, EnemyID: "spam-bot", Count: 1, Formation: "pincer", IntervalTicks: 1},
	}}
	trace := InputTrace{Encoding: TraceEncoding, Ticks: 45, Runs: []TraceRun{{20, 15}, {63, 15}, {110, 15}}}
	result, err := Simulate(config, trace)
	if err != nil {
		t.Fatal(err)
	}
	return goldenVector{Name: "baseline", Config: config, Trace: trace, Result: result}
}

func sixChassisGoldenVector(t *testing.T) goldenVector {
	t.Helper()
	config := testConfig(120)
	config.Seed = "six-chassis-golden"
	config.Kit.AttackDamage, config.Kit.FireInterval, config.Kit.StartingShield = 1, 30, 30
	config.Limits.EnemyProjectiles = 72
	for index, chassis := range SupportedChassis {
		config.Enemies = append(config.Enemies, testEnemy(string(chassis), chassis, 400, 18+index*3))
		config.Wave.Spawns = append(config.Wave.Spawns, Spawn{
			AtTick: index * 3, EnemyID: string(chassis), Count: 1,
			Formation: []string{"pincer", "sweep", "fan", "staggered", "line", "center"}[index], IntervalTicks: 1,
		})
	}
	config.Wave.ID = "six-chassis"
	trace := InputTrace{Encoding: TraceEncoding, Ticks: 120, Runs: []TraceRun{{20, 40}, {63, 40}, {110, 40}}}
	result, err := Simulate(config, trace)
	if err != nil {
		t.Fatal(err)
	}
	seenChassis := make(map[Chassis]bool)
	for _, enemy := range result.Final.Enemies {
		seenChassis[enemy.Chassis] = true
	}
	for _, chassis := range SupportedChassis {
		if !seenChassis[chassis] {
			t.Fatalf("six-chassis golden is missing final %q authority state", chassis)
		}
	}
	wantHazards := map[string]bool{"spam_stream": false, "horizontal_cut": false, "caption_block": false, "black_wall": false, "censor_bar": false}
	for _, projectile := range result.Final.EnemyProjectiles {
		if _, ok := wantHazards[projectile.Kind]; ok {
			wantHazards[projectile.Kind] = true
		}
	}
	for kind, found := range wantHazards {
		if !found {
			t.Fatalf("six-chassis golden is missing %q projectile geometry", kind)
		}
	}
	return goldenVector{Name: "six-chassis", Config: config, Trace: trace, Result: result}
}

func bossBranchGoldenVector(t *testing.T) goldenVector {
	t.Helper()
	config := testConfig(240)
	config.Seed = "boss-encore-story-golden"
	config.Kit.AttackDamage, config.Kit.FireInterval, config.Kit.StartingShield = 15, 4, 80
	config.StartingRescueCharge = RescueChargeLimit
	config.EncoreLevel = 3
	config.StoryChoiceID = "keep-seven-second-voice"
	config.Companions = []Companion{{ID: CompanionXingtong, Trigger: "boss_stage", Behavior: "focus_beam", Amount: 40, CooldownTicks: 1}}
	config.Boss = &Boss{ID: BossAutoArchiveSystem, Health: 650, Score: 3000, Stages: []BossStage{
		{ID: "sort-the-chat", HealthThreshold: 100, MovePattern: "anchor", ShotPattern: "lane", FireInterval: 30, ProjectileSpeed: 116, Damage: 1, TelegraphTicks: 21, Special: "remove-duplicates"},
		{ID: "keep-only-highlights", HealthThreshold: 66, MovePattern: "anchor", ShotPattern: "delayed", FireInterval: 32, ProjectileSpeed: 122, Damage: 1, TelegraphTicks: 25, Special: "overwrite-drafts"},
		{ID: "end-the-stream", HealthThreshold: 33, MovePattern: "anchor", ShotPattern: "beam", FireInterval: 36, ProjectileSpeed: 132, Damage: 1, TelegraphTicks: 32, Special: "archive-everyone"},
	}}
	trace := InputTrace{Encoding: TraceEncoding, Ticks: 240, Runs: []TraceRun{{0xbf, 1}, {63, 239}}}
	result, err := Simulate(config, trace)
	if err != nil {
		t.Fatal(err)
	}
	hazardKinds := make(map[string]bool)
	for _, projectile := range result.Final.EnemyProjectiles {
		hazardKinds[projectile.Kind] = true
	}
	if !hazardKinds["black_wall"] || bossHealth(result.Final) <= 0 || bossHealth(result.Final) > config.Boss.Health*33/100 {
		t.Fatalf("Boss golden missed phase-three/Encore authority: health=%d hazards=%#v", bossHealth(result.Final), hazardKinds)
	}
	withoutCompanion := config
	withoutCompanion.Companions = []Companion{}
	control, err := Simulate(withoutCompanion, trace)
	if err != nil {
		t.Fatal(err)
	}
	if bossHealth(result.Final) >= bossHealth(control.Final) {
		t.Fatalf("Boss golden companion did not create an authoritative support difference: with=%d without=%d", bossHealth(result.Final), bossHealth(control.Final))
	}
	withoutStory := config
	withoutStory.StoryChoiceID = ""
	control, err = Simulate(withoutStory, trace)
	if err != nil {
		t.Fatal(err)
	}
	if reflect.DeepEqual(result.Final, control.Final) {
		t.Fatal("Boss golden story choice did not alter authoritative Boss state")
	}
	return goldenVector{Name: "boss-encore-story-companion", Config: config, Trace: trace, Result: result}
}

func dailyPenaltyGoldenVector(t *testing.T) goldenVector {
	t.Helper()
	config := testConfig(90)
	config.Seed, config.Daily, config.DailyModifierID = "daily-penalty-golden", true, "captain-overtime"
	config.SpecialChargePenaltyPercent = 15
	config.Kit.AttackDamage, config.Kit.FireInterval, config.Kit.StartingShield = 40, 3, 10
	config.ShowEffects = []Effect{{Kind: EffectPickupMagnet, Amount: 700}}
	config.Enemies = []EnemySpec{testEnemy("gift-thief", ChassisGiftThief, 20, 72)}
	config.Wave = Wave{ID: "daily-gift", Spawns: []Spawn{{AtTick: 0, EnemyID: "gift-thief", Count: 1, Formation: "center", IntervalTicks: 1}}}
	trace := constantTrace(90, 63)
	result, err := Simulate(config, trace)
	if err != nil {
		t.Fatal(err)
	}
	baseline := config
	baseline.SpecialChargePenaltyPercent = 0
	withoutPenalty, err := Simulate(baseline, trace)
	if err != nil {
		t.Fatal(err)
	}
	if result.Final.RescueCharge <= 0 || result.Final.RescueCharge >= withoutPenalty.Final.RescueCharge {
		t.Fatalf("Daily golden penalty did not slow charge: penalty=%d base=%d", result.Final.RescueCharge, withoutPenalty.Final.RescueCharge)
	}
	return goldenVector{Name: "daily-charge-penalty", Config: config, Trace: trace, Result: result}
}

func bossHealth(snapshot Snapshot) int {
	for _, enemy := range snapshot.Enemies {
		if enemy.Boss {
			return enemy.Health
		}
	}
	return 0
}

func testConfig(ticks int) Config {
	return Config{
		Seed: "0123456789abcdef", DurationTicks: ticks, PlayerHealth: 3,
		Kit:        Kit{ID: KitNana, MaxHealth: 3, AttackDamage: 12, FireInterval: 9, RescueDamage: 34, MoveLimit: 1520, SpecialBehavior: "barrage_break", SpecialDuration: 18},
		Companions: []Companion{}, ShowEffects: []Effect{}, Enemies: []EnemySpec{},
		Wave: Wave{ID: "empty", Spawns: []Spawn{}}, Limits: DefaultLimits(),
	}
}

func testEnemy(id string, chassis Chassis, health, interval int) EnemySpec {
	patterns := map[Chassis][2]string{
		ChassisSpamBot: {"drift", "aimed"}, ChassisClipCutter: {"sweep", "fan"},
		ChassisCaptionBlob: {"orbit", "ring"}, ChassisBlackScreenGhost: {"dive", "delayed"},
		ChassisGiftThief: {"mirror", "beam"}, ChassisCensorFrame: {"anchor", "lane"},
	}
	return EnemySpec{ID: id, Chassis: chassis, Health: health, Speed: 10, ContactDamage: 1, MovePattern: patterns[chassis][0], ShotPattern: patterns[chassis][1], FireInterval: interval, ProjectileSpeed: 20, Damage: 1, Score: 100, TelegraphTicks: 6, Traits: []string{}}
}

func testBoss(id BossID, health int) *Boss {
	return &Boss{ID: id, Health: health, Score: 1000, Stages: []BossStage{
		{ID: "one", HealthThreshold: 100, MovePattern: "anchor", ShotPattern: "aimed", FireInterval: 1000, ProjectileSpeed: 10, Damage: 1, TelegraphTicks: 10},
		{ID: "two", HealthThreshold: 66, MovePattern: "anchor", ShotPattern: "fan", FireInterval: 1000, ProjectileSpeed: 10, Damage: 1, TelegraphTicks: 10},
		{ID: "three", HealthThreshold: 33, MovePattern: "anchor", ShotPattern: "ring", FireInterval: 1000, ProjectileSpeed: 10, Damage: 1, TelegraphTicks: 10},
	}}
}

func constantTrace(ticks int, control uint8) InputTrace {
	runs := make([]TraceRun, 0, ticks/255+1)
	for remaining := ticks; remaining > 0; {
		count := min(remaining, 255)
		runs = append(runs, TraceRun{control, uint8(count)})
		remaining -= count
	}
	return InputTrace{Encoding: TraceEncoding, Ticks: ticks, Runs: runs}
}
