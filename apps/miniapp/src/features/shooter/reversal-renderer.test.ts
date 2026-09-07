import { describe, expect, it } from "vitest";
import { reversalPlayerFrame } from "@/features/shooter/reversal-renderer";
import { resolveShooterVisualSources } from "@/features/shooter/renderer";
import { createV4Run, v4Content } from "@/test/v4-fixtures";

describe("reversal sprite frame selection", () => {
  it("uses both idle frames when stationary between shots", () => {
    expect(reversalPlayerFrame(4, 0, false)).toBe(0);
    expect(reversalPlayerFrame(16, 0, false)).toBe(1);
    expect(reversalPlayerFrame(4, 0.5, false)).toBe(0);
    expect(reversalPlayerFrame(4, -0.5, false)).toBe(0);
  });

  it("alternates the authored left and right frames without mirroring the character", () => {
    expect(reversalPlayerFrame(0, -12, false)).toBe(2);
    expect(reversalPlayerFrame(5, -12, false)).toBe(3);
    expect(reversalPlayerFrame(0, 12, false)).toBe(4);
    expect(reversalPlayerFrame(5, 12, false)).toBe(5);
    expect(reversalPlayerFrame(10, -12, false)).toBe(2);
    expect(reversalPlayerFrame(10, 12, false)).toBe(4);
  });

  it("selects the shooting frame for the short stationary muzzle beat", () => {
    expect(reversalPlayerFrame(0, 0, false)).toBe(6);
    expect(reversalPlayerFrame(2, 0, false)).toBe(6);
    expect(reversalPlayerFrame(3, 0, false)).not.toBe(6);
    expect(reversalPlayerFrame(12, 0, false)).toBe(6);
    expect(reversalPlayerFrame(12, 12, false)).toBe(4);
  });

  it("prioritizes the hurt frame over movement and shooting", () => {
    for (const dx of [-12, 0, 12]) expect(reversalPlayerFrame(0, dx, true)).toBe(7);
    expect(reversalPlayerFrame(16, 0, true)).toBe(7);
  });
});

describe("reversal visual opt-in boundary", () => {
  it("loads the new sheets only when the segment explicitly enables reversal", () => {
    const run = createV4Run();
    const segment = run.state.segment!;
    const optedIn = { ...run, state: { ...run.state, segment: {
      ...segment, runtime_config: { ...segment.runtime_config, reversal: { weapon: "single" as const, groups: [] } },
    } } };
    expect(resolveShooterVisualSources(v4Content, optedIn)).toEqual({
      reversal: true,
      background: "/game/v4/reversal/stage.webp",
      player: "/game/v4/reversal/nana-sheet.webp",
      enemies: { equipment: "/game/v4/reversal/equipment-sheet.webp" },
      companions: {},
      boss: "/game/v4/reversal/boss-sheet.webp",
      pickups: [],
    });
  });

  it("preserves campaign backgrounds, player sprites, and Boss assets without opt-in", () => {
    const run = createV4Run();
    const sources = resolveShooterVisualSources(v4Content, { ...run, state: {
      ...run.state, segment: { ...run.state.segment!, boss_id: "optimal-nana" },
    } });
    expect(sources.reversal).toBeUndefined();
    expect(sources.background).toBe("/game/v4/backgrounds/seventh-dock.webp");
    expect(sources.player).toBe("/game/v4/players/nana7mi.webp");
    expect(sources.boss).toBe("/game/v4/bosses/optimal-nana.webp");
    expect(sources.enemies["clip-cutter"]).toBe("/game/v4/enemies/clip-cutter.webp");
    expect(sources.pickups).not.toHaveLength(0);
    expect(sources.enemies).not.toHaveProperty("equipment");
  });
});
