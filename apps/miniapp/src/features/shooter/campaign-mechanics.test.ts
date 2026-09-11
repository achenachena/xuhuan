import { describe, expect, it } from "vitest";
import shared from "../../../../api/internal/content/v4/shared.json";
import nanaChapter from "../../../../api/internal/content/v4/chapters/seventh-dock.json";
import dianaChapter from "../../../../api/internal/content/v4/chapters/always-cheerful.json";
import avaChapter from "../../../../api/internal/content/v4/chapters/loss-hidden.json";
import bellaChapter from "../../../../api/internal/content/v4/chapters/captains-do-not-rest.json";
import luluChapter from "../../../../api/internal/content/v4/chapters/localization-failed.json";
import xingtongChapter from "../../../../api/internal/content/v4/chapters/which-is-original.json";
import nailuChapter from "../../../../api/internal/content/v4/chapters/laplace-florist.json";
import finaleChapter from "../../../../api/internal/content/v4/chapters/zero-channel.json";
import { PLAYER_Y } from "@/features/shooter/constants";
import { addEnemyHazard, damagePlayer, fireEnemy, moveEnemy, threatSnapshots, updateKitPassives, updatePickups, updateProjectiles } from "@/features/shooter/enemies";
import { createShooterSimulationFromConfig } from "@/features/shooter/simulation";
import { activateRescue } from "@/features/shooter/specials";
import { addPlayerProjectile, createShooterRuntime, grantShooterShield, updateCompanions, updateWeapons } from "@/features/shooter/weapons";
import type { ShooterEnemyEntity, ShooterMutableState } from "@/features/shooter/types";
import type { ShooterRuntimeConfig } from "@/lib/api/types";
import { v4Runtime } from "@/test/v4-fixtures";

const characterConfig = (id: string): ShooterRuntimeConfig => {
  const character = shared.characters.find((item) => item.id === id)!;
  return {
    ...v4Runtime, duration_ticks: 900, wave: { ...v4Runtime.wave, spawns: [] },
    kit: { ...v4Runtime.kit, id: id as ShooterRuntimeConfig["kit"]["id"], max_health: 3,
      attack_damage: character.base_stats.shot_damage, fire_interval: character.base_stats.shot_interval,
      move_limit: character.base_stats.move_limit,
      rescue_damage: character.special.power, special_behavior: character.special.behavior as ShooterRuntimeConfig["kit"]["special_behavior"],
      special_duration: character.special.duration_ticks,
    },
  };
};

const companionConfig = (companion: typeof shared.companions[number]): ShooterRuntimeConfig["companions"][number] => ({
  id: companion.id as ShooterRuntimeConfig["companions"][number]["id"], ...companion.assist,
  trigger: companion.assist.trigger as ShooterRuntimeConfig["companions"][number]["trigger"],
  behavior: companion.assist.behavior as ShooterRuntimeConfig["companions"][number]["behavior"],
});

const createState = (config = characterConfig("nana7mi")): ShooterMutableState => {
  const runtime = createShooterRuntime(config);
  return {
    config, runtime: runtime.resolved, random: { integer: () => 0 },
    tick: 1, playerX: 1_800, health: config.player_health, shield: runtime.resolved.startingShield,
    invulnerableTicks: 0, rescueCharge: 0, rescueHeld: false, rescuesUsed: 0, grazeCount: 0,
    combo: 0, comboClock: 0, kills: 0, score: 0, attackClock: 0, attackSequence: 0, alignmentTicks: 0,
    companionClocks: config.companions.map((companion) => companion.cooldown_ticks),
    companionSignals: config.companions.map(() => 0), companionPending: config.companions.map(() => false),
    nextEnemyID: 0, nextProjectileID: 0, nextPickupID: 0, nextEffectID: 0, spawnedBoss: false,
    dailyVariant: "", enemies: [], enemyProjectiles: [], playerProjectiles: [],
    pickups: [], pickupsCollected: 0, pickupPower: null, pickupPowerTicks: 0,
    pressureQuietTicks: 0, effects: [],
  };
};

const enemy = (id = 1, overrides: Partial<ShooterEnemyEntity> = {}): ShooterEnemyEntity => ({
  id, specIndex: 0, x: 1_800, y: 1_000, health: 1_000, maxHealth: 1_000, fireClock: 0,
  age: 0, phase: 0, warning: 0, volley: 0, marks: 0, boss: false, ...overrides,
});

