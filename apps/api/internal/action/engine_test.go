package action

import (
	"encoding/base64"
	"testing"
)

func encodedTrace(control byte, ticks int) InputTrace {
	raw := make([]byte, 0, ticks/255*2+2)
	remaining := ticks
	for remaining > 0 {
		count := min(255, remaining)
		raw = append(raw, control, byte(count))
		remaining -= count
	}
	return InputTrace{Encoding: TraceEncodingRLE, Ticks: ticks, Data: base64.RawStdEncoding.EncodeToString(raw)}
}

func testConfig() Config {
	return Config{Seed: "deterministic-seed", Kind: "normal", DurationTicks: 120, MaxTicks: 180,
		SpawnInterval: 90, MaxAlive: 4, PlayerHealth: 80, PlayerMaxHealth: 80, EmergencyReconnectAvailable: true,
		Enemies: []EnemySpec{{Slug: "dummy", Pattern: "turret", MaxHealth: 40, FireInterval: 1000, ProjectileSpeed: 20, ProjectileDamage: 4}},
		Buffs:   Buffs{AttackDamage: 8, AttackInterval: 12, MoveSpeed: 42, DashCooldown: 240, DistortionGain: 4}}
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
	if first.Digest != second.Digest || !first.Won {
		t.Fatalf("results differ: %#v %#v", first, second)
	}
	t.Logf("conformance digest: %s", first.Digest)
}

func TestTraceRejectsNonCanonicalControl(t *testing.T) {
	trace := InputTrace{Encoding: TraceEncodingRLE, Ticks: 1, Data: base64.RawStdEncoding.EncodeToString([]byte{0x80, 1})}
	if _, err := DecodeTrace(trace, 10); err != ErrInvalidTrace {
		t.Fatalf("error = %v", err)
	}
}

func TestClientDigestMustMatch(t *testing.T) {
	trace := encodedTrace(0, 120)
	trace.ClientDigest = "deadbeef"
	if _, err := Simulate(testConfig(), trace); err != ErrDigestMismatch {
		t.Fatalf("error = %v", err)
	}
}

func TestMovementHazardsRouteAndEmergencyReconnect(t *testing.T) {
	t.Run("dash grants invulnerability", func(t *testing.T) {
		sim := newSimulation(testConfig())
		sim.movePlayer(InputFrame{Direction: 0, Magnitude: 1, Skill: true})
		sim.projectiles = append(sim.projectiles, projectileEntity{x: sim.playerX, y: sim.playerY, damage: 10})
		sim.updateProjectiles()
		if sim.health != 80 || sim.invulnerable == 0 {
			t.Fatalf("health=%d invulnerable=%d", sim.health, sim.invulnerable)
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
		sim.dashClock = 120
		for range 3 {
			beacon := sim.activeBeacon()
			sim.playerX, sim.playerY = beacon.X, beacon.Y
			sim.collectBeacon()
		}
		if !sim.routeReady || sim.routes != 1 || sim.dashClock != 0 {
			t.Fatalf("ready=%v routes=%d cooldown=%d", sim.routeReady, sim.routes, sim.dashClock)
		}
		sim.config.Kind = "tutorial"
		won, finished := sim.step(InputFrame{Skill: true})
		if !won || !finished || !sim.routeWarpUsed {
			t.Fatalf("tutorial did not finish from its taught objective")
		}
	})

	t.Run("phase dash cuts bullets and damages enemies on its path", func(t *testing.T) {
		sim := newSimulation(testConfig())
		sim.enemies = append(sim.enemies, enemyEntity{id: 1, x: sim.playerX, y: sim.playerY - 300, health: 40})
		sim.projectiles = append(sim.projectiles, projectileEntity{x: sim.playerX, y: sim.playerY - 260, damage: 10})
		sim.movePlayer(InputFrame{Direction: 12, Magnitude: 3, Skill: true})
		if len(sim.projectiles) != 0 || sim.enemies[0].health >= 40 || sim.dashFX == 0 {
			t.Fatalf("projectiles=%d health=%d dashFX=%d", len(sim.projectiles), sim.enemies[0].health, sim.dashFX)
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
		if len(sim.projectiles) != 1 || sim.anchorPulse == 0 {
			t.Fatalf("projectiles=%d anchorPulse=%d", len(sim.projectiles), sim.anchorPulse)
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
	config.Enemies = []EnemySpec{{Slug: "optimal", Pattern: "boss", MaxHealth: 300, Speed: 5, ContactDamage: 8, FireInterval: 30, ProjectileSpeed: 30, ProjectileDamage: 6}}
	sim := newSimulation(config)
	sim.enemies = append(sim.enemies, enemyEntity{id: 1, x: 1800, y: 1200, health: 300, fireClock: 24})
	first := sim.snapshot().Enemies[0]
	if first.BossPhase != 1 || first.IntentTicks != 6 {
		t.Fatalf("phase one snapshot=%#v", first)
	}
	sim.config.Buffs.StartingShield = 8
	sim.enemies[0].health = 190
	second := sim.snapshot().Enemies[0]
	if second.BossPhase != 2 || second.BossMimic != "echo" {
		t.Fatalf("phase two snapshot=%#v", second)
	}
	sim.enemies[0].health = 90
	sim.fireBossVolley(&sim.enemies[0], config.Enemies[0], 0, 1000, 1000, 30)
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
			config.Enemies = []EnemySpec{{
				Slug: test.pattern, Pattern: test.pattern, MaxHealth: 999, Speed: 8,
				ContactDamage: 4, FireInterval: 40, ProjectileSpeed: 24, ProjectileDamage: 5,
			}}
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

func TestBossConformanceVector(t *testing.T) {
	config := Config{Seed: "boss-conformance", Kind: "boss", DurationTicks: 2700, MaxTicks: 2700, SpawnInterval: 300, MaxAlive: 4, PlayerHealth: 100, PlayerMaxHealth: 100, EmergencyReconnectAvailable: true,
		Enemies: []EnemySpec{{Slug: "optimal", Pattern: "boss", MaxHealth: 1050, Speed: 5, ContactDamage: 12, FireInterval: 24, ProjectileSpeed: 34, ProjectileDamage: 8}},
		Buffs:   Buffs{AttackDamage: 8, AttackInterval: 12, MoveSpeed: 42, DashCooldown: 240, DashDamage: 14, DistortionGain: 4}}
	result, err := Simulate(config, encodedTrace(0x10, 2700))
	if err != nil {
		t.Fatal(err)
	}
	if result.Digest != "f98b47f4" {
		t.Fatalf("boss conformance digest = %s", result.Digest)
	}
}

func FuzzDecodeTrace(f *testing.F) {
	f.Add([]byte{0x10, 1}, 1)
	f.Add([]byte{0x80, 1}, 1)
	f.Fuzz(func(t *testing.T, raw []byte, ticks int) {
		if ticks < 1 || ticks > BossMaxTicks {
			ticks = 1
		}
		trace := InputTrace{Encoding: TraceEncodingRLE, Ticks: ticks, Data: base64.RawStdEncoding.EncodeToString(raw)}
		frames, err := DecodeTrace(trace, BossMaxTicks)
		if err == nil && len(frames) != ticks {
			t.Fatalf("decoded %d frames for %d ticks", len(frames), ticks)
		}
	})
}
