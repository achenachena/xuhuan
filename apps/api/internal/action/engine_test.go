package action

import (
	"encoding/base64"
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

type goldenSummary struct {
	Won               bool         `json:"won"`
	Health            int          `json:"health"`
	Ticks             int          `json:"ticks"`
	Kills             int          `json:"kills"`
	Protocols         int          `json:"protocols"`
	Distortion        int          `json:"distortion"`
	Score             int          `json:"score"`
	EmergencyUsed     bool         `json:"emergency_used"`
	ObjectiveProgress int          `json:"objective_progress"`
	EnemyCount        int          `json:"enemy_count"`
	ProjectileCount   int          `json:"projectile_count"`
	SignalCount       int          `json:"signal_count"`
	Weave             []SignalType `json:"weave"`
	Player            Vec          `json:"player"`
	Shield            int          `json:"shield"`
	TotalGrazes       int          `json:"total_grazes"`
}

func summarizeResult(result Result) goldenSummary {
	return goldenSummary{
		Won: result.Won, Health: result.Health, Ticks: result.Ticks, Kills: result.Kills,
		Protocols: result.ProtocolsCompleted, Distortion: result.Distortion, Score: result.Score,
		EmergencyUsed: result.EmergencyReconnectUsed, ObjectiveProgress: result.Final.Objective.Progress,
		EnemyCount: len(result.Final.Enemies), ProjectileCount: len(result.Final.Projectiles),
		SignalCount: len(result.Final.Signals), Weave: result.Final.Weave, Player: result.Final.Player,
		Shield: result.Final.Shield, TotalGrazes: result.Final.TotalGrazes,
	}
}

func encodedTrace(control byte, ticks int) InputTrace {
	raw := make([]byte, 0, ticks/255*2+2)
	remaining := ticks
	for remaining > 0 {
		count := min(255, remaining)
		raw = append(raw, control, byte(count))
		remaining -= count
	}
	return InputTrace{Encoding: TraceEncodingRLE, Ticks: ticks, Data: base64.RawURLEncoding.EncodeToString(raw)}
}

func testConfig() Config {
	return Config{Seed: "deterministic-seed", Kind: "normal", DurationTicks: 120, MaxTicks: 180,
		SpawnInterval: 90, MaxAlive: 4, PlayerHealth: 80, PlayerMaxHealth: 80, EmergencyReconnectAvailable: true,
		Objective: ObjectiveConfig{Kind: "holdout", Target: 120},
		Enemies:   []EnemySpec{{Slug: "dummy", Kind: "normal", MaxHealth: 40, Movement: MovementSpec{Kind: "stationary"}, Attacks: []AttackSpec{{Kind: "aimed", Interval: 1000, ProjectileSpeed: 20, Damage: 4}}}},
		Runtime:   RuntimeConfig{Kit: "nana-route", Passive: "nana_route_chain", Resonance: "nana_route_chain", AttackDamage: 8, AttackInterval: 12, MoveSpeed: 42, WarpCooldown: 240, WarpDamage: 14, DistortionGain: 4, GrazeRadius: 310, ProjectileCount: 1, ProjectileSpeed: 100}}
}

func TestSimulationIsDeterministic(t *testing.T) {
	trace := encodedTrace(0x10, 120)
	first, err := Simulate(testConfig(), trace)
	if err != nil {
		t.Fatal(err)
	}
	second, err := Simulate(testConfig(), trace)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(first, second) || !first.Won {
		t.Fatalf("results differ: %#v %#v", first, second)
	}
}

func TestSimulationRejectsEnemiesWithoutAuthoredAttacks(t *testing.T) {
	config := testConfig()
	config.Enemies[0].Attacks = nil
	if _, err := Simulate(config, encodedTrace(0, config.DurationTicks)); err == nil {
		t.Fatal("expected an enemy without authored attacks to be rejected")
	}
}

func TestTraceRejectsNonCanonicalControl(t *testing.T) {
	trace := InputTrace{Encoding: TraceEncodingRLE, Ticks: 1, Data: base64.RawURLEncoding.EncodeToString([]byte{0x80, 1})}
	if _, err := DecodeTrace(trace, 10); err != ErrInvalidTrace {
		t.Fatalf("error = %v", err)
	}
}

func TestTraceAcceptsBase64URLFromBrowserAndSmokeClients(t *testing.T) {
	raw := []byte{0x3f, 255}
	trace := InputTrace{Encoding: TraceEncodingRLE, Ticks: 255, Data: base64.RawURLEncoding.EncodeToString(raw)}
	frames, err := DecodeTrace(trace, 255)
	if err != nil || len(frames) != 255 || frames[0] != (InputFrame{Direction: 15, Magnitude: 3}) {
		t.Fatalf("frames=%#v error=%v", frames, err)
	}
}

func TestTraceAcceptsBrowserRunsContainingBothBase64URLSubstitutions(t *testing.T) {
	trace := InputTrace{Encoding: TraceEncodingRLE, Ticks: 253, Data: "AAE-_A"}
	frames, err := DecodeTrace(trace, 253)
	if err != nil || len(frames) != 253 {
		t.Fatalf("frames=%d error=%v", len(frames), err)
	}
	if frames[0] != (InputFrame{}) || frames[1] != (InputFrame{Direction: 14, Magnitude: 3}) || frames[252] != frames[1] {
		t.Fatalf("unexpected decoded frames: first=%#v second=%#v last=%#v", frames[0], frames[1], frames[252])
	}
}

func TestTraceRejectsNonCanonicalEncodingAndRuns(t *testing.T) {
	standardBase64 := InputTrace{Encoding: TraceEncodingRLE, Ticks: 1, Data: base64.StdEncoding.EncodeToString([]byte{0x10, 1})}
	if _, err := DecodeTrace(standardBase64, 10); err != ErrInvalidTrace {
		t.Fatalf("padded standard base64 error = %v", err)
	}

	splitRun := InputTrace{Encoding: TraceEncodingRLE, Ticks: 2, Data: base64.RawURLEncoding.EncodeToString([]byte{0x10, 1, 0x10, 1})}
	if _, err := DecodeTrace(splitRun, 10); err != ErrInvalidTrace {
		t.Fatalf("split run error = %v", err)
	}
}

func TestMovementHazardsRouteAndEmergencyReconnect(t *testing.T) {
	t.Run("warp grants invulnerability", func(t *testing.T) {
		sim := newSimulation(testConfig())
		sim.movePlayer(InputFrame{Direction: 0, Magnitude: 1, Skill: true})
		sim.projectiles = append(sim.projectiles, projectileEntity{x: sim.playerX, y: sim.playerY, damage: 10})
		sim.updateProjectiles()
		if sim.health != 80 || sim.invulnerable == 0 {
			t.Fatalf("health=%d invulnerable=%d", sim.health, sim.invulnerable)
		}
	})

	t.Run("tap warp uses its direction without a movement frame", func(t *testing.T) {
		sim := newSimulation(testConfig())
		startX, startY := sim.playerX, sim.playerY
		sim.movePlayer(InputFrame{Direction: 0, Magnitude: 0, Skill: true})
		if sim.playerX != startX+620 || sim.playerY != startY {
			t.Fatalf("player=(%d,%d) start=(%d,%d)", sim.playerX, sim.playerY, startX, startY)
		}
	})

	t.Run("graze triggers desync", func(t *testing.T) {
		sim := newSimulation(testConfig())
		sim.distortion = 99
		sim.projectiles = append(sim.projectiles, projectileEntity{x: sim.playerX + 250, y: sim.playerY, damage: 10})
		sim.updateProjectiles()
		if sim.health != 68 || sim.distortion != 40 || len(sim.projectiles) != 0 {
			t.Fatalf("health=%d distortion=%d projectiles=%d", sim.health, sim.distortion, len(sim.projectiles))
		}
	})

	t.Run("ordered beacons refresh route warp", func(t *testing.T) {
		sim := newSimulation(testConfig())
		sim.warpClock = 120
		for range 3 {
			beacon := sim.activeBeacon()
			sim.playerX, sim.playerY = beacon.X, beacon.Y
			sim.collectBeacon()
		}
		if !sim.routeReady || sim.routes != 1 || sim.warpClock != 0 {
			t.Fatalf("ready=%v routes=%d cooldown=%d", sim.routeReady, sim.routes, sim.warpClock)
		}
		sim.config.Kind = "tutorial"
		won, finished := sim.step(InputFrame{Skill: true})
		if !won || !finished || !sim.routeWarpUsed {
			t.Fatalf("tutorial did not finish from its taught objective")
		}
	})

	t.Run("phase warp cuts bullets and damages enemies on its path", func(t *testing.T) {
		sim := newSimulation(testConfig())
		sim.enemies = append(sim.enemies, enemyEntity{id: 1, x: sim.playerX, y: sim.playerY - 300, health: 40})
		sim.projectiles = append(sim.projectiles, projectileEntity{x: sim.playerX, y: sim.playerY - 260, damage: 10})
		sim.movePlayer(InputFrame{Direction: 12, Magnitude: 3, Skill: true})
		if len(sim.projectiles) != 0 || sim.enemies[0].health >= 40 || sim.warpFX == 0 {
			t.Fatalf("projectiles=%d health=%d warpFX=%d", len(sim.projectiles), sim.enemies[0].health, sim.warpFX)
		}
	})

	t.Run("signal anchor purges nearby bullets", func(t *testing.T) {
		sim := newSimulation(testConfig())
		beacon := sim.activeBeacon()
		sim.playerX, sim.playerY = beacon.X, beacon.Y
		sim.projectiles = append(sim.projectiles,
			projectileEntity{x: beacon.X + 300, y: beacon.Y, damage: 10},
			projectileEntity{x: beacon.X + 900, y: beacon.Y, damage: 10},
		)
		sim.collectBeacon()
		if len(sim.projectiles) != 1 || sim.signalPulse == 0 {
			t.Fatalf("projectiles=%d signalPulse=%d", len(sim.projectiles), sim.signalPulse)
		}
	})

	t.Run("first lethal hit reconnects once", func(t *testing.T) {
		config := testConfig()
		config.Enemies[0].ContactDamage = 7
		sim := newSimulation(config)
		sim.health = 1
		sim.enemies = append(sim.enemies, enemyEntity{id: 1, x: sim.playerX, y: sim.playerY, health: 40})
		won, finished := sim.step(InputFrame{})
		if won || finished || !sim.emergencyUsed || sim.health != 32 || sim.reconnectFX != 90 {
			t.Fatalf("won=%v finished=%v used=%v health=%d fx=%d", won, finished, sim.emergencyUsed, sim.health, sim.reconnectFX)
		}
	})
}

func TestEnemyIntentAndBossPhases(t *testing.T) {
	config := testConfig()
	config.Kind = "boss"
	config.DurationTicks = 2700
	config.MaxTicks = 2700
	config.Enemies = []EnemySpec{{Slug: "optimal", Kind: "boss", MaxHealth: 300, Speed: 5, ContactDamage: 8, Movement: MovementSpec{Kind: "chase"}, Attacks: []AttackSpec{{Kind: "fan", Interval: 30, ProjectileSpeed: 30, Damage: 6, Count: 3, Spread: 3}, {Kind: "aimed", Interval: 30, ProjectileSpeed: 30, Damage: 6}, {Kind: "ring", Interval: 30, ProjectileSpeed: 30, Damage: 6, Count: 8}}}}
	if err := normalizeConfig(&config); err != nil {
		t.Fatal(err)
	}
	sim := newSimulation(config)
	sim.enemies = append(sim.enemies, enemyEntity{id: 1, x: 1800, y: 1200, health: 300, fireClock: 24})
	first := sim.snapshot().Enemies[0]
	if first.BossPhase != 1 || first.IntentTicks != 6 {
		t.Fatalf("phase one snapshot=%#v", first)
	}
	sim.config.Runtime.StartingShield = 8
	sim.enemies[0].health = 190
	second := sim.snapshot().Enemies[0]
	if second.BossPhase != 2 || second.BossMimic != "echo" {
		t.Fatalf("phase two snapshot=%#v", second)
	}
	sim.enemies[0].health = 90
	attack := currentEnemyAttack(sim.enemies[0], config.Enemies[0], config.BossVariant)
	sim.fireEnemyAttack(&sim.enemies[0], config.Enemies[0], attack, 0, 1000, 1000, 30)
	if len(sim.projectiles) != 8 || bossPhase(sim.enemies[0].health, 300) != 3 {
		t.Fatalf("phase three projectiles=%d", len(sim.projectiles))
	}
	timeout := newSimulation(config)
	timeout.tick = config.MaxTicks - 1
	timeout.enemies = append(timeout.enemies, enemyEntity{id: 1, x: 1800, y: 1200, health: 300})
	if won, finished := timeout.step(InputFrame{}); won || !finished {
		t.Fatalf("boss timeout won=%v finished=%v", won, finished)
	}
}

func TestAuthoredBossVariantsChangePatternsAndReadableTiming(t *testing.T) {
	base := testConfig()
	base.Kind = "boss"
	base.Objective = ObjectiveConfig{Kind: "boss", Target: 1}
	base.DurationTicks = BossMaxTicks
	base.MaxTicks = BossMaxTicks
	base.Enemies = []EnemySpec{{
		Slug: "variant-boss", Kind: "boss", MaxHealth: 300, Speed: 0,
		Movement: MovementSpec{Kind: "stationary"},
		Attacks: []AttackSpec{
			{Kind: "fan", Interval: 30, ProjectileSpeed: 30, Damage: 8, Count: 3, Spread: 3, TelegraphTicks: 12},
			{Kind: "aimed", Interval: 28, ProjectileSpeed: 32, Damage: 8, TelegraphTicks: 12},
			{Kind: "ring", Interval: 30, ProjectileSpeed: 28, Damage: 9, Count: 8, TelegraphTicks: 12},
		},
	}}

	type expectation struct {
		kind      string
		interval  int
		telegraph int
		count     int
	}
	wants := map[string]expectation{
		"authentic": {kind: "fan", interval: 36, telegraph: 20, count: 3},
		"balanced":  {kind: "fan", interval: 30, telegraph: 12, count: 3},
		"retained":  {kind: "ring", interval: 27, telegraph: 16, count: 16},
	}
	for _, variant := range []string{"authentic", "balanced", "retained"} {
		t.Run(variant, func(t *testing.T) {
			config := base
			config.BossVariant = variant
			if err := normalizeConfig(&config); err != nil {
				t.Fatal(err)
			}
			sim := newSimulation(config)
			enemy := enemyEntity{id: 1, specIndex: 0, x: 1800, y: 1200, health: 300, maxHealth: 300}
			attack := currentEnemyAttack(enemy, config.Enemies[0], config.BossVariant)
			want := wants[variant]
			if attack.Kind != want.kind || attack.Interval != want.interval || attack.TelegraphTicks != want.telegraph {
				t.Fatalf("attack=%#v want kind=%s interval=%d telegraph=%d", attack, want.kind, want.interval, want.telegraph)
			}
			if attack.Damage >= 8 && attack.TelegraphTicks == 0 {
				t.Fatal("high-damage Boss attack has no telegraph")
			}
			enemy.fireClock = attack.Interval - 5
			intentTicks, intentTarget := sim.enemyIntent(enemy, config.Enemies[0], attack)
			if intentTicks != 5 {
				t.Fatalf("intent ticks=%d want=5", intentTicks)
			}
			if attack.Kind == "ring" {
				if intentTarget != (Vec{X: enemy.x, Y: enemy.y}) {
					t.Fatalf("ring intent target=%#v", intentTarget)
				}
			} else if intentTarget != (Vec{X: sim.playerX, Y: sim.playerY}) {
				t.Fatalf("aimed intent target=%#v player=%#v", intentTarget, Vec{X: sim.playerX, Y: sim.playerY})
			}
			sim.enemies = append(sim.enemies, enemy)
			sim.fireEnemyAttack(&sim.enemies[0], config.Enemies[0], attack, 0, 1000, 1000, attack.Interval)
			if len(sim.projectiles) != want.count {
				t.Fatalf("projectiles=%d want=%d", len(sim.projectiles), want.count)
			}
		})
	}
}

func TestEnemyPatternsProduceDistinctAttacks(t *testing.T) {
	tests := []struct {
		pattern     string
		projectiles int
		charges     bool
	}{
		{pattern: "sweeper", projectiles: 3},
		{pattern: "mine", projectiles: 8},
		{pattern: "orbiter", projectiles: 4},
		{pattern: "sniper", projectiles: 3},
		{pattern: "charger", charges: true},
	}
	for _, test := range tests {
		t.Run(test.pattern, func(t *testing.T) {
			config := testConfig()
			movement, attack := "chase", "aimed"
			switch test.pattern {
			case "sweeper":
				movement, attack = "strafe", "fan"
			case "mine":
				movement, attack = "stationary", "mine"
			case "orbiter":
				movement, attack = "orbit", "spiral"
			case "sniper":
				movement, attack = "flee", "fan"
			case "charger":
				movement, attack = "charge", "beam"
			}
			config.Enemies = []EnemySpec{{Slug: test.pattern, Kind: "normal", MaxHealth: 999, Speed: 8, ContactDamage: 4, Movement: MovementSpec{Kind: movement}, Attacks: []AttackSpec{{Kind: attack, Interval: 40, ProjectileSpeed: 24, Damage: 5}}}}
			if err := normalizeConfig(&config); err != nil {
				t.Fatal(err)
			}
			sim := newSimulation(config)
			sim.enemies = append(sim.enemies, enemyEntity{
				id: 1, specIndex: 0, x: 1800, y: 1200, health: 999, fireClock: 39,
			})
			before := sim.enemies[0].y
			sim.updateEnemies()
			if len(sim.projectiles) != test.projectiles {
				t.Fatalf("projectiles=%d, want %d", len(sim.projectiles), test.projectiles)
			}
			for _, projectile := range sim.projectiles {
				if projectile.pattern != test.pattern {
					t.Fatalf("projectile pattern=%q", projectile.pattern)
				}
			}
			if test.charges && sim.enemies[0].y-before < 800 {
				t.Fatalf("charger advanced only %d units", sim.enemies[0].y-before)
			}
		})
	}
}

func TestEliteConformanceVector(t *testing.T) {
	config := Config{
		Seed: "elite-conformance", Kind: "elite", DurationTicks: 1200, MaxTicks: 1500,
		SpawnInterval: 150, MaxAlive: 6, PlayerHealth: 100, PlayerMaxHealth: 100, EmergencyReconnectAvailable: true,
		Objective: ObjectiveConfig{Kind: "elite", Target: 1},
		Enemies: []EnemySpec{
			{Slug: "linked-elite", Kind: "elite", MaxHealth: 500, Speed: 0, Movement: MovementSpec{Kind: "stationary"}, Attacks: []AttackSpec{{Kind: "aimed", Interval: 1000, ProjectileSpeed: 20, Damage: 1}}, Traits: []TraitSpec{{Kind: "armored", Amount: 3}, {Kind: "linked_shield", Amount: 3, Value: "protector"}, {Kind: "death_split", Amount: 2, Value: "child"}}},
			{Slug: "protector", Kind: "normal", MaxHealth: 80, Speed: 0, Movement: MovementSpec{Kind: "stationary"}, Attacks: []AttackSpec{{Kind: "aimed", Interval: 1000, ProjectileSpeed: 20, Damage: 1}}},
			{Slug: "child", Kind: "normal", MaxHealth: 30, Speed: 0, Movement: MovementSpec{Kind: "stationary"}, Attacks: []AttackSpec{{Kind: "aimed", Interval: 1000, ProjectileSpeed: 20, Damage: 1}}},
		},
		Runtime: RuntimeConfig{Kit: "nana-route", Passive: "nana_route_chain", Resonance: "nana_route_chain", AttackDamage: 12, AttackInterval: 10, MoveSpeed: 42, WarpCooldown: 240, WarpDamage: 14, DistortionGain: 4, GrazeRadius: 310, ProjectileCount: 1, ProjectileSpeed: 100},
	}
	trace := encodedTrace(0x1c, 1500)
	result, err := Simulate(config, trace)
	if err != nil || !result.Won || result.Final.Objective.Progress != 1 || len(result.Final.Enemies) < 2 {
		t.Fatalf("result=%#v error=%v", result, err)
	}
}

func TestActionV2GoldenVectors(t *testing.T) {
	payload, err := os.ReadFile("testdata/action-v2-golden.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Version string `json:"version"`
		Vectors []struct {
			Name     string        `json:"name"`
			Config   Config        `json:"config"`
			Trace    InputTrace    `json:"trace"`
			Expected goldenSummary `json:"expected"`
		} `json:"vectors"`
		BossVariants struct {
			BaseVector string `json:"base_vector"`
			Vectors    []struct {
				Variant  string        `json:"variant"`
				Expected goldenSummary `json:"expected"`
			} `json:"vectors"`
		} `json:"boss_variants"`
	}
	if err := json.Unmarshal(payload, &fixture); err != nil {
		t.Fatal(err)
	}
	if fixture.Version != "action-v2" || len(fixture.Vectors) < 2 {
		t.Fatalf("invalid fixture header: version=%q vectors=%d", fixture.Version, len(fixture.Vectors))
	}
	for _, vector := range fixture.Vectors {
		t.Run(vector.Name, func(t *testing.T) {
			result, err := Simulate(vector.Config, vector.Trace)
			if err != nil {
				t.Fatal(err)
			}
			if got := summarizeResult(result); !reflect.DeepEqual(got, vector.Expected) {
				t.Fatalf("result summary=%#v want=%#v", got, vector.Expected)
			}
		})
	}
	var bossVector *struct {
		Name     string        `json:"name"`
		Config   Config        `json:"config"`
		Trace    InputTrace    `json:"trace"`
		Expected goldenSummary `json:"expected"`
	}
	for index := range fixture.Vectors {
		if fixture.Vectors[index].Name == fixture.BossVariants.BaseVector {
			bossVector = &fixture.Vectors[index]
			break
		}
	}
	if bossVector == nil || len(fixture.BossVariants.Vectors) != 3 {
		t.Fatal("Boss variant golden vectors are incomplete")
	}
	for _, vector := range fixture.BossVariants.Vectors {
		t.Run("boss-variant-"+vector.Variant, func(t *testing.T) {
			config := bossVector.Config
			config.BossVariant = vector.Variant
			result, err := Simulate(config, bossVector.Trace)
			if err != nil {
				t.Fatal(err)
			}
			if got := summarizeResult(result); !reflect.DeepEqual(got, vector.Expected) {
				t.Fatalf("result summary=%#v want=%#v", got, vector.Expected)
			}
		})
	}
}

func TestActionV2CharacterKitGoldenVectors(t *testing.T) {
	var fixture struct {
		Version string     `json:"version"`
		Trace   InputTrace `json:"trace"`
		Vectors []struct {
			Name     string        `json:"name"`
			Passive  string        `json:"passive"`
			Expected goldenSummary `json:"expected"`
		} `json:"vectors"`
	}
	payload, err := os.ReadFile("testdata/action-v2-kit-golden.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(payload, &fixture); err != nil || fixture.Version != "action-v2" {
		t.Fatalf("fixture version=%q error=%v", fixture.Version, err)
	}
	for _, vector := range fixture.Vectors {
		t.Run(vector.Name, func(t *testing.T) {
			config := Config{Seed: "kit-golden-" + vector.Passive, Kind: "tutorial", DurationTicks: 900, MaxTicks: 900, SpawnInterval: 90, MaxAlive: 4, PlayerHealth: 100, PlayerMaxHealth: 100,
				Objective: ObjectiveConfig{Kind: "recover", Target: 4},
				Enemies:   []EnemySpec{{Slug: "kit-dummy", Kind: "normal", MaxHealth: 999, Speed: 0, ContactDamage: 0, Movement: MovementSpec{Kind: "stationary"}, Attacks: []AttackSpec{{Kind: "aimed", Interval: 30, ProjectileSpeed: 20, Damage: 2}}}},
				Runtime:   RuntimeConfig{Kit: vector.Passive, Passive: vector.Passive, Resonance: vector.Passive, AttackDamage: 3, AttackInterval: 30, MoveSpeed: 42, WarpCooldown: 120, WarpDamage: 14, DistortionGain: 4, GrazeRadius: 310, ProjectileCount: 1, ProjectileSpeed: 100, Behaviors: []RuntimeBehavior{}},
			}
			result, err := Simulate(config, fixture.Trace)
			if err != nil {
				t.Fatal(err)
			}
			if got := summarizeResult(result); !reflect.DeepEqual(got, vector.Expected) {
				t.Fatalf("result summary=%#v want=%#v", got, vector.Expected)
			}
		})
	}
}

func TestSignalWeaveProducesFourProtocols(t *testing.T) {
	tests := []struct {
		name  string
		weave []SignalType
		want  Protocol
	}{{"surge", []SignalType{SurgeSignal, EchoSignal, SurgeSignal}, SurgeBreak}, {"guard", []SignalType{GuardSignal, GuardSignal, SurgeSignal}, GuardAegis}, {"echo", []SignalType{EchoSignal, GuardSignal, EchoSignal}, EchoReplay}, {"resonance", []SignalType{SurgeSignal, GuardSignal, EchoSignal}, ResonanceProtocol}}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := weaveProtocol(test.weave); got != test.want {
				t.Fatalf("protocol=%q want=%q", got, test.want)
			}
		})
	}
}

