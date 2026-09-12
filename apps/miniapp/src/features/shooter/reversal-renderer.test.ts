import { describe, expect, it, vi } from "vitest";
import { drawReversalArena, preloadReversalFrames, reversalPlayerFrame } from "@/features/shooter/reversal-renderer";
import { resolveShooterVisualSources } from "@/features/shooter/renderer";
import { createShooterRuntime, createShooterSimulation } from "@/features/shooter/simulation";
import type { ShooterSnapshot } from "@/features/shooter/types";
import { createV4Run, v4Content, v4Runtime } from "@/test/v4-fixtures";

const drawingContext = () => ({
  save: vi.fn(), restore: vi.fn(), scale: vi.fn(), fillRect: vi.fn(),
  drawImage: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
  stroke: vi.fn(), setLineDash: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
  fillText: vi.fn(), globalAlpha: 1,
});
const emptyDemo = (): ShooterSnapshot => createShooterSimulation(createShooterRuntime({
  ...v4Runtime, reversal: { weapon: "single", groups: [] },
})).snapshot();
const demoSources = { background: "stage", player: "nana", enemies: { equipment: "equipment" }, boss: "boss", pickups: [] };

describe("clean demo actor rendering", () => {
  it("draws a transformed fan once, not the defeated enemy and wreck as well", () => {
    const equipment = new Image();
    Object.defineProperties(equipment, { naturalWidth: { value: 8 }, naturalHeight: { value: 6 } });
    const pixels = new Uint8ClampedArray(8 * 6 * 4).fill(255);
    const prepareContext = { drawImage: vi.fn(), getImageData: () => ({ data: pixels }) };
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(prepareContext as unknown as CanvasRenderingContext2D);
    const visuals = new Map([["equipment", equipment]]);
    preloadReversalFrames(visuals, demoSources);
    getContext.mockRestore();
    const ctx = drawingContext();
    const snapshot = emptyDemo();
    drawReversalArena(ctx as unknown as CanvasRenderingContext2D, {
      ...snapshot,
      enemies: [{ id: 9, spec_id: "core", chassis: "spam-bot", position: { x: 1800, y: 1600 }, health: 0, max_health: 30, boss: false, role: "controller" }],
      reversal: { breaks: 1, weapon: "single", fans: [{ id: 9, position: { x: 1800, y: 1600 }, side: "left", age: 0, phase: "joining", attack_ticks: 0 }] },
    }, null, 0, demoSources, visuals, 1800, null, new Map([[9, { enemyID: 9, x: 1800, y: 1600, boss: false, role: "controller", destroyed: true, untilTick: 10 }]]));
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(ctx.drawImage.mock.calls[0]?.[0]).toBe(equipment);
  });
});

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
