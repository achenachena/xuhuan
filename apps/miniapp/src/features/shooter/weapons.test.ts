import { describe, expect, it } from "vitest";
import { resolvePickupWeapon } from "./weapons";
import { emptyPickupLevels } from "./types";
const baseWeapon = { damage:8, fireInterval:12, multishot:1, pierce:0, spread:0 };
describe("stacking pickup weapons",()=>{
  it("keeps rapid, spread and pierce simultaneously, with stronger duplicates",()=>{
    const single=resolvePickupWeapon({...emptyPickupLevels(),rapid:1},baseWeapon);
    const combined=resolvePickupWeapon({rapid:2,spread:1,pierce:1,support:1},baseWeapon);
    expect(combined.fireInterval).toBeLessThan(single.fireInterval);
    expect(combined.shotCount).toBe(3); expect(combined.pierce).toBe(2);
    expect(combined.damage).toBeGreaterThan(single.damage);
    expect(combined.spread).toBeGreaterThan(0);
  });
  it("combines cards with pickups within the projectile and fire-rate budget",()=>{
    const weapon=resolvePickupWeapon({rapid:3,spread:3,pierce:3,support:3},{...baseWeapon,fireInterval:3,multishot:5,pierce:2});
    expect(weapon.fireInterval).toBe(3);expect(weapon.shotCount).toBe(5);expect(weapon.pierce).toBe(8);
  });
});
