import { describe, expect, it } from "vitest";

import { createShooterSimulationFromConfig } from "@/features/shooter/simulation";
import { v4Runtime } from "@/test/v4-fixtures";

describe("local shooter simulation", () => {
  it("is repeatable for the same runtime and input", () => {
    const first = createShooterSimulationFromConfig(v4Runtime);
    const second = createShooterSimulationFromConfig(v4Runtime);

    for (let tick = 0; tick < 120; tick += 1) {
      const input = { x: tick % 2 === 0 ? 42 : 84, rescue: tick === 60 };
      first.step(input);
      second.step(input);
    }

    expect(first.snapshot()).toEqual(second.snapshot());
  });

  it("ends the segment immediately when ON AIR health reaches zero", () => {
    const simulation = createShooterSimulationFromConfig({
      ...v4Runtime,
      duration_ticks: 600,
      enemies: [
        {
          ...v4Runtime.enemies[0]!,
          health: 10_000,
          speed: 0,
          shot_pattern: "lane",
          fire_interval: 1,
          projectile_speed: 400,
        },
      ],
    });

    let result = simulation.result();
    for (let tick = 0; tick < 599 && result === null; tick += 1) {
      simulation.step({ x: 64, rescue: false });
      result = simulation.result();
    }

    expect(result).not.toBeNull();
    expect(result).toMatchObject({ won: false, health: 0 });
    expect(result!.ticks).toBeLessThan(600);
  });
});
