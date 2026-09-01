import { describe, expect, it } from "vitest";

import { shooterTutorialKey } from "@/features/shooter/shooter-arena";
import type { ShooterSnapshot } from "@/features/shooter/types";

const snapshot = {
  tick: 0,
  rescue_charge: 20,
} as ShooterSnapshot;

describe("ShooterArena tutorial", () => {
  it("only shows guidance for the authored first-play tutorial segment", () => {
    expect(shooterTutorialKey(20, snapshot, false, 0, false)).toBe(
      "tutorialHold",
    );
    expect(shooterTutorialKey(0, snapshot, false, 0, false)).toBeNull();
  });
});
