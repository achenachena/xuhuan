import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ActionSimulation,
  createActionSimulation,
  TraceRecorder,
  type ActionConfig,
  type ActionInput,
  type ActionResult,
} from "@/features/action/action-engine";
import { bossVariantAttack } from "@/features/action/action-boss-scripts";
import { weaveProtocol } from "@/features/action/action-protocols";
import {
  activateKitWarp,
  AVA_REPLAY_DELAY_TICKS,
  detonateNanaWaypoints,
  empowerLatestAvaReplay,
  onEnemyKilled,
  onGraze,
  onProtocolComplete,
  plantBloom,
  recordWarp,
  updateKitEffects,
} from "@/features/action/action-kit-effects";
import {
  BELLA_PERFECT_WINDOW_TICKS,
  movePlayer,
} from "@/features/action/action-kits";
import { updateProjectiles } from "@/features/action/action-projectiles";
import { createSimulationState } from "@/features/action/action-simulation-state";
import { buildActionSnapshot } from "@/features/action/action-snapshot";

type GoldenConfig = {
  seed: string;
  kind: string;
  duration_ticks: number;
  max_ticks: number;
  spawn_interval: number;
  max_alive: number;
  player_health: number;
  player_max_health: number;
  noise_level: number;
  emergency_reconnect_available: boolean;
  objective: ActionConfig["objective"];
  hazards: string[];
  boss_variant?: "authentic" | "balanced" | "retained";
  enemies: Array<{
    slug: string;
    kind: string;
    max_health: number;
    speed: number;
    contact_damage: number;
    movement: { kind: string; amount?: number };
    attacks: Array<{
      kind: string;
      interval: number;
      projectile_speed: number;
      damage: number;
      count?: number;
      spread?: number;
      telegraph_ticks?: number;
    }>;
    traits: Array<{ kind: string; amount?: number; value?: string }>;
  }>;
  runtime: {
    kit: string;
    passive: string;
    resonance: string;
    attack_damage: number;
    attack_interval: number;
    move_speed: number;
    warp_cooldown: number;
    warp_damage: number;
    starting_shield: number;
    overload_bonus: number;
    distortion_gain: number;
    protocol_damage: number;
    protocol_shield: number;
    echo_power: number;
    resonance_power: number;
    projectile_pierce: number;
    projectile_count: number;
    projectile_speed: number;
    graze_radius: number;
    heal_on_protocol: number;
    reflect_damage: number;
    behaviors?: Array<{
      source_slug: string;
      level: number;
      kind: "warp_aftershock" | "graze_guard" | "protocol_echo" | "kill_signal";
      amount: number;
      every?: number;
    }>;
  };
};

type GoldenVector = {
  name: string;
  config: GoldenConfig;
  trace: { encoding: "rle8-v1"; ticks: number; data: string };
  expected: GoldenSummary;
};

type GoldenSummary = {
  won: boolean;
  health: number;
  ticks: number;
  kills: number;
  protocols: number;
  distortion: number;
  score: number;
  emergency_used: boolean;
  objective_progress: number;
  enemy_count: number;
  projectile_count: number;
  signal_count: number;
  weave: readonly string[] | null;
  player: { x: number; y: number };
  shield: number;
  total_grazes: number;
};

const summarizeResult = (result: ActionResult): GoldenSummary => ({
  won: result.won,
  health: result.health,
  ticks: result.ticks,
  kills: result.kills,
  protocols: result.protocolsCompleted,
  distortion: result.distortion,
  score: result.score,
  emergency_used: result.emergencyReconnectUsed,
  objective_progress: result.final.objective.progress,
  enemy_count: result.final.enemies.length,
  projectile_count: result.final.projectiles.length,
  signal_count: result.final.signals.length,
  weave: result.final.weave.length > 0 ? result.final.weave : null,
  player: result.final.player,
  shield: result.final.shield,
  total_grazes: result.final.totalGrazes,
});

const fixture = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      "../api/internal/action/testdata/action-v2-golden.json",
    ),
    "utf8",
  ),
) as {
  version: string;
  vectors: GoldenVector[];
  boss_variants: {
    base_vector: string;
    vectors: Array<{
      variant: ActionConfig["bossVariant"];
      expected: GoldenSummary;
    }>;
  };
};

