import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createV4Run, v4BaseState, v4Content } from "@/test/v4-fixtures";

const dependencies = vi.hoisted(() => ({ music: vi.fn(), sound: vi.fn() }));
vi.mock("@/components/providers/use-locale", () => ({ default: () => ({ language: "en" }) }));
vi.mock("@/components/providers/audio-provider", () => ({ useAudio: () => ({ setMusicActive: dependencies.music, playSound: dependencies.sound }) }));
vi.mock("@/lib/telegram-haptics", () => ({ playTelegramHaptic: async () => {} }));
vi.mock("@/features/shooter/renderer", () => ({
  drawShooterGates: vi.fn(), observeShooterCanvas: () => undefined,
  preloadShooterVisuals: async () => new Map(), resolveShooterVisualSources: () => ({}),
}));

import { ShooterGates } from "@/features/shooter/shooter-gates";

const run = createV4Run({ state: { ...v4BaseState, phase: "show_choice", segment: undefined, pending_show_options: ["double-take", "safety-chat"] } });

describe("tappable show choices", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("waits for a deliberate tap and submits only once during network wait", async () => {
    let accept!: (value: boolean) => void;
    const onChoose = vi.fn().mockReturnValue(new Promise<boolean>((resolve) => { accept = resolve; }));
    render(<ShooterGates content={v4Content} run={run} busy={false} onChoose={onChoose} />);
    const first = screen.getByTestId("gate-option-double-take");
    expect(first).toHaveAttribute("type", "button");
    expect(onChoose).not.toHaveBeenCalled();
    fireEvent.click(first);
    fireEvent.click(first);
    fireEvent.click(screen.getByTestId("gate-option-safety-chat"));
    expect(onChoose).toHaveBeenCalledExactlyOnceWith("double-take");
    expect(first).toBeDisabled();
    await act(async () => accept(true));
  });

  it.each([false, "reject"])("recovers a failed choice (%s) without a frozen screen", async (failure) => {
    const onChoose = vi.fn().mockImplementationOnce(() => failure === "reject" ? Promise.reject(new Error("offline")) : Promise.resolve(false)).mockResolvedValue(true);
    render(<ShooterGates content={v4Content} run={run} busy={false} onChoose={onChoose} />);
    const first = screen.getByTestId("gate-option-double-take");
    fireEvent.click(first);
    await waitFor(() => expect(first).toBeEnabled());
    expect(screen.getByRole("status")).toHaveTextContent("Tap your choice again");
    fireEvent.click(first);
    expect(onChoose).toHaveBeenCalledTimes(2);
    expect(onChoose.mock.calls[1]).toEqual(onChoose.mock.calls[0]);
  });
});
