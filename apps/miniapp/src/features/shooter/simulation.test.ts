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
});
