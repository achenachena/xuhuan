import { describe, expect, it } from "vitest";

import { sweptShooterHit } from "@/features/shooter/collision";

describe("swept shot/body collision", () => {
  it.each([
    [0, 0, 0, 0, 0],
    [2, 0, 2, 0, null],
    [0, 2, 0, 2, null],
    [-2, 0, 2, 0, 0.25],
    [2, 0, -2, 0, 0.25],
    [0, -2, 0, 2, 0.25],
    [0, 2, 0, -2, 0.25],
    [-2, -2, 2, 2, 0.25],
    [-2, 1, 2, 1, 0.25],
    [-2, 0, -1, 0, 1],
    [2, 0, 3, 0, null],
    [-2, 0, 0, 6, null],
  ])("sweeps (%s, %s) to (%s, %s)", (fromX, fromY, toX, toY, expected) => {
    expect(sweptShooterHit(fromX!, fromY!, toX!, toY!, 0, 0, 1, 1)).toBe(expected);
  });
});