func TestBuildCoreStatsChangeAuthoritativeCombat(t *testing.T) {
	t.Run("distortion overload increases automatic attack damage", func(t *testing.T) {
		config := testConfig()
		config.Runtime.AttackDamage = 10
		config.Runtime.OverloadBonus = 40
		sim := newSimulation(config)
		sim.distortion = 60
		sim.attackClock = sim.playerAttackInterval() - 1
		sim.enemies = []enemyEntity{{id: 1, specIndex: 0, x: 1800, y: 1200, health: 100, maxHealth: 100}}
		sim.autoAttack()
		if sim.enemies[0].health != 86 {
			t.Fatalf("overload attack left health=%d, want 86", sim.enemies[0].health)
		}
	})

	t.Run("guard and echo protocols use resolved build stats", func(t *testing.T) {
		config := testConfig()
		config.Runtime.StartingShield = 6
		config.Runtime.ProtocolShield = 4
		config.Runtime.EchoPower = 10
		sim := newSimulation(config)
		sim.protocol = GuardAegis
		sim.projectiles = []projectileEntity{{id: 1, x: sim.playerX, y: sim.playerY - 200, damage: 4}}
		sim.activateProtocol(sim.playerX, sim.playerY, sim.playerX, sim.playerY-620)
		if sim.shield != 22 || len(sim.projectiles) != 0 || sim.invulnerable != 24 {
			t.Fatalf("guard result shield=%d projectiles=%d invulnerable=%d", sim.shield, len(sim.projectiles), sim.invulnerable)
		}

		sim.protocol = EchoReplay
		sim.enemies = []enemyEntity{{id: 1, specIndex: 0, x: sim.playerX, y: sim.playerY - 300, health: 100, maxHealth: 100}}
		sim.activateProtocol(sim.playerX, sim.playerY, sim.playerX, sim.playerY-620)
		if sim.enemies[0].health != 83 {
			t.Fatalf("echo replay left health=%d, want 83", sim.enemies[0].health)
		}
	})
}

