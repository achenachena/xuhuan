import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { APIError, type APIBattle, type APIBattleActionResponse } from "@/lib/api/client";
import { toPresentationCharacter } from "@/lib/api/presentation";
import { createTestBattle, testCharacter, testEncounter } from "@/test/fixtures";

const dependencies = vi.hoisted(() => ({
  startBattle: vi.fn(),
  submitAction: vi.fn(),
  refreshBattle: vi.fn(),
  mutatePlayer: vi.fn(),
  resetStart: vi.fn(),
  resetAction: vi.fn(),
  playSound: vi.fn(),
  playBGM: vi.fn(),
  stopBGM: vi.fn()
}));

vi.mock("@/components/providers/use-locale", () => ({
  default: () => ({
    translate: (key: string) => key,
    isReady: true,
    language: "zh-CN"
  })
}));
vi.mock("@/components/providers/audio-provider", () => ({
  useAudio: () => ({
    playSound: dependencies.playSound,
    playBGM: dependencies.playBGM,
    stopBGM: dependencies.stopBGM
  })
}));
vi.mock("@/hooks/use-telegram-theme", () => ({
  default: () => ({ themeParams: {} })
}));
vi.mock("@/hooks/use-characters", () => ({
  useEncounters: () => ({
    encounters: [testEncounter],
    isLoading: false,
    error: undefined
  })
}));
vi.mock("@/hooks/use-player", () => ({
  usePlayerProfile: () => ({
    player: { level: 1, credits: 0, energy: 120 },
    mutatePlayer: dependencies.mutatePlayer
  }),
  useStartBattle: () => ({
    startBattle: dependencies.startBattle,
    isMutating: false,
    reset: dependencies.resetStart
  }),
  useBattleAction: () => ({
    submitAction: dependencies.submitAction,
    isMutating: false,
    reset: dependencies.resetAction
  }),
  useAuthoritativeBattle: () => ({ refreshBattle: dependencies.refreshBattle })
}));
vi.mock("@/components/character-select", () => ({
  default: ({
    onCharacterSelected
  }: {
    onCharacterSelected: (character: ReturnType<typeof toPresentationCharacter>) => void;
  }) => (
    <button type="button" onClick={() => onCharacterSelected(toPresentationCharacter(testCharacter))}>
      choose-character
    </button>
  )
}));
vi.mock("@/components/battle-arena", () => ({
  default: ({ turn }: { turn: number }) => <div>authoritative-turn-{turn}</div>
}));
vi.mock("@/components/reward-modal", () => ({
  default: ({ open, outcome, onClose }: { open: boolean; outcome: string; onClose: () => void }) =>
    open ? (
      <div role="dialog">
        reward-{outcome}
        <button type="button" onClick={onClose}>
          close-reward
        </button>
      </div>
    ) : null
}));

import HomePage from "@/app/page";

type Deferred<T> = {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
};

const deferred = <T,>(): Deferred<T> => {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
};

const enterBattle = async (battle: APIBattle = createTestBattle()): Promise<void> => {
  dependencies.startBattle.mockResolvedValueOnce(battle);
  render(<HomePage />);
  fireEvent.click(screen.getByRole("button", { name: "choose-character" }));
  await screen.findByText(`authoritative-turn-${battle.turn}`);
};

describe("authoritative battle page", () => {
  beforeEach(() => {
    Object.values(dependencies).forEach((mock) => mock.mockReset());
  });

  it("prevents duplicate battle starts and duplicate action submissions", async () => {
    const pendingStart = deferred<APIBattle>();
    dependencies.startBattle.mockReturnValue(pendingStart.promise);
    render(<HomePage />);

    const select = screen.getByRole("button", { name: "choose-character" });
    fireEvent.click(select);
    fireEvent.click(select);
    expect(dependencies.startBattle).toHaveBeenCalledOnce();

    pendingStart.resolve(createTestBattle());
    await screen.findByText("authoritative-turn-1");

    const pendingAction = deferred<APIBattleActionResponse>();
    dependencies.submitAction.mockReturnValue(pendingAction.promise);
    const lightAttack = screen.getByRole("button", {
      name: /actions\.lightAttack\.title/
    });
    fireEvent.click(lightAttack);
    fireEvent.click(lightAttack);
    expect(dependencies.submitAction).toHaveBeenCalledOnce();

    pendingAction.resolve({
      battle: createTestBattle({ version: 2, turn: 2 }),
      result: { sequence: 1, events: [] }
    });
    await screen.findByText("authoritative-turn-2", {}, { timeout: 2_000 });
  });

  it("refreshes the authoritative battle after a version conflict", async () => {
    await enterBattle();
    dependencies.submitAction.mockRejectedValueOnce(
      new APIError(409, "version_conflict", "The battle state has changed", "request-1")
    );
    dependencies.refreshBattle.mockResolvedValueOnce(createTestBattle({ version: 2, turn: 2 }));

    fireEvent.click(screen.getByRole("button", { name: /actions\.lightAttack\.title/ }));

    await waitFor(() => expect(dependencies.refreshBattle).toHaveBeenCalledOnce());
    expect(await screen.findByText("authoritative-turn-2")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("战斗状态已更新");
  });

  it.each([
    ["actions.heavyAttack.title", "heavy_attack"],
    ["actions.specialMove.title", "special_move"],
    ["actions.block.title", "block"],
    ["battle.heroAction.counter", "counter"]
  ] as const)("maps %s to the authoritative %s action", async (buttonName, apiAction) => {
    await enterBattle();
    dependencies.submitAction.mockReturnValueOnce(new Promise(() => undefined));

    fireEvent.click(screen.getByRole("button", { name: new RegExp(buttonName) }));

    expect(dependencies.submitAction).toHaveBeenCalledWith(
      expect.objectContaining({
        battleId: createTestBattle().id,
        action: apiAction,
        expectedVersion: 1,
        idempotencyKey: expect.any(String)
      })
    );
  });

  it("keeps the special move disabled until the server meter reaches its cost", async () => {
    const battle = createTestBattle({
      hero: {
        ...createTestBattle().hero,
        special_meter: 49
      }
    });
    await enterBattle(battle);

    const specialMove = screen.getByRole("button", {
      name: /actions\.specialMove\.title/
    });
    expect(specialMove).toBeDisabled();
    fireEvent.click(specialMove);
    expect(dependencies.submitAction).not.toHaveBeenCalled();
  });

  it("shows defeat, stops battle audio, and resets back to character selection", async () => {
    await enterBattle();
    dependencies.submitAction.mockResolvedValueOnce({
      battle: createTestBattle({
        status: "completed",
        outcome: "defeat",
        version: 2,
        turn: 2,
        hero: {
          ...createTestBattle().hero,
          current_health: 0
        },
        rewards: null,
        completed_at: "2026-08-06T12:01:00Z"
      }),
      result: { sequence: 1, events: [] }
    });

    fireEvent.click(screen.getByRole("button", { name: /actions\.lightAttack\.title/ }));

    expect(await screen.findByRole("dialog", {}, { timeout: 2_000 })).toHaveTextContent("reward-defeat");
    expect(dependencies.stopBGM).toHaveBeenCalledOnce();
    expect(dependencies.playSound).toHaveBeenCalledWith("defeat");

    fireEvent.click(screen.getByRole("button", { name: "close-reward" }));
    expect(await screen.findByRole("button", { name: "choose-character" })).toBeInTheDocument();
    expect(dependencies.resetStart).toHaveBeenCalledOnce();
    expect(dependencies.resetAction).toHaveBeenCalledOnce();
    expect(dependencies.playBGM).toHaveBeenLastCalledWith("select", true);
  });
});
