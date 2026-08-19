import { describe, expect, it } from "vitest";

import {
  ActionSimulation,
  createActionSimulation,
  TraceRecorder,
  type ActionConfig,
} from "@/features/action/action-engine";

const config: ActionConfig = {
  seed: "deterministic-seed",
  kind: "normal",
  durationTicks: 120,
  maxTicks: 180,
  spawnInterval: 90,
  maxAlive: 4,
  playerHealth: 80,
  playerMaxHealth: 80,
  noiseLevel: 0,
  emergencyReconnectAvailable: true,
  enemies: [
    {
      slug: "dummy",
      pattern: "turret",
      maxHealth: 40,
      speed: 0,
      contactDamage: 0,
      fireInterval: 1000,
      projectileSpeed: 20,
      projectileDamage: 4,
    },
  ],
  buffs: {
    attackDamage: 8,
    attackInterval: 12,
    moveSpeed: 42,
    dashCooldown: 240,
    dashDamage: 14,
    startingShield: 0,
    overloadBonus: 0,
    distortionGain: 4,
    routeHeal: 0,
    reflectDamage: 0,
  },
};

describe("action engine", () => {
  it("is deterministic and emits a compact trace", () => {
    const first = new ActionSimulation(config, 1234);
    const second = new ActionSimulation(config, 1234);
    const recorder = new TraceRecorder();
    let firstResult = null,
      secondResult = null;
    for (let tick = 0; tick < 120; tick += 1) {
      const input = { direction: 0, magnitude: 1, skill: false };
      recorder.push(input);
      firstResult = first.step(input);
      secondResult = second.step(input);
    }
    expect(firstResult?.digest).toBe(secondResult?.digest);
    const trace = recorder.encode(firstResult!.digest);
    expect(trace.ticks).toBe(120);
    expect(trace.data.length).toBeLessThan(12);
  });

  it("matches the Go conformance vector", async () => {
    const simulation = await createActionSimulation(config);
    let result = null;
    for (let tick = 0; tick < 120; tick += 1)
      result = simulation.step({ direction: 0, magnitude: 1, skill: false });
    expect(result?.digest).toBe("a8308e7d");
  });

  it("matches Go through the scripted and mimic boss phases", async () => {
    const bossConfig: ActionConfig = {
      seed: "boss-conformance",
      kind: "boss",
      durationTicks: 2700,
      maxTicks: 2700,
      spawnInterval: 300,
      maxAlive: 4,
      playerHealth: 100,
      playerMaxHealth: 100,
      noiseLevel: 0,
      emergencyReconnectAvailable: true,
      enemies: [
        {
          slug: "optimal",
          pattern: "boss",
          maxHealth: 1050,
          speed: 5,
          contactDamage: 12,
          fireInterval: 24,
          projectileSpeed: 34,
          projectileDamage: 8,
        },
      ],
      buffs: {
        attackDamage: 8,
        attackInterval: 12,
        moveSpeed: 42,
        dashCooldown: 240,
        dashDamage: 14,
        startingShield: 0,
        overloadBonus: 0,
        distortionGain: 4,
        routeHeal: 0,
        reflectDamage: 0,
      },
    };
    const simulation = await createActionSimulation(bossConfig);
    let result = null;
    for (let tick = 0; tick < 2700 && !result; tick += 1)
      result = simulation.step({ direction: 0, magnitude: 1, skill: false });
    expect(result?.digest).toBe("47bd08b8");
  });
});
