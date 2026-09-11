import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createV4Run, v4BaseState, v4Content, v4Runtime } from "@/test/v4-fixtures";
import demoManifest from "../../../public/game/v4/demo/demo-v3.en.json";

const dependencies = vi.hoisted(() => ({
  draw: vi.fn(),
  preload: vi.fn(),
  music: vi.fn(),
  demoMusic: vi.fn(),
  sound: vi.fn(),
  sources: { background: "stage", player: "player", enemies: { equipment: "equipment" }, boss: "boss", reversal: false },
}));

vi.mock("@/components/providers/use-locale", () => ({ default: () => ({ language: "en" }) }));
vi.mock("@/components/providers/audio-provider", () => ({
  useAudio: () => ({ setMusicActive: dependencies.music, setDemoMusicProgress: dependencies.demoMusic, playSound: dependencies.sound }),
}));
vi.mock("@/features/shooter/renderer", () => ({
  drawShooterArena: dependencies.draw,
  observeShooterCanvas: () => undefined,
  preloadShooterVisuals: dependencies.preload,
  resolveShooterVisualSources: () => dependencies.sources,
}));
vi.mock("@/lib/telegram-combat-mode", () => ({ enterTelegramCombatMode: () => undefined }));
vi.mock("@/lib/telegram-haptics", () => ({ playTelegramHaptic: async () => undefined }));
vi.mock("@/features/portfolio/show-choice-preview", () => ({ ShowChoicePreview: () => <canvas /> }));

import { ShooterArena } from "@/features/shooter/shooter-arena";
import { BrowserDemo } from "@/features/portfolio/browser-demo";

const run = (duration = 90) => createV4Run({
  state: {
    ...v4BaseState,
    segment: {
      ...v4BaseState.segment!,
      duration_ticks: duration,
      runtime_config: {
        ...v4Runtime,
        duration_ticks: duration,
        starting_rescue_charge: 100,
        wave: { id: "input-lifecycle", spawns: [] },
      },
    },
  },
});

let frameID: number;
let now: number;
let frames: Map<number, FrameRequestCallback>;
const advanceFrame = async () => {
  now += 40;
  const callbacks = Array.from(frames.values());
  frames.clear();
  await act(async () => { for (const callback of callbacks) callback(now); });
};
const presentedX = () => dependencies.draw.mock.lastCall?.[7] as number;