const kitFixture = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      "../api/internal/action/testdata/action-v2-kit-golden.json",
    ),
    "utf8",
  ),
) as {
  version: string;
  trace: GoldenVector["trace"];
  vectors: Array<{
    name: string;
    passive: string;
    expected: GoldenSummary;
  }>;
};

const patternFor = (enemy: GoldenConfig["enemies"][number]): string => {
  if (enemy.kind === "boss") return "boss";
  if (enemy.attacks[0]?.kind === "mine") return "mine";
  return (
    {
      orbit: "orbiter",
      strafe: "sweeper",
      charge: "charger",
      flee: "sniper",
      stationary: "turret",
      wander: "swarm",
    }[enemy.movement.kind] ?? "chaser"
  );
};

const toConfig = (source: GoldenConfig): ActionConfig => ({
  seed: source.seed,
  kind: source.kind,
  durationTicks: source.duration_ticks,
  maxTicks: source.max_ticks,
  spawnInterval: source.spawn_interval,
  maxAlive: source.max_alive,
  playerHealth: source.player_health,
  playerMaxHealth: source.player_max_health,
  noiseLevel: source.noise_level,
  emergencyReconnectAvailable: source.emergency_reconnect_available,
  objective: source.objective,
  hazards: source.hazards,
  bossVariant: source.boss_variant ?? "balanced",
  enemies: source.enemies.map((enemy) => ({
    slug: enemy.slug,
    kind: enemy.kind,
    imageUrl: "",
    maxHealth: enemy.max_health,
    speed: enemy.speed,
    contactDamage: enemy.contact_damage,
    movement: {
      kind: enemy.movement.kind,
      amount: enemy.movement.amount ?? 0,
    },
    attacks: enemy.attacks.map((attack) => ({
      kind: attack.kind,
      interval: attack.interval,
      projectileSpeed: attack.projectile_speed,
      damage: attack.damage,
      count: attack.count ?? 0,
      spread: attack.spread ?? 0,
      telegraphTicks: attack.telegraph_ticks ?? 0,
    })),
    traits: enemy.traits.map((trait) => ({
      kind: trait.kind,
      amount: trait.amount ?? 0,
      value: trait.value ?? "",
    })),
    pattern: patternFor(enemy),
    fireInterval: enemy.attacks[0]?.interval ?? 0,
    projectileSpeed: enemy.attacks[0]?.projectile_speed ?? 0,
    projectileDamage: enemy.attacks[0]?.damage ?? 0,
  })),
  runtime: {
    kit: source.runtime.kit,
    passive: source.runtime.passive,
    resonance: source.runtime.resonance,
    attackDamage: source.runtime.attack_damage,
    attackInterval: source.runtime.attack_interval,
    moveSpeed: source.runtime.move_speed,
    warpCooldown: source.runtime.warp_cooldown,
    warpDamage: source.runtime.warp_damage,
    startingShield: source.runtime.starting_shield,
    overloadBonus: source.runtime.overload_bonus,
    distortionGain: source.runtime.distortion_gain,
    protocolDamage: source.runtime.protocol_damage,
    protocolShield: source.runtime.protocol_shield,
    echoPower: source.runtime.echo_power,
    resonancePower: source.runtime.resonance_power,
    projectilePierce: source.runtime.projectile_pierce,
    projectileCount: source.runtime.projectile_count,
    projectileSpeed: source.runtime.projectile_speed,
    grazeRadius: source.runtime.graze_radius,
    healOnProtocol: source.runtime.heal_on_protocol,
    reflectDamage: source.runtime.reflect_damage,
    behaviors: (source.runtime.behaviors ?? []).map((behavior) => ({
      sourceSlug: behavior.source_slug,
      level: behavior.level,
      kind: behavior.kind,
      amount: behavior.amount,
      every: behavior.every ?? 0,
    })),
  },
});

