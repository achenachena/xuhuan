import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ShooterContent } from "@/lib/api/types";
import type { ShooterSegmentOutcome } from "@/lib/api/types";
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

const outcome: ShooterSegmentOutcome = { won: true, health: 3, score: 100 };

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
    const english = deferred<ShooterContent>();
    const chinese = deferred<ShooterContent>();
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
        outcome,
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
      { type: "complete_segment", expected_version: 1, segment_outcome: outcome },
      "pending-key",
    );
    expect(result.current.game?.campaign_run?.state.phase).toBe("show_choice");
    expect(window.sessionStorage.getItem("xuhuan.pending-segment.v4")).toBeNull();
  });

  it("reuses the original segment result after a transient failure", async () => {
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
        segment_outcome: outcome,
      });
    });
    await act(async () => {
      await result.current.command("campaign", {
        type: "complete_segment",
        segment_outcome: { ...outcome, score: 200 },
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
        outcome: { ...outcome, health: 9 },
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

  it("still submits results when the WebView denies session storage", async () => {
    const current = createV4Run();
    dependencies.getGame.mockResolvedValue(createV4Game({ campaign_run: current }));
    for (const method of ["getItem", "setItem", "removeItem"] as const) {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => { throw new Error("Storage denied"); });
    }
    const next = createV4Run({ version: 2 });
    dependencies.createRunCommand.mockResolvedValue({ run: next, events: [] });
    const { result } = renderHook(() => useGameController("en"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.command("campaign", { type: "complete_segment", segment_outcome: outcome }); });
    expect(dependencies.createRunCommand).toHaveBeenCalledTimes(1);
    expect(result.current.game?.campaign_run?.version).toBe(2);
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("retains an unchanged room during translation but replaces an advanced version", async () => {
    const current = createV4Run();
    dependencies.getGame.mockResolvedValue(createV4Game({ campaign_run: current }));
    const { result, rerender } = renderHook(({ locale }: { locale: "en" | "zh-CN" }) => useGameController(locale), {
      initialProps: { locale: "en" as "en" | "zh-CN" },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const saved = result.current.game?.campaign_run;
    dependencies.getGame.mockResolvedValue(createV4Game({ campaign_run: structuredClone(current) }));
    rerender({ locale: "zh-CN" });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.game?.campaign_run).toBe(saved);
    dependencies.getGame.mockResolvedValue(createV4Game({ campaign_run: createV4Run({ version: 2 }) }));
    await act(async () => { await result.current.load(); });
    expect(result.current.game?.campaign_run).not.toBe(saved);
    expect(result.current.game?.campaign_run?.version).toBe(2);
  });

  it("keeps completed results while translating until Return to group is explicit", async () => {
    const current = createV4Run();
    const completed = createV4Run({ status: "completed", outcome: "cleared", version: 2,
      state: { ...v4BaseState, phase: "completed", segment: undefined } });
    dependencies.getGame.mockResolvedValue(createV4Game({ campaign_run: current }));
    dependencies.createRunCommand.mockResolvedValue({ run: completed, events: [] });
    const { result, rerender } = renderHook(({ locale }: { locale: "en" | "zh-CN" }) => useGameController(locale), {
      initialProps: { locale: "en" as "en" | "zh-CN" },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.command("campaign", { type: "complete_segment", segment_outcome: outcome }); });
    dependencies.getGame.mockResolvedValue(createV4Game({ campaign_run: null }));
    dependencies.getGameContent.mockResolvedValue({ ...v4Content, locale: "zh-CN" });
    rerender({ locale: "zh-CN" });
    await waitFor(() => expect(result.current.content?.locale).toBe("zh-CN"));
    expect(result.current.game?.campaign_run).toBe(completed);
    await act(async () => { await result.current.returnToHub(); });
    expect(result.current.game?.campaign_run).toBeNull();
  });

  it("does not roll back a completed command when an older locale request finishes later", async () => {
    const current = createV4Run();
    const gate = createV4Run({ version: 2, state: { ...v4BaseState, phase: "show_choice", segment: undefined } });
    const localizedGame = deferred<ReturnType<typeof createV4Game>>();
    dependencies.getGame.mockResolvedValueOnce(createV4Game({ campaign_run: current })).mockReturnValueOnce(localizedGame.promise);
    dependencies.createRunCommand.mockResolvedValue({ run: gate, events: [] });
    const { result, rerender } = renderHook(({ locale }: { locale: "en" | "zh-CN" }) => useGameController(locale), {
      initialProps: { locale: "en" as "en" | "zh-CN" },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    dependencies.getGameContent.mockResolvedValue({ ...v4Content, locale: "zh-CN" });
    rerender({ locale: "zh-CN" });
    await act(async () => { await result.current.command("campaign", { type: "complete_segment", segment_outcome: outcome }); });
    expect(result.current.game?.campaign_run).toBe(gate);
    await act(async () => localizedGame.resolve(createV4Game({ campaign_run: current })));
    expect(result.current.game?.campaign_run).toBe(gate);
    expect(result.current.content?.locale).toBe("zh-CN");
    expect(result.current.busy).toBe(false);
  });

  it("refreshes copy without clearing a pending command's busy guard or sending it twice", async () => {
    const current = createV4Run();
    const response = deferred<{ run: ReturnType<typeof createV4Run>; events: [] }>();
    dependencies.getGame.mockResolvedValue(createV4Game({ campaign_run: current }));
    dependencies.createRunCommand.mockReturnValue(response.promise);
    const { result, rerender } = renderHook(({ locale }: { locale: "en" | "zh-CN" }) => useGameController(locale), {
      initialProps: { locale: "en" as "en" | "zh-CN" },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    let firstRequest!: Promise<unknown>;
    act(() => { firstRequest = result.current.command("campaign", { type: "complete_segment", segment_outcome: outcome }); });
    dependencies.getGameContent.mockResolvedValue({ ...v4Content, locale: "zh-CN" });
    rerender({ locale: "zh-CN" });
    await waitFor(() => expect(result.current.content?.locale).toBe("zh-CN"));
    expect(result.current.busy).toBe(true);
    await act(async () => { expect(await result.current.command("campaign", { type: "complete_segment", segment_outcome: outcome })).toBeNull(); });
    expect(dependencies.createRunCommand).toHaveBeenCalledTimes(1);
    await act(async () => {
      response.resolve({ run: createV4Run({ version: 2 }), events: [] });
      await firstRequest;
    });
    expect(result.current.game?.campaign_run?.version).toBe(2);
    expect(result.current.busy).toBe(false);
  });

  it.each(["campaign", "daily"] as const)("keeps a new %s Run when an older refresh returns an empty slot", async (mode) => {
    const localizedGame = deferred<ReturnType<typeof createV4Game>>();
    const created = createV4Run({ mode });
    const creation = deferred<ReturnType<typeof createV4Run>>();
    dependencies.getGame.mockResolvedValueOnce(createV4Game()).mockReturnValueOnce(localizedGame.promise);
    dependencies.createRun.mockReturnValue(creation.promise);
    const { result, rerender } = renderHook(({ locale }: { locale: "en" | "zh-CN" }) => useGameController(locale), {
      initialProps: { locale: "en" as "en" | "zh-CN" },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const start = () => mode === "campaign" ? result.current.startCampaign("seventh-dock", "nana7mi", 0) : result.current.startDaily();
    let firstRequest!: Promise<void>;
    act(() => { firstRequest = start(); });
    rerender({ locale: "zh-CN" });
    await act(async () => { await start(); });
    expect(dependencies.createRun).toHaveBeenCalledTimes(1);
    await act(async () => {
      creation.resolve(created);
      await firstRequest;
      localizedGame.resolve(createV4Game());
    });
    expect(mode === "campaign" ? result.current.game?.campaign_run : result.current.game?.daily_run).toBe(created);
    expect(result.current.busy).toBe(false);
  });

  it("keeps a newer Run version when a later refresh returns older state", async () => {
    const current = createV4Run({ version: 3 });
    dependencies.getGame.mockResolvedValue(createV4Game({ campaign_run: current }));
    const { result } = renderHook(() => useGameController("en"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    dependencies.getGame.mockResolvedValue(createV4Game({ campaign_run: createV4Run({ version: 2 }) }));
    await act(async () => { await result.current.load(); });
    expect(result.current.game?.campaign_run).toBe(current);
  });
});