describe("campaign collision and completion", () => {
  it.each([nanaChapter, dianaChapter, avaChapter, bellaChapter, luluChapter, xingtongChapter, nailuChapter, finaleChapter])(
    "$chapter.id's actual three-stage Boss can be beaten without Rescue at Encore 0", ({ chapter }) => {
      const kit = characterConfig(chapter.featured_character === "player-choice" ? "nana7mi" : chapter.featured_character);
      const config: ShooterRuntimeConfig = {
        ...kit, duration_ticks: chapter.boss.duration_ticks,
        boss: { id: chapter.boss.id as NonNullable<ShooterRuntimeConfig["boss"]>["id"],
          health: chapter.boss.max_health, score: chapter.boss.max_health * 5,
          stages: chapter.boss.stages.map((stage) => ({
            ...stage, fire_interval: stage.shot_interval, damage: stage.projectile_damage,
          })) as NonNullable<ShooterRuntimeConfig["boss"]>["stages"],
        },
      };
      const game = createShooterSimulationFromConfig(config);
      const seenPhases = new Set<number>();
      const minimumX = 1_800 - config.kit.move_limit, maximumX = 1_800 + config.kit.move_limit;
      for (let tick = 0; tick < config.duration_ticks && !game.result(); tick += 1) {
        const current = game.snapshot();
        const boss = current.enemies.find((enemy) => enemy.boss && enemy.health > 0);
        if (boss?.stage) seenPhases.add(boss.stage);
        const desiredX = boss?.position.x ?? 1_800;
        let bestX = current.player_x, bestCost = Infinity;
        // This is a reproducible aiming/dodge test, not a human skill model.
        for (let column = 0; column <= 127; column += 1) {
          const x = minimumX + column * (maximumX - minimumX) / 127;
          const danger = current.enemy_projectiles.some((bullet) => {
            const nextY = bullet.position.y + bullet.velocity.y * 6;
            const verticalRadius = (bullet.radius ?? 42) + 95;
            if (Math.max(bullet.position.y, nextY) < PLAYER_Y - verticalRadius
              || Math.min(bullet.position.y, nextY) > PLAYER_Y + verticalRadius) return false;
            const crossing = bullet.velocity.y === 0 ? 0 : Math.max(0, Math.min(6, (PLAYER_Y - bullet.position.y) / bullet.velocity.y));
            const halfWidth = (bullet.width ?? 0) / 2 || (bullet.radius ?? 42);
            return Math.abs(x - bullet.position.x - bullet.velocity.x * crossing) < halfWidth + 130;
          });
          const cost = Math.abs(x - desiredX) + Math.abs(x - current.player_x) * 0.1 + (danger ? 10_000 : 0);
          if (cost < bestCost) { bestX = x; bestCost = cost; }
        }
        game.step({ x: Math.round((bestX - minimumX) * 127 / (maximumX - minimumX)), rescue: false });
      }
      expect(game.result(), chapter.id).toMatchObject({ won: true, rescues_used: 0, kills: 1 });
      expect(game.result()!.ticks).toBeLessThan(config.duration_ticks);
      expect(seenPhases).toEqual(new Set([1, 2, 3]));
      expect(game.result()!.health).toBeGreaterThan(0);
      expect(game.result()!.final.shield).toBeLessThanOrEqual(1);
    },
  );

  it("automatically clears after the final authored enemy, never in a gap between groups", () => {
    const game = createShooterSimulationFromConfig({
      ...v4Runtime, duration_ticks: 900,
      kit: { ...v4Runtime.kit, attack_damage: 100 },
      wave: { ...v4Runtime.wave, spawns: [
        { at_tick: 0, enemy_id: "spam-bot", count: 1, formation: "center", interval_ticks: 0 },
        { at_tick: 90, enemy_id: "spam-bot", count: 2, formation: "center", interval_ticks: 30 },
      ] },
    });
    for (let tick = 0; tick < 90; tick += 1) {
      game.step({ x: 64, rescue: false });
      expect(game.result()).toBeNull();
    }
    for (let tick = 90; tick < 400 && !game.result(); tick += 1) game.step({ x: 64, rescue: false });
    expect(game.result()).toMatchObject({ won: true, rescues_used: 0 });
    expect(game.result()!.ticks).toBeGreaterThan(120);
    expect(game.result()!.ticks).toBeLessThan(900);
    expect(game.result()!.final.enemy_projectiles).toHaveLength(0);
  });

  it("does not instantly end an empty fixture or discard the survival timeout", () => {
    const empty = createShooterSimulationFromConfig({ ...characterConfig("nana7mi"), duration_ticks: 2 });
    empty.step({ x: 64, rescue: false });
    expect(empty.result()).toBeNull();
    empty.step({ x: 64, rescue: false });
    expect(empty.result()).toMatchObject({ won: true, ticks: 2 });
    const survivor = createShooterSimulationFromConfig({ ...v4Runtime, duration_ticks: 2 });
    survivor.step({ x: 0, rescue: false });
    survivor.step({ x: 0, rescue: false });
    expect(survivor.result()).toMatchObject({ won: true, ticks: 2 });
    expect(survivor.result()!.final.enemies.length).toBeGreaterThan(0);
  });

  it("clears dangerous bullets on the final ordinary-shot kill before they can hit", () => {
    const state = createState({ ...v4Runtime, duration_ticks: 900 });
    state.enemies = [enemy(1, { health: 1 })];
    addPlayerProjectile(state, { x: 1_800, y: 1_300, vy: -400, damage: 10 });
    addEnemyHazard(state, "enemy_shot", 1_800, PLAYER_Y - 100, 0, 100, 1, 42, 0, 0);
    updateProjectiles(state);
    expect(state.enemyProjectiles).toHaveLength(0);
    expect(state.health).toBe(3);
  });

  it("hits the visible Boss body off-center and cannot tunnel through it", () => {
    const state = createState();
    const target = enemy(1, { boss: true });
    state.enemies = [target];
    addPlayerProjectile(state, { x: target.x + 230, y: 1_600, vy: -1_300, damage: 10 });
    updateProjectiles(state);
    expect(target.health).toBe(990);
    expect(state.playerProjectiles).toHaveLength(0);
  });

  it("pierces distinct bodies nearest-first, never the same body on consecutive ticks", () => {
    const state = createState();
    const nearer = enemy(2, { y: 1_300 });
    const farther = enemy(1, { y: 1_000 });
    state.enemies = [farther, nearer];
    addPlayerProjectile(state, { x: 1_800, y: 1_800, vy: -800, damage: 10, pierce: 1 });
    updateProjectiles(state);
    expect([nearer.health, farther.health]).toEqual([990, 990]);
    expect(state.playerProjectiles).toHaveLength(0);
    state.enemies = [enemy(3)];
    addPlayerProjectile(state, { x: 1_800, y: 1_100, vy: -40, damage: 10, pierce: 2 });
    for (let tick = 0; tick < 5; tick += 1) updateProjectiles(state);
    expect(state.enemies[0]!.health).toBe(990);
  });

  it("a wall blocks shots only when it is actually in front of the enemy", () => {
    const state = createState();
    const target = enemy(1, { y: 1_300 });
    state.enemies = [target];
    addEnemyHazard(state, "black_wall", 1_800, 800, 0, 0, 1, 100, 900, 100);
    addPlayerProjectile(state, { x: 1_800, y: 1_800, vy: -1_500, damage: 10 });
    updateProjectiles(state);
    expect(target.health).toBe(990);
    expect(state.enemyProjectiles[0]!.health).toBe(100);
  });

  it("a fast hostile shot cannot skip the player between ticks", () => {
    const state = createState();
    addEnemyHazard(state, "enemy_shot", 1_800, PLAYER_Y - 300, 0, 600, 1, 42, 0, 0);
    updateProjectiles(state);
    expect(state.health).toBe(2);
  });

  it("counts the final Boss kill once and preserves the terminal state", () => {
    const game = createShooterSimulationFromConfig({
      ...characterConfig("nana7mi"),
      boss: { id: "optimal-nana", health: 1, score: 1_000, stages: [{ id: "opening", health_threshold: 100,
        move_pattern: "anchor", shot_pattern: "aimed", fire_interval: 300, projectile_speed: 1, damage: 1, telegraph_ticks: 10 }] },
    });
    for (let tick = 0; tick < 100 && !game.result(); tick += 1) game.step({ x: 64, rescue: false });
    const result = game.result()!;
    expect(result).toMatchObject({ won: true, kills: 1 });
    expect(result.rescues_used).toBe(0);
    expect(result.score).toBeGreaterThanOrEqual(1_000);
    expect(result.final.enemies).toHaveLength(0);
    game.step({ x: 0, rescue: true });
    expect(game.result()).toEqual(result);
  });

  it("keeps Rescue defeat events even when the enemy is cleaned up before rendering", () => {
    const game = createShooterSimulationFromConfig({ ...v4Runtime, starting_rescue_charge: 100 });
    game.step({ x: 64, rescue: false });
    const id = game.snapshot().enemies[0]!.id;
    const events = game.step({ x: 64, rescue: true });
    expect(events.enemyHitIDs).toContain(id);
    expect(events.enemyDefeatedIDs).toContain(id);
    expect(game.snapshot().enemies).toHaveLength(0);
  });
});

