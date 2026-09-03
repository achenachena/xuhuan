import { describe, expect, it } from "vitest";

import { resolvePickupWeapon } from "@/features/shooter/weapons";

const baseWeapon = {
  damage: 8,
  fireInterval: 12,
  multishot: 1,
  pierce: 0,
  spread: 0,
};

describe("support pickup weapons", () => {
  it("turns cyan support into rapid twin fire", () => {
    expect(resolvePickupWeapon("rapid", baseWeapon)).toMatchObject({
      fireInterval: 8,
      shotCount: 2,
      projectileKind: "rapid",
    });
  });

  it("turns pink support into a three-way spread", () => {
    expect(resolvePickupWeapon("spread", baseWeapon)).toMatchObject({
      shotCount: 3,
      spread: 14,
      projectileKind: "spread",
    });
  });

  it("turns gold support into a stronger piercing shot", () => {
    expect(resolvePickupWeapon("pierce", baseWeapon)).toMatchObject({
      damage: 12,
      pierce: 2,
      projectileKind: "pierce",
    });
  });
});
