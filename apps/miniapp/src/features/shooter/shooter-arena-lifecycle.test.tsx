import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createV4Run, v4BaseState, v4Content, v4Runtime } from "@/test/v4-fixtures";

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

import { ShooterArena } from "@/features/shooter/shooter-arena";

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

  it("advances a won segment immediately without waiting for input", async () => {
    const onComplete = vi.fn().mockResolvedValue(true);
    render(<ShooterArena embedded content={v4Content} run={run(2)} busy={false} onComplete={onComplete} />);
    await act(async () => {});
    await advanceFrame();
    await advanceFrame();
    expect(screen.getByTestId("rescue-button")).toBeDisabled();
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
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