describe("seven characters and one-hit guards", () => {
  it.each(shared.characters)("$id has a working Rescue without hidden extra health", ({ id }) => {
    const state = createState(characterConfig(id));
    const target = enemy(1, { marks: 3 });
    state.enemies = [target];
    state.effects.push({ id: 1, kind: "memory_plant", x: 1_800, y: 1_000, ticks: 90, power: 5 });
    state.rescueCharge = 100;
    addEnemyHazard(state, "enemy_shot", 1_800, 2_000, 0, 50, 1, 42, 0, 0);
    expect(activateRescue(state)).toBe(true);
    expect(state.enemies[0]!.health).toBeLessThan(1_000);
    expect(state.enemyProjectiles).toHaveLength(0);
    expect(state.rescuesUsed).toBe(1);
    expect(state.invulnerableTicks).toBeGreaterThan(0);
    expect(state.shield).toBeLessThanOrEqual(1);
    for (let hit = 0; hit < 4; hit += 1) { state.invulnerableTicks = 0; damagePlayer(state, 1); }
    expect(state.health).toBe(0);
    expect(activateRescue(state)).toBe(false);
  });

  it("clamps old tutorial guards, repeated grants, and every source to one", () => {
    const config = characterConfig("bella");
    config.kit.starting_shield = 18;
    const game = createShooterSimulationFromConfig({ ...config, player_health: 99 });
    expect(game.snapshot()).toMatchObject({ health: 3, shield: 1 });
    const state = createState(config);
    for (let i = 0; i < 3; i += 1) { grantShooterShield(state, 8); state.rescueCharge = 100; activateRescue(state); }
    expect(state.shield).toBe(1);
    expect(state.invulnerableTicks).toBeLessThanOrEqual(45);
  });

  it("preserves Nana marks and MikyGreen flowers on hits", () => {
    for (const id of ["nana7mi", "nailu"]) {
      const state = createState(characterConfig(id));
      state.enemies = [enemy()];
      addPlayerProjectile(state, { x: 1_800, y: 1_400, vy: -300, damage: 10 });
      updateProjectiles(state);
      if (id === "nana7mi") expect(state.enemies[0]!.marks).toBe(1);
      else expect(state.effects.some((effect) => effect.kind === "memory_plant")).toBe(true);
    }
  });

  it("preserves Diana's combo volley, Ava's echo, and Bella's third-volley counterburst", () => {
    for (const id of ["jiaran", "xiangwan", "bella"]) {
      const state = createState(characterConfig(id));
      state.combo = 6;
      state.tick = state.runtime.fireInterval * 4;
      state.attackClock = state.runtime.fireInterval - 1;
      state.attackSequence = 2;
      updateWeapons(state);
      if (id === "jiaran") expect(state.playerProjectiles[0]!.damage).toBeGreaterThan(state.runtime.damage);
      else expect(state.playerProjectiles.length).toBeGreaterThan(1);
    }
  });

  it("preserves Lulu's nearby conversion and Xingtong's held alignment beam", () => {
    const lulu = createState(characterConfig("lulu"));
    lulu.tick = 12;
    addEnemyHazard(lulu, "enemy_shot", 1_800, PLAYER_Y - 300, 0, 10, 1, 42, 0, 0);
    updateKitPassives(lulu);
    expect(lulu.enemyProjectiles).toHaveLength(0);
    expect(lulu.playerProjectiles).toHaveLength(1);
    const xingtong = createState(characterConfig("xingtong"));
    xingtong.enemies = [enemy()];
    for (let tick = 0; tick < 12; tick += 1) updateKitPassives(xingtong);
    expect(xingtong.enemies[0]!.health).toBeLessThan(1_000);
  });
});

