import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { APIGameContent } from "@/lib/api/client";
import type { ShooterTrace } from "@/lib/api/types";
import {
  createV4Game,
  createV4Run,
  v4BaseState,
  v4Content,
} from "@/test/v4-fixtures";

const dependencies = vi.hoisted(() => ({
  getGameContent: vi.fn(),
  getGame: vi.fn(),
  getRun: vi.fn(),
  createRun: vi.fn(),
  createRunCommand: vi.fn(),
}));

vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  ...dependencies,
  createIdempotencyKey: () => "11111111-1111-4111-8111-111111111111",
}));

import { useGameController } from "@/features/game/use-game-controller";

const trace: ShooterTrace = {
  encoding: "x-position-rle-v1",
  ticks: 12,
  runs: [[64, 12]],
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
};

describe("useGameController shooter-v1 orchestration", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    Object.values(dependencies).forEach((mock) => mock.mockReset());
    dependencies.getGameContent.mockResolvedValue(v4Content);
    dependencies.getGame.mockResolvedValue(createV4Game());
  });

  it("ignores stale localized content after the locale changes", async () => {
    const english = deferred<APIGameContent>();
    const chinese = deferred<APIGameContent>();
    dependencies.getGameContent.mockImplementation((locale) =>
      locale === "en" ? english.promise : chinese.promise,
    );
    const { result, rerender } = renderHook(
      ({ locale }: { locale: "en" | "zh-CN" }) => useGameController(locale),
      { initialProps: { locale: "en" as "en" | "zh-CN" } },
    );

    rerender({ locale: "zh-CN" });
    await act(async () => {
      chinese.resolve({ ...v4Content, locale: "zh-CN" });
    });
    await waitFor(() => expect(result.current.content?.locale).toBe("zh-CN"));

    await act(async () => english.resolve(v4Content));
    expect(result.current.content?.locale).toBe("zh-CN");
  });

  it("creates independent campaign and daily run slots", async () => {
    const campaign = createV4Run();
    const daily = createV4Run({
      id: "10000000-0000-4000-8000-000000000009",
      mode: "daily",
    });
    dependencies.createRun
      .mockResolvedValueOnce(campaign)
      .mockResolvedValueOnce(daily);
    const { result } = renderHook(() => useGameController("en"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () =>
      result.current.startCampaign("seventh-dock", "nana7mi", 0),
    );
    expect(dependencies.createRun).toHaveBeenNthCalledWith(
      1,
      {
        mode: "campaign",
        chapter_slug: "seventh-dock",
        character_slug: "nana7mi",
        encore_level: 0,
      },
      "11111111-1111-4111-8111-111111111111",
    );

    await act(async () => result.current.startDaily());
    expect(result.current.game?.campaign_run?.id).toBe(campaign.id);
    expect(result.current.game?.daily_run?.id).toBe(daily.id);
  });

  it("replays one trusted pending segment with the original key", async () => {
    const current = createV4Run();
    const gate = createV4Run({
      version: 2,
      state: {
        ...v4BaseState,
        phase: "show_choice",
        segment: undefined,
        pending_show_options: ["double-take", "safety-chat"],
      },
    });
    window.sessionStorage.setItem(
      "xuhuan.pending-segment.v4",
      JSON.stringify({
        runId: current.id,
        mode: "campaign",
        version: 1,
        idempotencyKey: "pending-key",
        trace,
      }),
    );
    dependencies.getGame.mockResolvedValue(
      createV4Game({ campaign_run: current }),
    );
    dependencies.createRunCommand.mockResolvedValue({ run: gate, events: [] });

    const { result } = renderHook(() => useGameController("en"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(dependencies.createRunCommand).toHaveBeenCalledWith(
      current.id,
      { type: "complete_segment", expected_version: 1, trace },
      "pending-key",
    );
    expect(result.current.game?.campaign_run?.state.phase).toBe("show_choice");
    expect(window.sessionStorage.getItem("xuhuan.pending-segment.v4")).toBeNull();
  });

  it("reuses the original segment trace after a transient failure", async () => {
    const current = createV4Run();
    const gate = createV4Run({
      version: 2,
      state: {
        ...v4BaseState,
        phase: "show_choice",
        segment: undefined,
        pending_show_options: ["double-take", "safety-chat"],
      },
    });
    dependencies.getGame.mockResolvedValue(
      createV4Game({ campaign_run: current }),
    );
    dependencies.createRunCommand
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce({ run: gate, events: [] });
    const { result } = renderHook(() => useGameController("en"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.command("campaign", {
        type: "complete_segment",
        trace,
      });
    });
    await act(async () => {
      await result.current.command("campaign", {
        type: "complete_segment",
        trace: { ...trace, runs: [[0, 12]] },
      });
    });

    expect(dependencies.createRunCommand.mock.calls[1]).toEqual(
      dependencies.createRunCommand.mock.calls[0],
    );
    expect(result.current.game?.campaign_run?.version).toBe(2);
  });

  it("drops malformed pending storage instead of replaying it", async () => {
    const current = createV4Run();
    window.sessionStorage.setItem(
      "xuhuan.pending-segment.v4",
      JSON.stringify({
        runId: current.id,
        mode: "campaign",
        version: 1,
        idempotencyKey: "pending-key",
        trace: { ...trace, runs: [[64, 0]] },
      }),
    );
    dependencies.getGame.mockResolvedValue(
      createV4Game({ campaign_run: current }),
    );

    const { result } = renderHook(() => useGameController("en"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(dependencies.createRunCommand).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem("xuhuan.pending-segment.v4")).toBeNull();
  });
});