const decodeRawTrace = (trace: GoldenVector["trace"]): ActionInput[] => {
  const raw = Buffer.from(trace.data, "base64url");
  const frames: ActionInput[] = [];
  for (let index = 0; index < raw.length; index += 2) {
    const control = raw[index]!;
    const count = raw[index + 1]!;
    for (let repeated = 0; repeated < count; repeated += 1) {
      frames.push({
        direction: control & 0x0f,
        magnitude: (control >> 4) & 0x03,
        skill: (control & 0x40) !== 0,
      });
    }
  }
  expect(frames).toHaveLength(trace.ticks);
  return frames;
};

const decodeTrace = (vector: GoldenVector): ActionInput[] =>
  decodeRawTrace(vector.trace);

describe("action-v2 engine", () => {
  it("consumes the Go golden vectors without state drift", async () => {
    expect(fixture.version).toBe("action-v2");
    for (const vector of fixture.vectors) {
      const simulation = await createActionSimulation(toConfig(vector.config));
      let result = null;
      for (const frame of decodeTrace(vector)) {
        result = simulation.step(frame);
        if (result) break;
      }
      expect(result, vector.name).not.toBeNull();
      expect(summarizeResult(result!), vector.name).toEqual(vector.expected);
    }
  });

  it("consumes all authored Boss-variant Go golden vectors", async () => {
    const base = fixture.vectors.find(
      (vector) => vector.name === fixture.boss_variants.base_vector,
    );
    expect(base).toBeDefined();
    expect(fixture.boss_variants.vectors).toHaveLength(3);
    for (const vector of fixture.boss_variants.vectors) {
      const simulation = await createActionSimulation({
        ...toConfig(base!.config),
        bossVariant: vector.variant,
      });
      let result = null;
      for (const frame of decodeTrace(base!)) {
        result = simulation.step(frame);
        if (result) break;
      }
      expect(result, vector.variant).not.toBeNull();
      expect(summarizeResult(result!), vector.variant).toEqual(
        vector.expected,
      );
    }
  });

  it("resolves distinct, telegraphed authored Boss patterns", () => {
    const base = fixture.vectors.find(
      (vector) => vector.name === fixture.boss_variants.base_vector,
    );
    const config = toConfig(base!.config);
    const spec = config.enemies[0]!;
    const expected = {
      authentic: { kind: "fan", interval: 30, telegraphTicks: 20 },
      balanced: { kind: "fan", interval: 24, telegraphTicks: 12 },
      retained: { kind: "spiral", interval: 20, telegraphTicks: 16 },
    } as const;
    for (const variant of ["authentic", "balanced", "retained"] as const) {
      const attack = bossVariantAttack({
        spec,
        attackIndex: 0,
        health: spec.maxHealth,
        maxHealth: spec.maxHealth,
        variant,
      });
      expect(attack).toMatchObject(expected[variant]);
      if (attack.damage >= 8) expect(attack.telegraphTicks).toBeGreaterThan(0);
      const state = createSimulationState({ ...config, bossVariant: variant }, 29);
      state.enemies = [
        {
          id: 1,
          specIndex: 0,
          x: 1800,
          y: 1200,
          health: spec.maxHealth,
          maxHealth: spec.maxHealth,
          fireClock: attack.interval - 5,
          attackIndex: 0,
        },
      ];
      expect(buildActionSnapshot(state).enemies[0]).toMatchObject({
        attack: attack.kind,
        intentTicks: 5,
      });
    }
  });

  it("consumes the Go character-kit golden vectors without state drift", async () => {
    expect(kitFixture.version).toBe("action-v2");
    const source = toConfig(fixture.vectors[0]!.config);
    for (const vector of kitFixture.vectors) {
      const config: ActionConfig = {
        ...source,
        seed: `kit-golden-${vector.passive}`,
        kind: "tutorial",
        durationTicks: 900,
        maxTicks: 900,
        spawnInterval: 90,
        maxAlive: 4,
        playerHealth: 100,
        playerMaxHealth: 100,
        objective: { kind: "recover", target: 4 },
        enemies: [
          {
            slug: "kit-dummy",
            kind: "normal",
            imageUrl: "",
            maxHealth: 999,
            speed: 0,
            contactDamage: 0,
            movement: { kind: "stationary", amount: 0 },
            attacks: [
              {
                kind: "aimed",
                interval: 30,
                projectileSpeed: 20,
                damage: 2,
                count: 0,
                spread: 0,
                telegraphTicks: 0,
              },
            ],
            traits: [],
            pattern: "turret",
            fireInterval: 30,
            projectileSpeed: 20,
            projectileDamage: 2,
          },
        ],
        runtime: {
          ...source.runtime,
          kit: vector.passive,
          passive: vector.passive,
          resonance: vector.passive,
          attackDamage: 3,
          attackInterval: 30,
          moveSpeed: 42,
          warpCooldown: 120,
          warpDamage: 14,
          startingShield: 0,
          overloadBonus: 0,
          distortionGain: 4,
          protocolDamage: 0,
          protocolShield: 0,
          echoPower: 0,
          resonancePower: 0,
          projectilePierce: 0,
          projectileCount: 1,
          projectileSpeed: 100,
          grazeRadius: 310,
          healOnProtocol: 0,
          reflectDamage: 0,
          behaviors: [],
        },
      };
      const simulation = await createActionSimulation(config);
      let result = null;
      for (const frame of decodeRawTrace(kitFixture.trace)) {
        result = simulation.step(frame);
        if (result) break;
      }
      expect(result, vector.name).not.toBeNull();
      expect(summarizeResult(result!), vector.name).toEqual(vector.expected);
    }
  });

  it("is deterministic and records one compact room trace", async () => {
    const vector = fixture.vectors[0]!;
    const config = toConfig(vector.config);
    const first = await createActionSimulation(config);
    const second = await createActionSimulation(config);
    const recorder = new TraceRecorder();
    let firstResult = null;
    let secondResult = null;
    for (const frame of decodeTrace(vector)) {
      recorder.push(frame);
      firstResult = first.step(frame);
      secondResult = second.step(frame);
    }
    expect(firstResult).toEqual(secondResult);
    const trace = recorder.encode();
    expect(trace.ticks).toBe(120);
    expect(trace.data).toBe(vector.trace.data);
    expect(trace).toEqual(vector.trace);
  });

  it("stops on the first neutral tick with no hidden velocity", () => {
    const config = toConfig(fixture.vectors[0]!.config);
    const simulation = new ActionSimulation(config, 1234);
    simulation.step({ direction: 0, magnitude: 3, skill: false });
    const moved = simulation.snapshot().player;
    simulation.step({ direction: 0, magnitude: 0, skill: false });
    expect(simulation.snapshot().player).toEqual(moved);
  });

  it("uses the authoritative projectile-speed cadence for upgraded builds", () => {
    const base = toConfig(fixture.vectors[0]!.config);
    const config: ActionConfig = {
      ...base,
      kind: "normal",
      durationTicks: 120,
      maxTicks: 130,
      spawnInterval: 9999,
      maxAlive: 1,
      objective: { kind: "holdout", target: 120 },
      enemies: [
        {
          ...base.enemies[0]!,
          maxHealth: 10_000,
          speed: 0,
          contactDamage: 0,
          movement: { kind: "stationary", amount: 0 },
          attacks: [
            {
              kind: "aimed",
              interval: 1000,
              projectileSpeed: 20,
              damage: 1,
              count: 0,
              spread: 0,
              telegraphTicks: 0,
            },
          ],
          pattern: "turret",
          fireInterval: 1000,
          projectileSpeed: 20,
          projectileDamage: 1,
        },
      ],
    };
    const baseline = new ActionSimulation(config, 1234);
    const upgraded = new ActionSimulation(
      {
        ...config,
        runtime: { ...config.runtime, projectileSpeed: 200 },
      },
      1234,
    );
    let baselineResult = null;
    let upgradedResult = null;
    for (let tick = 0; tick < 120; tick += 1) {
      const input = { direction: 0, magnitude: 0, skill: false } as const;
      baselineResult = baseline.step(input);
      upgradedResult = upgraded.step(input);
    }

    expect(baselineResult?.won).toBe(true);
    expect(upgradedResult?.won).toBe(true);
    expect(upgradedResult!.final.enemies[0]!.health).toBeLessThan(
      baselineResult!.final.enemies[0]!.health,
    );
  });

  it("delays elite support waves and never spawns excess elite targets", () => {
    const base = toConfig(fixture.vectors[0]!.config);
    const harmless = {
      ...base.enemies[0]!,
      speed: 0,
      contactDamage: 0,
      movement: { kind: "stationary", amount: 0 },
      attacks: [
        {
          kind: "aimed",
          interval: 1000,
          projectileSpeed: 20,
          damage: 1,
          count: 0,
          spread: 0,
          telegraphTicks: 0,
        },
      ],
      traits: [],
      fireInterval: 1000,
      projectileSpeed: 20,
      projectileDamage: 1,
      maxHealth: 10_000,
    };
    const simulation = new ActionSimulation(
      {
        ...base,
        kind: "elite",
        durationTicks: 900,
        maxTicks: 1000,
        spawnInterval: 100,
        maxAlive: 10,
        objective: { kind: "elite", target: 2 },
        enemies: [
          { ...harmless, slug: "elite-target", kind: "elite" },
          { ...harmless, slug: "support", kind: "normal" },
        ],
        runtime: { ...base.runtime, attackInterval: 10_000 },
      },
      3,
    );
    const neutral = { direction: 0, magnitude: 0, skill: false } as const;

    for (let tick = 0; tick < 449; tick += 1) simulation.step(neutral);
    expect(simulation.snapshot().enemies.map((enemy) => enemy.slug)).toEqual([
      "elite-target",
    ]);
    simulation.step(neutral);
    expect(simulation.snapshot().enemies.map((enemy) => enemy.slug)).toEqual([
      "elite-target",
      "support",
    ]);
    for (let tick = 450; tick < 750; tick += 1) simulation.step(neutral);
    const slugs = simulation.snapshot().enemies.map((enemy) => enemy.slug);
    expect(slugs.filter((slug) => slug === "elite-target")).toHaveLength(2);
    expect(slugs.filter((slug) => slug === "support")).toHaveLength(3);
  });

  it("counts elite kills instead of ordinary support kills", () => {
    const base = toConfig(fixture.vectors[0]!.config);
    const target = {
      ...base.enemies[0]!,
      maxHealth: 1,
      speed: 0,
      contactDamage: 0,
      movement: { kind: "stationary", amount: 0 },
      attacks: [
        {
          kind: "aimed",
          interval: 1000,
          projectileSpeed: 20,
          damage: 1,
          count: 0,
          spread: 0,
          telegraphTicks: 0,
        },
      ],
      traits: [],
      fireInterval: 1000,
      projectileSpeed: 20,
      projectileDamage: 1,
    };
    const simulation = new ActionSimulation(
      {
        ...base,
        kind: "elite",
        durationTicks: 600,
        maxTicks: 700,
        spawnInterval: 100,
        maxAlive: 4,
        objective: { kind: "elite", target: 1 },
        enemies: [
          { ...target, slug: "support", kind: "normal" },
          { ...target, slug: "elite-target", kind: "elite" },
        ],
        runtime: { ...base.runtime, attackDamage: 100, attackInterval: 1 },
      },
      3,
    );
    const neutral = { direction: 0, magnitude: 0, skill: false } as const;
    let result = null;
    for (let tick = 0; tick < 449; tick += 1) {
      result = simulation.step(neutral);
    }
    expect(result).toBeNull();
    expect(simulation.snapshot().objective.progress).toBe(0);
    while (!result) result = simulation.step(neutral);
    expect(result.won).toBe(true);
    expect(result.ticks).toBe(453);
    expect(result.kills).toBe(2);
  });

  it("applies bounded armor and only a live named protector shield", () => {
    const base = toConfig(fixture.vectors[0]!.config);
    const harmless = {
      ...base.enemies[0]!,
      maxHealth: 100,
      speed: 0,
      contactDamage: 0,
      movement: { kind: "stationary", amount: 0 },
      attacks: [
        {
          kind: "aimed",
          interval: 1000,
          projectileSpeed: 20,
          damage: 1,
          count: 0,
          spread: 0,
          telegraphTicks: 0,
        },
      ],
      fireInterval: 1000,
      projectileSpeed: 20,
      projectileDamage: 1,
    };
    const linkedTarget = {
      ...harmless,
      slug: "linked-target",
      traits: [
        { kind: "armored", amount: 3, value: "" },
        { kind: "linked_shield", amount: 3, value: "protector" },
      ],
    };
    const protector = {
      ...harmless,
      slug: "protector",
      traits: [],
    };
    const config: ActionConfig = {
      ...base,
      kind: "normal",
      durationTicks: 95,
      maxTicks: 100,
      spawnInterval: 1,
      maxAlive: 2,
      objective: { kind: "holdout", target: 95 },
      enemies: [linkedTarget, protector],
      runtime: { ...base.runtime, attackDamage: 30, attackInterval: 1 },
    };
    const neutral = { direction: 0, magnitude: 0, skill: false } as const;
    const protectedSimulation = new ActionSimulation(config, 3);
    for (let tick = 0; tick < 4; tick += 1) {
      protectedSimulation.step(neutral);
    }
    expect(
      protectedSimulation
        .snapshot()
        .enemies.find((enemy) => enemy.slug === "linked-target")?.health,
    ).toBe(82);

    const unprotectedSimulation = new ActionSimulation(
      {
        ...config,
        enemies: [
          { ...protector, maxHealth: 1 },
          linkedTarget,
        ],
      },
      3,
    );
    for (let tick = 0; tick < 8; tick += 1) {
      unprotectedSimulation.step(neutral);
    }
    expect(
      unprotectedSimulation
        .snapshot()
        .enemies.find((enemy) => enemy.slug === "linked-target")?.health,
    ).toBe(73);
  });

  it("splits into the authored child archetype with child-based health", () => {
    const base = toConfig(fixture.vectors[0]!.config);
    const harmless = {
      ...base.enemies[0]!,
      speed: 0,
      contactDamage: 0,
      movement: { kind: "stationary", amount: 0 },
      attacks: [
        {
          kind: "aimed",
          interval: 1000,
          projectileSpeed: 20,
          damage: 1,
          count: 0,
          spread: 0,
          telegraphTicks: 0,
        },
      ],
      fireInterval: 1000,
      projectileSpeed: 20,
      projectileDamage: 1,
    };
    const simulation = new ActionSimulation(
      {
        ...base,
        kind: "normal",
        durationTicks: 30,
        maxTicks: 40,
        spawnInterval: 9999,
        maxAlive: 3,
        objective: { kind: "holdout", target: 30 },
        enemies: [
          {
            ...harmless,
            slug: "split-parent",
            maxHealth: 1,
            traits: [{ kind: "death_split", amount: 2, value: "child" }],
          },
          {
            ...harmless,
            slug: "child",
            maxHealth: 40,
            traits: [],
          },
        ],
        runtime: { ...base.runtime, attackDamage: 10, attackInterval: 1 },
      },
      3,
    );
    const neutral = { direction: 0, magnitude: 0, skill: false } as const;
    for (let tick = 0; tick < 5; tick += 1) simulation.step(neutral);
    const children = simulation.snapshot().enemies;
    expect(children.map((enemy) => enemy.slug)).toEqual(["child", "child"]);
    expect(children.map((enemy) => enemy.maxHealth)).toEqual([20, 20]);
  });

  it.each([
    [["surge", "echo", "surge"], "surge_break"],
    [["guard", "guard", "surge"], "guard_aegis"],
    [["echo", "guard", "echo"], "echo_replay"],
    [["surge", "guard", "echo"], "resonance"],
  ] as const)("resolves Signal Weave %j", (signals, expected) => {
    expect(weaveProtocol(signals)).toBe(expected);
  });

  it("does not let a purge objective complete by waiting", async () => {
    const base = toConfig(fixture.vectors[0]!.config);
    const simulation = await createActionSimulation({
      ...base,
      maxTicks: 130,
      objective: { kind: "purge", target: 99 },
    });
    let result = null;
    for (let tick = 0; tick < 130; tick += 1) {
      result = simulation.step({ direction: 0, magnitude: 0, skill: false });
    }
    expect(result?.won).toBe(false);
  });

  it("chains Nana explosions through collected signal positions", () => {
    const config = toConfig(fixture.vectors[0]!.config);
    const state = createSimulationState(config, 7);
    state.signalWaypoints = [
      { x: 600, y: 1800 },
      { x: 1800, y: 2400 },
      { x: 3000, y: 1800 },
    ];
    state.enemies = state.signalWaypoints.map((point, index) => ({
      id: index + 1,
      specIndex: 0,
      x: point.x,
      y: point.y,
      health: 100,
      maxHealth: 100,
      fireClock: 0,
      attackIndex: 0,
    }));
    state.projectiles = [
      {
        id: 1,
        x: 600,
        y: 1800,
        vx: 0,
        vy: 0,
        damage: 1,
        pattern: "test",
        grazed: false,
        glitchMarked: false,
        delay: 0,
      },
      {
        id: 2,
        x: 3400,
        y: 5000,
        vx: 0,
        vy: 0,
        damage: 1,
        pattern: "test",
        grazed: false,
        glitchMarked: false,
        delay: 0,
      },
    ];
    detonateNanaWaypoints(state, 10);
    expect(state.enemies.every((enemy) => enemy.health < 100)).toBe(true);
    expect(state.projectiles.map((bullet) => bullet.id)).toEqual([2]);
  });

  it("releases Bella's homing tailwind inside the generous beat window", () => {
    const base = toConfig(fixture.vectors[0]!.config);
    const config: ActionConfig = {
      ...base,
      runtime: {
        ...base.runtime,
        passive: "bella_perfect_warp",
        warpDamage: 32,
      },
    };
    const state = createSimulationState(config, 29);
    state.tickValue = 155;
    state.warpReadyTick = 130;
    state.enemies = [
      {
        id: 1,
        specIndex: 0,
        x: 600,
        y: 800,
        health: 100,
        maxHealth: 100,
        fireClock: 0,
        attackIndex: 0,
      },
    ];
    movePlayer(state, { direction: 0, magnitude: 3, skill: true });
    expect([state.friendlyShots.length, state.shield, state.invulnerable]).toEqual([
      1,
      5,
      18,
    ]);
    for (let tick = 0; tick < 60; tick += 1) updateKitEffects(state);
    expect(state.enemies[0]!.health).toBe(92);

    const late = createSimulationState(config, 29);
    late.tickValue = 100 + BELLA_PERFECT_WINDOW_TICKS + 1;
    late.warpReadyTick = 100;
    late.enemies = [
      {
        id: 1,
        specIndex: 0,
        x: 600,
        y: 800,
        health: 100,
        maxHealth: 100,
        fireClock: 0,
        attackIndex: 0,
      },
    ];
    movePlayer(late, { direction: 0, magnitude: 3, skill: true });
    expect([late.friendlyShots.length, late.shield]).toEqual([0, 0]);
  });

  it("replays Ava's latest Warp after a deterministic delay", () => {
    const base = toConfig(fixture.vectors[0]!.config);
    const state = createSimulationState(
      {
        ...base,
        runtime: {
          ...base.runtime,
          passive: "ava_afterimage",
          resonance: "ava_afterimage",
        },
      },
      11,
    );
    state.enemies = [
      {
        id: 1,
        specIndex: 0,
        x: 1800,
        y: 4800,
        health: 100,
        maxHealth: 100,
        fireClock: 0,
        attackIndex: 0,
      },
    ];
    recordWarp(state, { x: 1800, y: 5200 }, { x: 1800, y: 4400 });
    empowerLatestAvaReplay(state, 18);
    for (state.tickValue = 1; state.tickValue < AVA_REPLAY_DELAY_TICKS; state.tickValue += 1) {
      updateKitEffects(state);
    }
    expect(state.enemies[0]!.health).toBe(100);
    state.tickValue = AVA_REPLAY_DELAY_TICKS;
    updateKitEffects(state);
    expect(state.enemies[0]!.health).toBeLessThan(100);
    expect(state.delayedWarps).toHaveLength(0);
  });

  it("marks Lulu grazes and converts them only on Warp", () => {
    const base = toConfig(fixture.vectors[0]!.config);
    const state = createSimulationState(
      {
        ...base,
        runtime: {
          ...base.runtime,
          passive: "lulu_convert_projectiles",
          resonance: "lulu_convert_projectiles",
        },
      },
      13,
    );
    state.enemies = [
      {
        id: 7,
        specIndex: 0,
        x: state.playerX + 900,
        y: state.playerY,
        health: 100,
        maxHealth: 100,
        fireClock: 0,
        attackIndex: 0,
      },
    ];
    state.projectiles = [
      {
        id: 1,
        x: state.playerX + 250,
        y: state.playerY,
        vx: 0,
        vy: 0,
        damage: 4,
        pattern: "test",
        grazed: false,
        glitchMarked: false,
        delay: 0,
      },
    ];
    updateProjectiles(state);
    expect(state.projectiles[0]?.glitchMarked).toBe(true);
    expect(state.enemies[0]!.health).toBe(100);
    activateKitWarp(state, false);
    expect(state.projectiles).toHaveLength(0);
    expect(state.friendlyShots).toHaveLength(1);
    for (let tick = 0; tick < 6; tick += 1) updateKitEffects(state);
    expect(state.enemies[0]!.health).toBeLessThan(100);
    expect(state.friendlyShots).toHaveLength(0);
  });

  it("turns Nailu blooms into damage and persistent clear zones", () => {
    const base = toConfig(fixture.vectors[0]!.config);
    const state = createSimulationState(
      {
        ...base,
        runtime: { ...base.runtime, passive: "nailu_memory_bloom" },
      },
      17,
    );
    const bloom = { x: 1400, y: 3000 };
    plantBloom(state, bloom);
    state.enemies = [
      {
        id: 1,
        specIndex: 0,
        x: bloom.x + 200,
        y: bloom.y,
        health: 100,
        maxHealth: 100,
        fireClock: 0,
        attackIndex: 0,
      },
    ];
    state.projectiles = [
      {
        id: 1,
        x: bloom.x,
        y: bloom.y,
        vx: 0,
        vy: 0,
        damage: 1,
        pattern: "test",
        grazed: false,
        glitchMarked: false,
        delay: 0,
      },
    ];
    activateKitWarp(state, false);
    expect(state.blooms).toHaveLength(0);
    expect(state.safeZones).toHaveLength(1);
    expect(state.projectiles).toHaveLength(0);
    expect(state.enemies[0]!.health).toBeLessThan(100);
    state.projectiles = [
      {
        id: 2,
        x: bloom.x,
        y: bloom.y,
        vx: 0,
        vy: 0,
        damage: 1,
        pattern: "test",
        grazed: false,
        glitchMarked: false,
        delay: 5,
      },
    ];
    updateProjectiles(state);
    expect(state.projectiles).toHaveLength(0);
  });

  it("executes authored module behaviors at deterministic hooks", () => {
    const base = toConfig(fixture.vectors[0]!.config);
    const state = createSimulationState(
      {
        ...base,
        runtime: {
          ...base.runtime,
          behaviors: [
            {
              sourceSlug: "lens",
              level: 2,
              kind: "warp_aftershock",
              amount: 7,
              every: 0,
            },
            {
              sourceSlug: "guard",
              level: 1,
              kind: "graze_guard",
              amount: 3,
              every: 2,
            },
            {
              sourceSlug: "echo",
              level: 1,
              kind: "protocol_echo",
              amount: 5,
              every: 2,
            },
            {
              sourceSlug: "primer",
              level: 1,
              kind: "kill_signal",
              amount: 1,
              every: 4,
            },
          ],
        },
      },
      23,
    );
    state.enemies = [
      {
        id: 1,
        specIndex: 0,
        x: 1800,
        y: 4800,
        health: 100,
        maxHealth: 100,
        fireClock: 0,
        attackIndex: 0,
      },
    ];
    recordWarp(state, { x: 1800, y: 5200 }, { x: 1800, y: 4400 });
    expect(state.delayedWarps[0]).toMatchObject({
      triggerTick: 10,
      damage: 7,
    });
    onGraze(state);
    onGraze(state);
    expect([state.totalGrazes, state.shield]).toEqual([2, 3]);
    state.protocols = 2;
    onProtocolComplete(state);
    expect([state.enemies[0]!.health, state.score]).toEqual([95, 25]);
    state.signalCooldown = [45, 45, 45];
    state.kills = 4;
    onEnemyKilled(state);
    expect(state.signalCooldown).toEqual([45, 0, 45]);
    expect(state.signalPulse).toBe(12);
  });

});