describe("seven useful companions", () => {
  it.each(shared.companions)("$character_id consumes its cue only after helping", (companion) => {
    const state = createState({ ...characterConfig("nana7mi"), companions: [companionConfig(companion)] });
    state.enemies = [enemy(1, { boss: true, phase: 1 })];
    state.health = 1;
    state.rescuesUsed = 1;
    state.grazeCount = 5;
    state.pickupsCollected = 3;
    addEnemyHazard(state, "enemy_shot", 1_800, PLAYER_Y - 300, 0, 10, 1, 42, 0, 0);
    updateCompanions(state);
    expect(state.companionClocks[0]).toBe(0);
    expect(state.companionPending[0]).toBe(false);
    if (companion.assist.behavior === "heal") expect(state.health).toBe(2);
    else if (companion.assist.behavior === "shield") expect(state.shield).toBe(1);
    else if (companion.assist.behavior === "clear_lane") expect(state.enemyProjectiles).toHaveLength(0);
    else if (companion.assist.behavior === "focus_beam") expect(state.enemies[0]!.health).toBeLessThan(1_000);
    else expect(state.playerProjectiles.length).toBeGreaterThan(0);
  });

  it("queues a new Boss phase during cooldown, then fires once without a new event", () => {
    const companion = shared.companions.find((item) => item.character_id === "xingtong")!;
    const state = createState({ ...characterConfig("nana7mi"), companions: [companionConfig(companion)] });
    state.enemies = [enemy(1, { boss: true, phase: 1 })];
    updateCompanions(state);
    expect(state.enemies[0]!.health).toBe(920);
    state.enemies[0]!.phase = 2;
    updateCompanions(state);
    expect(state.companionPending[0]).toBe(true);
    for (let i = 0; i < 600; i += 1) updateCompanions(state);
    expect(state.enemies[0]!.health).toBe(840);
  });

  it("does not replay an old five-graze cue on every cooldown", () => {
    const companion = shared.companions.find((item) => item.character_id === "bella")!;
    const state = createState({ ...characterConfig("nana7mi"), companions: [companionConfig(companion)] });
    state.grazeCount = 5;
    addEnemyHazard(state, "enemy_shot", 1_800, PLAYER_Y - 300, 0, 0, 1, 42, 0, 0);
    updateCompanions(state);
    addEnemyHazard(state, "enemy_shot", 1_800, PLAYER_Y - 300, 0, 0, 1, 42, 0, 0);
    for (let i = 0; i < 600; i += 1) updateCompanions(state);
    expect(state.enemyProjectiles).toHaveLength(1);
    state.grazeCount = 10;
    updateCompanions(state);
    expect(state.enemyProjectiles).toHaveLength(0);
  });

  it("keeps a saved wave-clear assist pending until it has a target", () => {
    const state = createState({ ...characterConfig("nana7mi"), companions: [{ id: "nana7mi-assist", trigger: "wave_clear", behavior: "side_shot", amount: 20, cooldown_ticks: 180 }] });
    state.kills = 1;
    updateCompanions(state);
    expect(state.playerProjectiles).toHaveLength(0);
    expect(state.companionPending[0]).toBe(true);
    state.enemies = [enemy(1, { x: 2_500 })];
    updateCompanions(state);
    expect(state.playerProjectiles).toHaveLength(1);
    expect(state.playerProjectiles[0]!.vx).toBeGreaterThan(0);
  });
});

