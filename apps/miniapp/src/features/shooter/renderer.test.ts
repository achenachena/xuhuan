import { describe, expect, it } from "vitest";

import {
  indexShooterPositions,
  shouldUseDenseProjectileRendering,
} from "@/features/shooter/renderer";

describe("shooter renderer performance helpers", () => {
  it("indexes previous positions once and reuses the index", () => {
    const entities = [
      { id: 7, position: { x: 100, y: 200 } },
      { id: 9, position: { x: 300, y: 400 } },
    ];

    const first = indexShooterPositions(entities);
    const second = indexShooterPositions(entities);

    expect(first).toBe(second);
    expect(first.get(9)).toEqual({ x: 300, y: 400 });
  });

  it("drops expensive projectile glow only for dense boss patterns", () => {
    expect(shouldUseDenseProjectileRendering(56)).toBe(false);
    expect(shouldUseDenseProjectileRendering(57)).toBe(true);
  });
});