func TestObjectiveDoesNotRewardWaiting(t *testing.T) {
	config := testConfig()
	config.Objective = ObjectiveConfig{Kind: "purge", Target: 99}
	config.MaxTicks = 130
	result, err := Simulate(config, encodedTrace(0, 130))
	if err != nil {
		t.Fatal(err)
	}
	if result.Won {
		t.Fatal("purge encounter completed without meeting its target")
	}
}

func TestActionV2BehaviorPrimitives(t *testing.T) {
	t.Run("projectile speed changes authoritative attack cadence", func(t *testing.T) {
		config := testConfig()
		config.Runtime.ProjectileSpeed = 200
		sim := newSimulation(config)
		sim.enemies = []enemyEntity{{id: 1, specIndex: 0, x: 1800, y: 1200, health: 100, maxHealth: 100}}
		for range 6 {
			sim.autoAttack()
		}
		if sim.enemies[0].health >= 100 || sim.playerAttackInterval() != 6 {
			t.Fatalf("health=%d interval=%d", sim.enemies[0].health, sim.playerAttackInterval())
		}
	})

	t.Run("stabilize counts whole seconds", func(t *testing.T) {
		sim := newSimulation(testConfig())
		sim.config.Objective = ObjectiveConfig{Kind: "stabilize", Target: 3}
		sim.playerX, sim.playerY = ArenaWidth/2, ArenaHeight/2
		for tick := 1; tick <= 60; tick++ {
			sim.tick = tick
			sim.updateObjective()
		}
		if sim.objectiveProgress != 2 {
			t.Fatalf("progress=%d want=2", sim.objectiveProgress)
		}
	})

	t.Run("signal decay removes the oldest signal", func(t *testing.T) {
		sim := newSimulation(testConfig())
		sim.config.Hazards = []string{"signal_decay"}
		sim.weave = []SignalType{SurgeSignal, GuardSignal}
		sim.routeStep, sim.lastSignalTick, sim.tick = 2, 10, 160
		sim.updateSignalDecay()
		if len(sim.weave) != 1 || sim.weave[0] != GuardSignal || sim.routeStep != 1 {
			t.Fatalf("weave=%v step=%d", sim.weave, sim.routeStep)
		}
	})

	t.Run("crossfire respects the projectile cap and cadence", func(t *testing.T) {
		sim := newSimulation(testConfig())
		sim.config.Hazards = []string{"crossfire"}
		sim.tick = 150
		sim.updateHazards()
		if len(sim.projectiles) != 2 || sim.projectiles[0].pattern != "crossfire" || sim.projectiles[0].vx <= 0 || sim.projectiles[1].vx >= 0 {
			t.Fatalf("crossfire=%#v", sim.projectiles)
		}
	})

	t.Run("authored attacks rotate", func(t *testing.T) {
		config := testConfig()
		config.Enemies = []EnemySpec{{Slug: "rotator", Kind: "elite", MaxHealth: 500, Movement: MovementSpec{Kind: "stationary"}, Attacks: []AttackSpec{{Kind: "aimed", Interval: 20, ProjectileSpeed: 20, Damage: 2}, {Kind: "ring", Interval: 20, ProjectileSpeed: 20, Damage: 2, Count: 8}}}}
		sim := newSimulation(config)
		sim.enemies = []enemyEntity{{id: 1, specIndex: 0, x: 1800, y: 1200, health: 500, maxHealth: 500, fireClock: 19}}
		sim.updateEnemies()
		if len(sim.projectiles) != 1 || sim.enemies[0].attackIndex != 1 {
			t.Fatalf("first attack projectiles=%d index=%d", len(sim.projectiles), sim.enemies[0].attackIndex)
		}
		sim.enemies[0].fireClock = 19
		sim.updateEnemies()
		if len(sim.projectiles) != 9 || sim.enemies[0].attackIndex != 2 {
			t.Fatalf("second attack projectiles=%d index=%d", len(sim.projectiles), sim.enemies[0].attackIndex)
		}
	})

	t.Run("elite objectives count defeated elites", func(t *testing.T) {
		config := testConfig()
		config.Objective = ObjectiveConfig{Kind: "elite", Target: 1}
		config.Enemies = []EnemySpec{{Slug: "elite-target", Kind: "elite", MaxHealth: 20, Movement: MovementSpec{Kind: "stationary"}, Attacks: []AttackSpec{{Kind: "aimed", Interval: 1000, ProjectileSpeed: 20, Damage: 1}}}}
		sim := newSimulation(config)
		sim.enemies = []enemyEntity{{id: 1, specIndex: 0, x: 1800, y: 1200, health: 0, maxHealth: 20}}
		sim.updateEnemies()
		sim.updateObjective()
		if sim.eliteKills != 1 || sim.objectiveProgress != 1 || !sim.objectiveComplete() {
			t.Fatalf("elite kills=%d progress=%d complete=%v", sim.eliteKills, sim.objectiveProgress, sim.objectiveComplete())
		}
	})

	t.Run("death split spawns the referenced child archetype", func(t *testing.T) {
		config := testConfig()
		config.MaxAlive = 4
		config.Enemies = []EnemySpec{
			{Slug: "carrier", Kind: "normal", MaxHealth: 40, Movement: MovementSpec{Kind: "stationary"}, Attacks: []AttackSpec{{Kind: "aimed", Interval: 1000, ProjectileSpeed: 20, Damage: 1}}, Traits: []TraitSpec{{Kind: "death_split", Amount: 2, Value: "drone"}}},
			{Slug: "drone", Kind: "normal", MaxHealth: 12, Movement: MovementSpec{Kind: "chase"}, Attacks: []AttackSpec{{Kind: "aimed", Interval: 1000, ProjectileSpeed: 20, Damage: 1}}},
		}
		sim := newSimulation(config)
		sim.enemies = []enemyEntity{{id: 1, specIndex: 0, x: 1800, y: 1200, health: 0, maxHealth: 40}}
		sim.updateEnemies()
		if len(sim.enemies) != 2 || sim.enemies[0].specIndex != 1 || sim.enemies[1].specIndex != 1 || sim.enemies[0].health != 6 || sim.enemies[1].health != 6 {
			t.Fatalf("split children=%#v", sim.enemies)
		}
	})
}