describe("six chassis retain their distinct hazards", () => {
  it.each(shared.enemies)("$id keeps its authored telegraph and chassis behavior", (spec) => {
    const runtimeSpec = { ...v4Runtime.enemies[0]!, id: spec.id as ShooterRuntimeConfig["enemies"][number]["id"], chassis: spec.id as ShooterRuntimeConfig["enemies"][number]["chassis"],
      speed: spec.speed, health: spec.max_health, fire_interval: spec.shot_interval, projectile_speed: spec.projectile_speed,
      shot_pattern: spec.shot_pattern as ShooterRuntimeConfig["enemies"][number]["shot_pattern"], telegraph_ticks: spec.telegraph_ticks,
    };
    const state = createState({ ...characterConfig("nana7mi"), enemies: [runtimeSpec] });
    const target = enemy(1, { fireClock: runtimeSpec.fire_interval - 1, age: 20 });
    state.enemies = [target];
    moveEnemy(state, target, runtimeSpec);
    fireEnemy(state, target, runtimeSpec);
    if (spec.id === "gift-thief") expect(state.enemyProjectiles).toHaveLength(0);
    else {
      expect(state.enemyProjectiles.length).toBeGreaterThan(0);
      expect(threatSnapshots(state).length).toBeGreaterThan(0);
    }
  });
});


describe("sustained pickup weapons", () => {
  it("gives fifteen seconds, lets support extend the weapon, and caps accumulated time", () => {
    const state = createState();
    const collect = (kind: "rapid" | "support" | "spread") => {
      state.pickups = [{ id: 1, x: state.playerX, y: PLAYER_Y - 70, value: 12, kind }];
      updatePickups(state);
    };
    collect("rapid");
    expect(state.pickupPowerTicks).toBe(450);
    state.pickupPowerTicks = 420;
    collect("support");
    expect(state.pickupPower).toBe("rapid");
    expect(state.pickupPowerTicks).toBe(870);
    collect("rapid");
    expect(state.pickupPowerTicks).toBe(900);
    collect("spread");
    expect(state.pickupPower).toBe("spread");
    expect(state.pickupPowerTicks).toBe(450);
  });
});
