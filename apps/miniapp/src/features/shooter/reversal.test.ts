import { describe, expect, it } from "vitest";
import { PLAYER_Y } from "@/features/shooter/constants";
import { addEnemyHazard, damagePlayer, removeDefeatedEnemies, updatePickups, updateProjectiles } from "@/features/shooter/enemies";
import { createShooterSimulationFromConfig } from "@/features/shooter/simulation";
import { activateRescue } from "@/features/shooter/specials";
import { addPlayerProjectile, createShooterRuntime } from "@/features/shooter/weapons";
import { breakReversalCore, reversalFanPhase, reversalHitbox, reversalThreats, spawnReversalGroups, updateReversalBoss, updateReversalChain, updateReversalEnemy, updateReversalFans, updateReversalWeapons } from "@/features/shooter/reversal";
import { sweptShooterHit } from "@/features/shooter/collision";
import type { ShooterEnemyEntity, ShooterMutableState } from "@/features/shooter/types";
import type { ShooterRuntimeConfig } from "@/lib/api/types";
import { v4Runtime } from "@/test/v4-fixtures";
import demo from "../../../public/game/v4/demo/demo-v3.en.json";

const config = (overrides: Partial<ShooterRuntimeConfig> = {}): ShooterRuntimeConfig => ({
  ...v4Runtime, duration_ticks: 1_200, wave: { ...v4Runtime.wave, spawns: [] },
  reversal: { weapon: "single", groups: [{ at_tick: 240, group_id: 10, x: 1_800, escorts: 1 }] },
  ...overrides,
});

const state = (overrides: Partial<ShooterRuntimeConfig> = {}): ShooterMutableState => {
  const runtime = createShooterRuntime(config(overrides));
  return {
    config: runtime.config, runtime: runtime.resolved, random: { integer: () => 0 },
    tick: 241, playerX: 1_800, health: 3, shield: 0, invulnerableTicks: 0,
    rescueCharge: 0, rescueHeld: false, rescuesUsed: 0, grazeCount: 0, combo: 0, comboClock: 0,
    kills: 0, score: 0, attackClock: 0, attackSequence: 0, alignmentTicks: 0,
    companionClocks: [], companionSignals: [], companionPending: [], nextEnemyID: 0, nextProjectileID: 0, nextPickupID: 0,
    nextEffectID: 0, spawnedBoss: false,
    dailyVariant: "", enemies: [], enemyProjectiles: [], playerProjectiles: [], pickups: [],
    pickupsCollected: 0, pickupPower: null, pickupPowerTicks: 0,
    pressureQuietTicks: 0, effects: [], reversal: { breaks: 0, chain: [], fans: [] },
  };
};

const target = (id: number, overrides: Partial<ShooterEnemyEntity> = {}): ShooterEnemyEntity => ({
  id, specIndex: 0, x: 1_800, y: 1_150, health: 100, maxHealth: 100,
  fireClock: 0, age: 0, phase: 0, warning: 0, volley: 0, marks: 0, boss: false,
  role: "controller", groupID: id, exposed: false, disabledTicks: 0, coreHealth: 32,
  ...overrides,
});