describe("ShooterArena input and local completion lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dependencies.preload.mockResolvedValue(new Map(["stage", "player", "equipment", "boss"].map((key) => [key, new Image()])));
    dependencies.sources.reversal = false;
    frameID = 0;
    now = 0;
    frames = new Map();
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frameID += 1;
      frames.set(frameID, callback);
      return frameID;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    vi.stubGlobal("PointerEvent", class extends MouseEvent {
      readonly pointerId: number;
      constructor(type: string, props: PointerEventInit = {}) {
        super(type, props);
        this.pointerId = props.pointerId ?? 0;
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("clears a held pointer on blur so refocus cannot resume stale movement", async () => {
    render(<ShooterArena embedded content={v4Content} run={run()} busy={false} onComplete={async () => true} />);
    await act(async () => {});
    const surface = screen.getByTestId("shooter-control-surface");
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, top: 0, left: 0, right: 360, bottom: 640, width: 360, height: 640, toJSON: () => ({}) });
    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 180, clientY: 500 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 220, clientY: 500 });
    await advanceFrame();
    expect(presentedX()).toBe(2_200);
    fireEvent.blur(window);
    expect(surface).toHaveAttribute("data-pointer-active", "false");
    fireEvent.focus(window);
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 260, clientY: 500 });
    await advanceFrame();
    expect(presentedX()).toBe(2_200);

    fireEvent.pointerDown(surface, { pointerId: 2, clientX: 180, clientY: 500 });
    fireEvent.pointerMove(surface, { pointerId: 2, clientX: 200, clientY: 500 });
    await advanceFrame();
    expect(presentedX()).toBe(2_400);
  });

  it("clears a held arrow and queued rescue when the host deactivates", async () => {
    render(<ShooterArena embedded content={v4Content} run={run()} busy={false} onComplete={async () => true} />);
    await act(async () => {});
    fireEvent.keyDown(window, { code: "ArrowRight" });
    await advanceFrame();
    const heldX = presentedX();
    expect(heldX).toBeGreaterThan(1_800);
    fireEvent.keyDown(window, { code: "Space" });
    act(() => window.dispatchEvent(new Event("xuhuan:deactivated")));
    await advanceFrame();
    act(() => window.dispatchEvent(new Event("xuhuan:activated")));
    await advanceFrame();
    expect(presentedX()).toBe(heldX);
    expect(dependencies.sound).not.toHaveBeenCalledWith("rescue");
  });

  it("leaves a finished embedded arena frozen without a hidden SYNC overlay", async () => {
    const onComplete = vi.fn().mockResolvedValue(true);
    render(<ShooterArena embedded content={v4Content} run={run(2)} busy={false} onComplete={onComplete} />);
    await act(async () => {});
    await advanceFrame();
    await advanceFrame();
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onComplete.mock.calls[0]?.[0].won).toBe(true);
    expect(screen.queryByText("SYNC…")).not.toBeInTheDocument();
    expect(screen.queryByTestId("retry-segment")).not.toBeInTheDocument();
    await advanceFrame();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("advances actual simulator completion through choice, Boss victory, and replay", async () => {
    // One centered controller earns a real break without requiring a test bot.
    // This covers the clock, inherited music, and terminal scene transitions.
    const manifest = structuredClone(demoManifest);
    manifest.wave.runtime_config.reversal.groups = [{ at_tick: 240, group_id: 1, x: 1_800, escorts: 0 }];
    for (const option of manifest.options) option.boss.runtime_config.boss.health = 1;
    dependencies.sources.reversal = true;
    dependencies.preload.mockResolvedValue(new Map(["stage", "player", "equipment", "boss"].map((key) => [key, new Image()])));
    const fetchManifest = vi.fn().mockResolvedValue({ ok: true, json: async () => manifest });
    vi.stubGlobal("fetch", fetchManifest);
    render(<BrowserDemo />);
    await screen.findByTestId("shooter-control-surface");
    for (let index = 0; index < 1_001; index += 1) await advanceFrame();
    expect(await screen.findByRole("button", { name: /Twin Live Feed/ })).toBeVisible();
    expect(screen.queryByText("SYNC…")).not.toBeInTheDocument();
    const earnedBreaks = dependencies.draw.mock.lastCall?.[1].reversal.breaks as number;
    expect(earnedBreaks).toBeGreaterThan(0);
    expect(dependencies.draw.mock.lastCall?.[1].tick).toBeGreaterThan(240);
    expect(dependencies.draw.mock.lastCall?.[1].tick).toBeLessThan(1_200);
    expect(frames.size).toBe(0);
    const completedDraws = dependencies.draw.mock.calls.length;
    await advanceFrame();
    await advanceFrame();
    expect(dependencies.draw).toHaveBeenCalledTimes(completedDraws);
    dependencies.demoMusic.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /Twin Live Feed/ }));
    expect(dependencies.demoMusic).toHaveBeenCalledWith(earnedBreaks);
    for (let index = 0; index < 20; index += 1) await advanceFrame();
    expect(await screen.findByRole("button", { name: "Restart" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Open Telegram" })).toBeVisible();
    expect(screen.getByRole("link", { name: "GitHub" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    expect(await screen.findByTestId("shooter-battlefield")).toHaveAttribute("data-segment-slug", "portfolio-demo-wave");
    expect(screen.queryByRole("button", { name: "Restart" })).not.toBeInTheDocument();
    expect(fetchManifest).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("waits for essential art before playing (reversal=%s)", async (reversal) => {
    dependencies.sources.reversal = reversal;
    let load: (visuals: Map<string, HTMLImageElement>) => void = () => undefined;
    dependencies.preload.mockReturnValue(new Promise<Map<string, HTMLImageElement>>((resolve) => { load = resolve; }));
    const onComplete = vi.fn().mockResolvedValue(true);
    render(<ShooterArena embedded content={v4Content} run={run(2)} busy={false} onComplete={onComplete} />);
    const surface = screen.getByTestId("shooter-control-surface");
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, top: 0, left: 0, right: 360, bottom: 640, width: 360, height: 640, toJSON: () => ({}) });
    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 180, clientY: 500 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 250, clientY: 500 });
    for (let index = 0; index < 5; index += 1) await advanceFrame();
    expect(surface).toHaveAttribute("data-pointer-active", "false");
    expect(dependencies.draw.mock.lastCall?.[1].tick).toBe(0);
    expect(onComplete).not.toHaveBeenCalled();

    await act(async () => load(new Map(["stage", "player", "equipment", "boss"].map((key) => [key, new Image()]))));
    await advanceFrame();
    await advanceFrame();
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });

  it("offers a retry and keeps the stage paused if art cannot load", async () => {
    dependencies.sources.reversal = true;
    dependencies.preload.mockRejectedValue(new Error("Asset unavailable"));
    const onComplete = vi.fn();
    render(<ShooterArena embedded content={v4Content} run={run(2)} busy={false} onComplete={onComplete} />);
    expect(await screen.findByRole("button", { name: "Reconnect" })).toBeVisible();
    await advanceFrame();
    await advanceFrame();
    expect(dependencies.draw.mock.lastCall?.[1].tick).toBe(0);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("pauses a won segment, disables Rescue, then advances without any input", async () => {
    const onComplete = vi.fn().mockResolvedValue(true);
    render(<ShooterArena embedded content={v4Content} run={run(2)} busy={false} onComplete={onComplete} />);
    await act(async () => {});
    await advanceFrame();
    await advanceFrame();
    expect(screen.getByTestId("rescue-button")).toBeDisabled();
    expect(onComplete).not.toHaveBeenCalled();
    const completedTick = dependencies.draw.mock.lastCall?.[1].tick;
    await advanceFrame();
    expect(dependencies.draw.mock.lastCall?.[1].tick).toBe(completedTick);
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(dependencies.sound).not.toHaveBeenCalledWith("rescue");
  });

  it("retains a completed result when its adapter rejects and retries it once", async () => {
    const onComplete = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(true);
    render(<ShooterArena content={v4Content} run={run(2)} busy={false} onComplete={onComplete} />);
    await act(async () => {});
    await advanceFrame();
    await advanceFrame();
    fireEvent.click(await screen.findByTestId("retry-segment"));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(2));
    expect(onComplete.mock.calls[1]?.[0]).toBe(onComplete.mock.calls[0]?.[0]);
    expect(screen.getByTestId("rescue-button")).toBeDisabled();
  });
});