func TestAllSevenCharacterResonancesChangeAuthoritativeState(t *testing.T) {
	resonances := []string{"nana_route_chain", "diana_cheer_pulse", "ava_afterimage", "bella_perfect_warp", "lulu_convert_projectiles", "xingtong_signal_stance", "nailu_memory_bloom"}
	for _, resonance := range resonances {
		t.Run(resonance, func(t *testing.T) {
			config := testConfig()
			config.Runtime.Resonance = resonance
			sim := newSimulation(config)
			sim.health = 40
			sim.enemies = []enemyEntity{{id: 1, specIndex: 0, x: 1800, y: 1200, health: 100, maxHealth: 100}}
			sim.projectiles = []projectileEntity{{id: 1, x: 1000, y: 1000, damage: 2}}
			sim.signalWaypoints = append(sim.signalWaypoints, Vec{X: 1800, Y: 1200})
			sim.lastWarpStart, sim.lastWarpEnd, sim.hasLastWarp = Vec{X: 1800, Y: 5200}, Vec{X: 1800, Y: 4580}, true
			before := sim.snapshot()
			sim.activateResonance()
			if reflect.DeepEqual(sim.snapshot(), before) {
				t.Fatal("resonance made no authoritative state change")
			}
		})
	}
}

func TestCharacterKitMechanics(t *testing.T) {
	t.Run("Bella releases a homing tailwind inside the generous beat window", func(t *testing.T) {
		config := testConfig()
		config.Runtime.Passive = "bella_perfect_warp"
		config.Runtime.WarpDamage = 32
		sim := newSimulation(config)
		sim.tick = 155
		sim.warpReadyTick = 130
		sim.enemies = []enemyEntity{{id: 1, specIndex: 0, x: 600, y: 800, health: 100, maxHealth: 100}}
		sim.movePlayer(InputFrame{Direction: 0, Magnitude: 3, Skill: true})
		if len(sim.friendlyShots) != 1 || sim.shield != 5 || sim.invulnerable != 18 {
			t.Fatalf("perfect Warp friendly=%d shield=%d invulnerable=%d", len(sim.friendlyShots), sim.shield, sim.invulnerable)
		}
		for range friendlyShotLife {
			sim.updateKitEffects()
		}
		if sim.enemies[0].health != 92 {
			t.Fatalf("tailwind left enemy health=%d, want 92", sim.enemies[0].health)
		}

		late := newSimulation(config)
		late.tick = 100 + bellaPerfectWindowTicks + 1
		late.warpReadyTick = 100
		late.enemies = []enemyEntity{{id: 1, specIndex: 0, x: 600, y: 800, health: 100, maxHealth: 100}}
		late.movePlayer(InputFrame{Direction: 0, Magnitude: 3, Skill: true})
		if len(late.friendlyShots) != 0 || late.shield != 0 {
			t.Fatalf("late Warp received beat bonus: friendly=%d shield=%d", len(late.friendlyShots), late.shield)
		}
	})

	t.Run("Nana chains explosions through collected signal positions", func(t *testing.T) {
		config := testConfig()
		sim := newSimulation(config)
		sim.signalWaypoints = []Vec{{X: 600, Y: 1800}, {X: 1800, Y: 2400}, {X: 3000, Y: 1800}}
		sim.enemies = []enemyEntity{
			{id: 1, specIndex: 0, x: 600, y: 1800, health: 100, maxHealth: 100},
			{id: 2, specIndex: 0, x: 1800, y: 2400, health: 100, maxHealth: 100},
			{id: 3, specIndex: 0, x: 3000, y: 1800, health: 100, maxHealth: 100},
		}
		sim.projectiles = []projectileEntity{{id: 1, x: 600, y: 1800}, {id: 2, x: 3400, y: 5000}}
		sim.protocol = SurgeBreak
		sim.activateKitWarp(true)
		for _, enemy := range sim.enemies {
			if enemy.health >= 100 {
				t.Fatalf("waypoint enemy was not hit: %#v", enemy)
			}
		}
		if len(sim.projectiles) != 1 || sim.projectiles[0].id != 2 {
			t.Fatalf("projectiles after route chain = %#v", sim.projectiles)
		}
	})

	t.Run("Ava replays the latest Warp after a fixed delay", func(t *testing.T) {
		config := testConfig()
		config.Runtime.Passive = "ava_afterimage"
		config.Runtime.Resonance = "ava_afterimage"
		sim := newSimulation(config)
		sim.enemies = []enemyEntity{{id: 1, specIndex: 0, x: 1800, y: 4800, health: 100, maxHealth: 100}}
		sim.recordWarp(Vec{X: 1800, Y: 5200}, Vec{X: 1800, Y: 4400})
		sim.activateResonance()
		if len(sim.delayedWarps) != 1 || sim.delayedWarps[0].triggerTick != avaReplayDelayTicks {
			t.Fatalf("scheduled replays = %#v", sim.delayedWarps)
		}
		for sim.tick = 1; sim.tick < avaReplayDelayTicks; sim.tick++ {
			sim.updateKitEffects()
		}
		if sim.enemies[0].health != 100 {
			t.Fatalf("replay fired early, health=%d", sim.enemies[0].health)
		}
		sim.tick = avaReplayDelayTicks
		sim.updateKitEffects()
		if sim.enemies[0].health >= 100 || len(sim.delayedWarps) != 0 {
			t.Fatalf("replay did not resolve: health=%d pending=%d", sim.enemies[0].health, len(sim.delayedWarps))
		}
	})

	t.Run("Lulu converts grazed bullets only when Warp is released", func(t *testing.T) {
		config := testConfig()
		config.Runtime.Passive = "lulu_convert_projectiles"
		config.Runtime.Resonance = "lulu_convert_projectiles"
		sim := newSimulation(config)
		sim.enemies = []enemyEntity{{id: 7, specIndex: 0, x: sim.playerX + 900, y: sim.playerY, health: 100, maxHealth: 100}}
		sim.projectiles = []projectileEntity{{id: 1, x: sim.playerX + 250, y: sim.playerY, damage: 4}}
		sim.updateProjectiles()
		if len(sim.projectiles) != 1 || !sim.projectiles[0].glitchMarked || sim.enemies[0].health != 100 {
			t.Fatalf("graze should only mark: projectile=%#v health=%d", sim.projectiles, sim.enemies[0].health)
		}
		sim.activateKitWarp(false)
		if len(sim.projectiles) != 0 || len(sim.friendlyShots) != 1 {
			t.Fatalf("conversion hostile=%d friendly=%d", len(sim.projectiles), len(sim.friendlyShots))
		}
		for range 6 {
			sim.updateKitEffects()
		}
		if sim.enemies[0].health >= 100 || len(sim.friendlyShots) != 0 {
			t.Fatalf("glitch shot did not land: health=%d friendly=%d", sim.enemies[0].health, len(sim.friendlyShots))
		}
	})

	t.Run("Nailu detonates blooms into persistent clear zones", func(t *testing.T) {
		config := testConfig()
		config.Runtime.Passive = "nailu_memory_bloom"
		sim := newSimulation(config)
		bloom := Vec{X: 1400, Y: 3000}
		sim.plantBloom(bloom)
		sim.enemies = []enemyEntity{{id: 1, specIndex: 0, x: bloom.X + 200, y: bloom.Y, health: 100, maxHealth: 100}}
		sim.projectiles = []projectileEntity{{id: 1, x: bloom.X, y: bloom.Y}}
		sim.activateKitWarp(false)
		if len(sim.blooms) != 0 || len(sim.safeZones) != 1 || len(sim.projectiles) != 0 || sim.enemies[0].health >= 100 {
			t.Fatalf("bloom result blooms=%d zones=%d bullets=%d health=%d", len(sim.blooms), len(sim.safeZones), len(sim.projectiles), sim.enemies[0].health)
		}
		sim.projectiles = []projectileEntity{{id: 2, x: bloom.X, y: bloom.Y, delay: 5}}
		sim.updateProjectiles()
		if len(sim.projectiles) != 0 {
			t.Fatal("safe zone did not clear a delayed projectile")
		}
	})

	t.Run("kit entities participate in the authoritative snapshot", func(t *testing.T) {
		base := newSimulation(testConfig())
		changed := newSimulation(testConfig())
		changed.signalWaypoints = append(changed.signalWaypoints, Vec{X: 10, Y: 20})
		if reflect.DeepEqual(base.snapshot(), changed.snapshot()) {
			t.Fatal("signal waypoints were omitted from the authoritative snapshot")
		}
	})

	t.Run("authored module behaviors execute at deterministic hooks", func(t *testing.T) {
		config := testConfig()
		config.Runtime.Behaviors = []RuntimeBehavior{
			{SourceSlug: "lens", Level: 2, Kind: "warp_aftershock", Amount: 7},
			{SourceSlug: "guard", Level: 1, Kind: "graze_guard", Amount: 3, Every: 2},
			{SourceSlug: "echo", Level: 1, Kind: "protocol_echo", Amount: 5, Every: 2},
			{SourceSlug: "primer", Level: 1, Kind: "kill_signal", Amount: 1, Every: 4},
		}
		sim := newSimulation(config)
		sim.enemies = []enemyEntity{{id: 1, specIndex: 0, x: 1800, y: 4800, health: 100, maxHealth: 100}}
		sim.recordWarp(Vec{X: 1800, Y: 5200}, Vec{X: 1800, Y: 4400})
		if len(sim.delayedWarps) != 1 || sim.delayedWarps[0].triggerTick != 10 || sim.delayedWarps[0].damage != 7 {
			t.Fatalf("aftershock=%#v", sim.delayedWarps)
		}
		sim.onGraze()
		sim.onGraze()
		if sim.totalGrazes != 2 || sim.shield != 3 {
			t.Fatalf("grazes=%d shield=%d", sim.totalGrazes, sim.shield)
		}
		sim.protocols = 2
		sim.onProtocolComplete()
		if sim.enemies[0].health != 95 || sim.score != 25 {
			t.Fatalf("protocol echo health=%d score=%d", sim.enemies[0].health, sim.score)
		}
		for index := range sim.signalCooldown {
			sim.signalCooldown[index] = 45
		}
		sim.kills = 4
		sim.onEnemyKilled()
		if sim.signalCooldown[1] != 0 || sim.signalPulse != 12 {
			t.Fatalf("kill signal cooldowns=%v pulse=%d", sim.signalCooldown, sim.signalPulse)
		}
	})
}

func FuzzDecodeTrace(f *testing.F) {
	f.Add([]byte{0x10, 1}, 1)
	f.Add([]byte{0x80, 1}, 1)
	f.Fuzz(func(t *testing.T, raw []byte, ticks int) {
		if ticks < 1 || ticks > BossMaxTicks {
			ticks = 1
		}
		trace := InputTrace{Encoding: TraceEncodingRLE, Ticks: ticks, Data: base64.RawURLEncoding.EncodeToString(raw)}
		frames, err := DecodeTrace(trace, BossMaxTicks)
		if err == nil && len(frames) != ticks {
			t.Fatalf("decoded %d frames for %d ticks", len(frames), ticks)
		}
	})
}
