import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { createShooterRuntime, createShooterSimulation } from "@/features/shooter/simulation";
import type { ShooterResult } from "@/features/shooter/types";
import type { ShooterRuntimeConfig, ShooterTrace } from "@/lib/api/types";

type GoldenVector = {
  readonly name: string;
  readonly config: ShooterRuntimeConfig;
  readonly trace: ShooterTrace;
  readonly result: ShooterResult;
};

const vectors = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      "../api/internal/shooter/testdata/shooter-v1-golden.json",
    ),
    "utf8",
  ),
) as readonly GoldenVector[];

describe("Shooter V1 Go parity", () => {
  it.each(vectors)("replays $name field for field", (vector) => {
    const simulation = createShooterSimulation(createShooterRuntime(vector.config));
    for (const [packed, count] of vector.trace.runs) {
      for (let tick = 0; tick < count; tick += 1) {
        simulation.step({ x: packed & 0x7f, rescue: (packed & 0x80) !== 0 });
      }
    }
    expect(simulation.result()).toEqual(vector.result);
  });
});