describe("opt-in bullet reversal demo", () => {
  it("auto-advances a cleared final formation without Rescue, but waits through authored gaps", () => {
    const game = createShooterSimulationFromConfig(config({ reversal: { weapon: "single", groups: [
      { at_tick: 0, group_id: 1, x: 1_800, escorts: 0 },
      { at_tick: 240, group_id: 2, x: 1_800, escorts: 0 },
      { at_tick: 480, group_id: 3, x: 1_800, escorts: 0 },
    ] } }));
    for (let tick = 0; tick < 480; tick += 1) {
      game.step({ x: 64, rescue: false });
      expect(game.result()).toBeNull();
    }
    for (let tick = 480; tick < 900 && !game.result(); tick += 1) game.step({ x: 64, rescue: false });
    expect(game.result()).toMatchObject({ won: true, rescues_used: 0 });
    expect(game.result()!.ticks).toBeLessThan(1_200);
    expect(game.result()!.final.reversal!.breaks).toBe(3);
    expect(game.result()!.final.enemy_projectiles).toHaveLength(0);
  });

  it("the generated opening reverses a visible owned salvo when the first control machine is aimed at", () => {
    const game = createShooterSimulationFromConfig(demo.wave.runtime_config as ShooterRuntimeConfig);
    let ownedSalvoSeen = false, reversedSalvo = false;
    for (let tick = 0; tick < 300; tick += 1) {
      const before = game.snapshot();
      const owned = before.enemy_projectiles.filter((bullet) => bullet.group_id === 1).length;
      if (owned > 0) ownedSalvoSeen = true;
      game.step({ x: 64, rescue: false });
      const after = game.snapshot();
      if (owned > 0 && after.enemy_projectiles.every((bullet) => bullet.group_id !== 1) && after.effects.some((effect) => effect.kind === "core_break")) reversedSalvo = true;
    }
    expect(ownedSalvoSeen).toBe(true);
    expect(reversedSalvo).toBe(true);
  });

  it.each(demo.options)("the generated $name Boss can be beaten through aiming, dodging, and rescue", (option) => {
    const runtime = option.boss.runtime_config as ShooterRuntimeConfig;
    const game = createShooterSimulationFromConfig(runtime);
    for (let tick = 0; tick < runtime.duration_ticks && !game.result(); tick += 1) {
      const current = game.snapshot();
      const targetEnemy = current.enemies.find((enemy) => enemy.role === "arm" && enemy.health > 0) ?? current.enemies.find((enemy) => enemy.boss);
      const support = current.pickups.find((pickup) => pickup.position.y > PLAYER_Y - 1_200);
      let x = support?.position.x ?? targetEnemy?.position.x ?? 1_800;
      for (const bullet of current.enemy_projectiles) {
        if (bullet.position.y < PLAYER_Y - 650 || bullet.position.y > PLAYER_Y + 200) continue;
        const half = (bullet.width ?? 0) / 2 + 200;
        if (Math.abs(x - bullet.position.x) < half) x = bullet.position.x < 1_800 ? bullet.position.x + half + 60 : bullet.position.x - half - 60;
      }
      const columns = Math.round((x - (1_800 - runtime.kit.move_limit)) * 127 / (runtime.kit.move_limit * 2));
      game.step({ x: Math.max(0, Math.min(127, columns)), rescue: current.rescue_charge >= 100 });
    }
    expect(game.result()).toMatchObject({ won: true });
    expect(game.result()!.ticks).toBeLessThan(1_350);
    expect(game.result()!.health).toBeGreaterThan(0);
  });

  it("completes with living side controllers and cannot advance a defeated Boss even before result is read", () => {
    const runtime = demo.options[0]!.boss.runtime_config as ShooterRuntimeConfig;
    const game = createShooterSimulationFromConfig({
      ...runtime, boss: { ...runtime.boss!, health: 200 },
      kit: { ...runtime.kit, attack_damage: 12 },
    });
    for (let tick = 0; tick < 500; tick += 1) {
      game.step({ x: 64, rescue: false });
      if (game.snapshot().enemies.some((enemy) => enemy.boss && enemy.health === 0)) break;
    }
    const defeated = game.snapshot();
    expect(defeated.enemies.some((enemy) => enemy.boss && enemy.health === 0)).toBe(true);
    expect(defeated.enemies.some((enemy) => enemy.role === "arm" && enemy.health > 0)).toBe(true);
    game.step({ x: 0, rescue: true });
    expect(game.snapshot()).toEqual(defeated);
    expect(game.result()).toMatchObject({ won: true });
    const completed = game.snapshot();
    for (let tick = 0; tick < 10; tick += 1) game.step({ x: 127, rescue: true });
    expect(game.snapshot()).toEqual(completed);
  });

  it("reports zero health as a stable failure and a living Boss at timeout as a loss", () => {
    const dead = createShooterSimulationFromConfig(config({ player_health: 0 }));
    const initial = dead.snapshot();
    dead.step({ x: 0, rescue: true });
    expect(dead.snapshot()).toEqual(initial);
    expect(dead.result()).toMatchObject({ won: false, health: 0, ticks: 0 });
    const runtime = demo.options[0]!.boss.runtime_config as ShooterRuntimeConfig;
    const timeout = createShooterSimulationFromConfig({ ...runtime, duration_ticks: 1 });
    timeout.step({ x: 0, rescue: false });
    expect(timeout.result()).toMatchObject({ won: false, ticks: 1 });
    const final = timeout.snapshot();
    timeout.step({ x: 127, rescue: true });
    expect(timeout.snapshot()).toEqual(final);
  });

  it("keeps support active for exactly the next 360 simulation ticks, including shots on the last tick", () => {
    const game = createShooterSimulationFromConfig(config({ reversal: {
      weapon: "single", groups: [{ at_tick: 0, group_id: 1, x: 1_800, escorts: 0 }, { at_tick: 700, group_id: 2, x: 1_800, escorts: 0 }],
    } }));
    for (let tick = 0; tick < 400 && !game.snapshot().pickup_power; tick += 1) game.step({ x: 64, rescue: false });
    expect(game.snapshot().pickup_power_ticks).toBe(360);
    for (let tick = 0; tick < 359; tick += 1) game.step({ x: 64, rescue: false });
    expect(game.snapshot().pickup_power_ticks).toBe(1);
    game.step({ x: 64, rescue: false });
    expect(game.snapshot().pickup_power).toBeUndefined();
  });

  it("places reversed support on a reachable lane with time to catch it", () => {
    const game = createShooterSimulationFromConfig(demo.wave.runtime_config as ShooterRuntimeConfig);
    let convertedID = -1;
    for (let tick = 0; tick < 300; tick += 1) {
      const before = game.snapshot();
      game.step({ x: 64, rescue: false });
      const after = game.snapshot();
      if ((after.reversal?.breaks ?? 0) > (before.reversal?.breaks ?? 0)) {
        const converted = after.pickups.find((pickup) => !before.pickups.some((old) => old.id === pickup.id));
        expect(converted).toBeDefined();
        expect(converted!.position.y).toBeLessThan(PLAYER_Y - 200);
        convertedID = converted!.id;
        break;
      }
    }
    expect(convertedID).toBeGreaterThan(0);
    let caught = false;
    for (let tick = 0; tick < 100; tick += 1) {
      const before = game.snapshot();
      const pickup = before.pickups.find((item) => item.id === convertedID);
      if (!pickup) break;
      const x = Math.round((pickup.position.x - 280) * 127 / 3_040);
      game.step({ x: Math.max(0, Math.min(127, x)), rescue: false });
      const after = game.snapshot();
      if (!after.pickups.some((item) => item.id === convertedID) && after.pickup_power === "support") caught = true;
    }
    expect(caught).toBe(true);
  });

  it("runs only authored formations, without late-pressure filler", () => {
    const empty = createShooterSimulationFromConfig(config({ reversal: { weapon: "single", groups: [] } }));
    for (let tick = 0; tick < 1_200; tick += 1) empty.step({ x: 64, rescue: false });
    expect(empty.snapshot().enemies).toEqual([]);
    expect(empty.result()).toMatchObject({ won: true, ticks: 1_200 });
    const game = state();
    spawnReversalGroups(game);
    expect(game.enemies.map((enemy) => [enemy.groupID, enemy.role])).toEqual([[10, "controller"], [10, "escort"]]);
  });

  it("opens the hatch for 60 ticks before firing and holds position", () => {
    const game = state(); const enemy = target(1);
    game.enemies = [enemy];
    for (let tick = 0; tick < 29; tick += 1) updateReversalEnemy(game, enemy);
    expect(enemy.exposed).toBe(false);
    for (let tick = 0; tick < 60; tick += 1) {
      updateReversalEnemy(game, enemy);
      expect(enemy.exposed).toBe(true);
      expect(enemy.x).toBe(1_800);
    }
    expect(reversalThreats(game)).toHaveLength(3);
    updateReversalEnemy(game, enemy);
    expect(enemy.exposed).toBe(false);
    expect(game.enemyProjectiles).toHaveLength(3);
    expect(game.enemyProjectiles.every((bullet) => bullet.groupID === 1)).toBe(true);
  });

  it.each([
    ["controller", 0], ["arm", 0], ["escort", 0], ["boss", 1], ["boss", 2], ["boss", 3],
  ] as const)("warns every actual %s phase %i projectile path from its own muzzle", (role, phase) => {
    const game = state();
    const enemy = target(1, {
      role, boss: role === "boss", phase, y: role === "escort" ? 1_600 : 1_150,
      health: phase === 2 ? 55 : phase === 3 ? 20 : 90, maxHealth: 100,
      fireClock: role === "boss" ? 74 : role === "escort" ? 124 : 89, aimX: 2_700,
    });
    game.enemies = [enemy];
    const warnings = reversalThreats(game);
    if (enemy.boss) updateReversalBoss(game, enemy);
    else updateReversalEnemy(game, enemy);
    expect(warnings).toHaveLength(game.enemyProjectiles.length);
    expect(warnings.length).toBe(role === "escort" || phase === 1 ? 1 : 3);
    game.enemyProjectiles.forEach((shot, index) => {
      const warning = warnings[index]!;
      expect(warning.origin).toEqual({ x: shot.x, y: shot.y });
      const travel = (PLAYER_Y - shot.y) / shot.vy;
      expect(warning.target).toEqual({ x: shot.x + shot.vx * travel, y: PLAYER_Y });
      expect(warning.width).toBe(shot.width || shot.radius * 2);
    });
  });

  it("converts only the defeated controller's bullets and caps support at six", () => {
    const game = state({ limits: { ...v4Runtime.limits, pickups: 6 } });
    const core = target(1), escort = target(2, { role: "escort", groupID: 1 });
    game.enemies = [core, escort, target(3)];
    for (let index = 0; index < 12; index += 1) addEnemyHazard(game, "reversal_shard", 1_200, 2_000, 0, 50, 1, 40, 0, 0, 1);
    addEnemyHazard(game, "reversal_shard", 2_500, 2_000, 0, 50, 1, 40, 0, 0, 3);
    breakReversalCore(game, core);
    expect(game.enemyProjectiles).toHaveLength(1);
    expect(game.enemyProjectiles[0]!.groupID).toBe(3);
    expect(game.pickups).toHaveLength(6);
    expect(game.pickups.every((pickup) => pickup.kind === "support")).toBe(true);
    expect(escort.disabledTicks).toBe(75);
    expect(game.enemies[2]!.disabledTicks).toBe(0);
    breakReversalCore(game, core);
    expect(game.reversal!.breaks).toBe(1);
    expect(game.pickups).toHaveLength(6);
  });

  it("removes converted bullets before the same tick can hit the player", () => {
    const game = state(); const core = target(1, { health: 1 }); game.enemies = [core];
    addEnemyHazard(game, "reversal_shard", game.playerX, PLAYER_Y - 50, 0, 50, 1, 40, 0, 0, 1);
    addPlayerProjectile(game, { x: core.x, y: core.y + 300, vy: -390, damage: 10 });
    updateProjectiles(game);
    expect(game.health).toBe(3);
    expect(game.enemyProjectiles).toHaveLength(0);
  });

  it("supports closed-body damage and rewards an aligned exposed core", () => {
    const game = state(); const closed = target(1); game.enemies = [closed];
    addPlayerProjectile(game, { x: 1_800, y: 1_500, vy: -390, damage: 10 });
    updateProjectiles(game);
    expect(closed.health).toBe(90);
    closed.exposed = true;
    addPlayerProjectile(game, { x: 1_800, y: 1_500, vy: -390, damage: 10 });
    updateProjectiles(game);
    expect(closed.health).toBe(70);
    expect(closed.coreHealth).toBe(12);
  });

  it("uses swept body collision, excludes transparent tips, and never hits twice with one piercing shot", () => {
    expect(sweptShooterHit(1_800, 1_600, 1_800, 300, 1_800, 1_000, 190, 80)).not.toBeNull();
    expect(sweptShooterHit(2_050, 1_600, 2_050, 300, 1_800, 1_000, 190, 80)).toBeNull();
    const game = state();
    const first = target(1, { role: "escort", y: 1_100 }), second = target(2, { role: "escort", y: 900 });
    game.enemies = [second, first];
    addPlayerProjectile(game, { x: 1_800, y: 1_500, vy: -500, damage: 10, pierce: 14 });
    updateProjectiles(game); updateProjectiles(game);
    expect(first.health).toBe(90); expect(second.health).toBe(90);
    expect(reversalHitbox(target(3, { role: "boss" })).width).toBeGreaterThan(600);
  });

  it("consumes a normal shot at the nearest body even when entity order is reversed", () => {
    const game = state(); const far = target(1, { y: 900 }), near = target(2, { y: 1_200 });
    game.enemies = [far, near];
    addPlayerProjectile(game, { x: 1_800, y: 1_600, vy: -900, damage: 10 });
    updateProjectiles(game);
    expect(far.health).toBe(100); expect(near.health).toBe(90);
    expect(game.playerProjectiles).toHaveLength(0);
  });

  it("awards only one break and one kill when simultaneous shots finish a core", () => {
    const game = state(); game.enemies = [target(1, { health: 1 })];
    for (let index = 0; index < 3; index += 1) addPlayerProjectile(game, { x: 1_800, y: 1_500, vy: -390, damage: 10 });
    updateProjectiles(game); removeDefeatedEnemies(game); removeDefeatedEnemies(game);
    expect(game.reversal!.breaks).toBe(1); expect(game.kills).toBe(1);
  });

  it("extends support by twelve seconds without changing the selected weapon", () => {
    const game = state(); game.pickups = [{ id: 1, x: game.playerX, y: PLAYER_Y - 70, value: 12, kind: "support" }];
    updatePickups(game);
    expect(game.pickupPowerTicks).toBe(360); expect(game.rescueCharge).toBe(12);
    game.pickupPowerTicks = 220;
    game.pickups = [{ id: 2, x: game.playerX, y: PLAYER_Y - 70, value: 12, kind: "support" }];
    updatePickups(game);
    expect(game.pickupPowerTicks).toBe(580); expect(game.config.reversal!.weapon).toBe("single");
  });

  it.each(["single", "twin", "pierce"] as const)("visibly enhances %s without permanent levels", (weapon) => {
    const game = state({ reversal: { weapon, groups: [] } });
    game.attackClock = game.runtime.fireInterval;
    updateReversalWeapons(game);
    const initial = game.playerProjectiles.length;
    const initialRadius = game.playerProjectiles[0]!.radius;
    game.playerProjectiles = []; game.attackClock = game.runtime.fireInterval;
    game.pickupPower = "support"; game.pickupPowerTicks = 240;
    updateReversalWeapons(game);
    if (weapon === "pierce") {
      expect(game.playerProjectiles[0]!.radius).toBeGreaterThan(initialRadius);
      expect(game.playerProjectiles[0]!.pierce).toBe(14);
    } else expect(game.playerProjectiles).toHaveLength(initial + 1);
    expect(game.playerProjectiles[0]!.vy).toBe(-390);
  });

  it("clears danger immediately and detonates marked targets in sequence within 18 ticks", () => {
    const game = state(); game.rescueCharge = 100;
    game.enemies = [target(1, { marks: 1, health: 500 }), target(2, { marks: 3, health: 500 }), target(3, { health: 500 })];
    addEnemyHazard(game, "reversal_shard", 1_800, PLAYER_Y, 0, 0, 1, 40, 0, 0, 1);
    expect(activateRescue(game)).toBe(true); expect(game.enemyProjectiles).toHaveLength(0);
    expect(game.enemies[0]!.health).toBe(500);
    expect(game.enemies[2]!.health).toBeLessThan(500);
    game.tick += 1; updateReversalChain(game);
    expect(game.enemies[0]!.health).toBeLessThan(500);
    expect(game.enemies[1]!.health).toBe(500);
    game.tick += 17; updateReversalChain(game);
    expect(game.enemies[1]!.health).toBeLessThan(500);
    expect(game.reversal!.chain).toEqual([]);
  });

  it("caps shield at one and still allows death", () => {
    const game = state({ kit: { ...v4Runtime.kit, starting_shield: 20 }, show_effects: [{ kind: "guard_on_special", amount: 10 }] });
    expect(game.runtime.startingShield).toBe(1);
    game.rescueCharge = 100; activateRescue(game); expect(game.shield).toBe(1);
    for (let hit = 0; hit < 4; hit += 1) { game.invulnerableTicks = 0; damagePlayer(game, 1); }
    expect(game.health).toBe(0);
  });

  it("locks copied aim before release and opens breakable side controllers in phase three", () => {
    const game = state(); const boss = target(1, { boss: true, role: "boss", health: 500, maxHealth: 900 });
    game.enemies = [boss];
    for (let tick = 0; tick < 30; tick += 1) updateReversalBoss(game, boss);
    const aimed = boss.aimX; game.playerX = 3_000;
    for (let tick = 0; tick < 44; tick += 1) updateReversalBoss(game, boss);
    expect(reversalThreats(game)[1]!.target.x).toBeCloseTo(aimed!, -2);
    updateReversalBoss(game, boss);
    expect(game.enemyProjectiles.every((bullet) => bullet.kind === "reversal_echo")).toBe(true);
    boss.health = 250; updateReversalBoss(game, boss);
    expect(game.enemies.filter((enemy) => enemy.role === "arm")).toHaveLength(2);
    expect(new Set(game.enemies.filter((enemy) => enemy.role === "arm").map((enemy) => enemy.groupID)).size).toBe(2);
  });

  it("closes the Boss hatch after a break instead of farming another break in the same exposure", () => {
    const game = state();
    const boss = target(1, { boss: true, role: "boss", phase: 1, groupID: 1_000, fireClock: 80, broken: true, disabledTicks: 1, exposed: true });
    game.enemies = [boss];
    updateReversalBoss(game, boss);
    expect(boss).toMatchObject({ fireClock: 0, broken: false, disabledTicks: 0, exposed: false, coreHealth: 44 });
    updateReversalBoss(game, boss);
    expect(boss.exposed).toBe(false);
  });

  it("preserves the original campaign snapshot shape without opt-in config", () => {
    const simulation = createShooterSimulationFromConfig(v4Runtime);
    simulation.step({ x: 64, rescue: false });
    expect(simulation.snapshot()).not.toHaveProperty("reversal");
    expect(simulation.snapshot().enemies[0]).not.toHaveProperty("role");
  });
});

describe("temporary robot fans", () => {
  it("the first real controller becomes a visible joining fan immediately", () => {
    const game = createShooterSimulationFromConfig(demo.wave.runtime_config as ShooterRuntimeConfig);
    let joined = false;
    for (let tick = 0; tick < 300; tick += 1) {
      game.step({ x: 64, rescue: false });
      const snapshot = game.snapshot();
      if (snapshot.reversal!.breaks > 0) {
        expect(snapshot.reversal!.fans).toHaveLength(1);
        expect(snapshot.reversal!.fans[0]).toMatchObject({ phase: "joining", age: 0 });
        expect(snapshot.enemies.find((enemy) => enemy.id === snapshot.reversal!.fans[0]!.id)?.health).toBe(0);
        joined = true;
        break;
      }
    }
    expect(joined).toBe(true);
  });

  it("emits the normal enemy-hit event when the first fan helps against the remaining escort", () => {
    const game = createShooterSimulationFromConfig({ ...demo.wave.runtime_config, reversal: { weapon: "single", groups: [{ at_tick: 240, group_id: 3, x: 1800, escorts: 1 }] } } as ShooterRuntimeConfig);
    for (let tick = 0; tick < 450 && game.snapshot().reversal!.fans.length === 0; tick += 1) game.step({ x: 64, rescue: false });
    const escortID = game.snapshot().enemies.find((enemy) => enemy.role === "escort" && enemy.health > 0)!.id;
    let fanHitReported = false;
    for (let tick = 0; tick < 60; tick += 1) {
      const previousHealth = game.snapshot().enemies.find((enemy) => enemy.id === escortID)?.health;
      const events = game.step({ x: 127, rescue: false });
      const health = game.snapshot().enemies.find((enemy) => enemy.id === escortID)?.health;
      if (previousHealth !== undefined && health === previousHealth - 2 && events.enemyHitIDs.includes(escortID)) fanHitReported = true;
    }
    expect(fanHitReported).toBe(true);
  });

  it("guarantees a fan even if pickup and cosmetic budgets are full, without duplicate core recruits", () => {
    const game = state(); const core = target(1, { health: 0 }); game.enemies = [core];
    for (let index = 0; index < game.config.limits.pickups; index += 1) game.pickups.push({ id: index, x: 0, y: 0, kind: "support", value: 1 });
    for (let index = 0; index < game.config.limits.effects; index += 1) game.effects.push({ id: index, x: 0, y: 0, ticks: 10, power: 1, kind: "reversal_flip" });
    for (let call = 0; call < 3; call += 1) breakReversalCore(game, core);
    removeDefeatedEnemies(game);
    expect(game.reversal!.fans).toHaveLength(1);
    expect(game.reversal!.fans[0]!.id).toBe(core.id);
    expect(game.enemies).toHaveLength(0);
    expect(game.kills).toBe(1);
    expect(game.reversal!.breaks).toBe(1);
  });

  it("keeps at most two temporary fans on opposite sides and never recruits the still-hostile Boss", () => {
    const game = state();
    for (let id = 1; id <= 3; id += 1) breakReversalCore(game, target(id, { health: 0 }));
    expect(game.reversal!.fans.map((fan) => fan.id)).toEqual([2, 3]);
    expect(new Set(game.reversal!.fans.map((fan) => fan.side)).size).toBe(2);
    breakReversalCore(game, target(4, { boss: true, role: "boss" }));
    expect(game.reversal!.fans.map((fan) => fan.id)).toEqual([2, 3]);
  });

  it("fires bounded friendly shots that actually damage a surviving enemy", () => {
    const game = state(); const core = target(1, { health: 0 }), remaining = target(2, { role: "escort", x: 1_280, y: 1_600 });
    game.enemies = [core, remaining];
    breakReversalCore(game, core); removeDefeatedEnemies(game);
    for (let tick = 0; tick < 30; tick += 1) updateReversalFans(game);
    const fan = game.reversal!.fans[0]!;
    expect(fan).toMatchObject({ x: 420, y: 3_900, age: 30, attackTicks: 6 });
    expect(game.playerProjectiles).toHaveLength(1);
    expect(game.playerProjectiles[0]).toMatchObject({ hostile: false, kind: "reversal_fan", damage: 2 });
    expect(game.enemyProjectiles).toHaveLength(0);
    for (let tick = 0; tick < 20; tick += 1) updateProjectiles(game);
    expect(remaining.health).toBe(98);
    expect(game.health).toBe(3);
    expect(game.enemies.some((enemy) => enemy.id === fan.id)).toBe(false);
    const capped = state({ limits: { ...v4Runtime.limits, player_projectiles: 0 } });
    capped.enemies = [remaining]; breakReversalCore(capped, target(3, { health: 0 }));
    for (let tick = 0; tick < 60; tick += 1) updateReversalFans(capped);
    expect(capped.playerProjectiles).toHaveLength(0);
  });

  it("does not fire without a live target, waves without shooting, and leaves after six seconds", () => {
    const game = state(); breakReversalCore(game, target(1, { health: 0 }));
    for (let tick = 0; tick < 149; tick += 1) updateReversalFans(game);
    expect(game.reversal!.fans).toHaveLength(1);
    expect(reversalFanPhase(game.reversal!.fans[0]!.age)).toBe("cheering");
    expect(game.playerProjectiles).toHaveLength(0);
    game.enemies = [target(2)];
    for (let tick = 0; tick < 30; tick += 1) updateReversalFans(game);
    expect(reversalFanPhase(game.reversal!.fans[0]!.age)).toBe("leaving");
    expect(game.playerProjectiles).toHaveLength(0);
    updateReversalFans(game);
    expect(game.reversal!.fans).toEqual([]);
    expect(game.health).toBe(3);
  });

  it("does nothing for a campaign state without the optional demo subsystem", () => {
    const game = state(); delete game.reversal;
    const before = { enemies: game.enemies, shots: game.playerProjectiles, health: game.health };
    updateReversalFans(game);
    expect(game.reversal).toBeUndefined();
    expect({ enemies: game.enemies, shots: game.playerProjectiles, health: game.health }).toEqual(before);
  });
});
