import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { APIGameContent } from "@/lib/api/client";
import {
  createV3Game,
  createV3Run,
  v3BaseState,
  v3Content,
} from "@/test/v3-fixtures";

const dependencies = vi.hoisted(() => ({
  getGameContent: vi.fn(),
  getGame: vi.fn(),
  getRun: vi.fn(),
  createRun: vi.fn(),
  createRunCommand: vi.fn(),
  createStoryChoice: vi.fn(),
}));

vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  ...dependencies,
  createIdempotencyKey: () => "11111111-1111-4111-8111-111111111111",
}));

import { useGameController } from "@/features/game/use-game-controller";

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
};

describe("useGameController action-v2 orchestration", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    Object.values(dependencies).forEach((mock) => mock.mockReset());
    dependencies.getGameContent.mockResolvedValue(v3Content);
    dependencies.getGame.mockResolvedValue(createV3Game());
  });

  it("ignores stale content when the locale changes", async () => {
    const english = deferred<APIGameContent>();
    const chinese = deferred<APIGameContent>();
    dependencies.getGameContent.mockImplementation((locale) =>
      locale === "en" ? english.promise : chinese.promise,
    );

    const { result, rerender } = renderHook(
      ({ locale }: { locale: "en" | "zh-CN" }) => useGameController(locale),
      { initialProps: { locale: "en" as "en" | "zh-CN" } },
    );
    await waitFor(() =>
      expect(dependencies.getGameContent).toHaveBeenCalledWith("en"),
    );

    rerender({ locale: "zh-CN" });
    await waitFor(() =>
      expect(dependencies.getGameContent).toHaveBeenCalledWith("zh-CN"),
    );
    await act(async () =>
      chinese.resolve({ ...v3Content, locale: "zh-CN" }),
    );
    await waitFor(() => expect(result.current.content?.locale).toBe("zh-CN"));

    await act(async () => english.resolve(v3Content));
    expect(result.current.content?.locale).toBe("zh-CN");
  });

  it("creates independent campaign and daily slots with the new signatures", async () => {
    const campaign = createV3Run();
    const daily = createV3Run({
      id: "10000000-0000-4000-8000-000000000009",
      mode: "daily",
      daily_date: "2026-08-29",
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
        noise_level: 0,
      },
      "11111111-1111-4111-8111-111111111111",
    );
    expect(result.current.game?.campaign_run?.id).toBe(campaign.id);

    await act(async () => result.current.startDaily());
    expect(dependencies.createRun).toHaveBeenNthCalledWith(
      2,
      { mode: "daily" },
      "11111111-1111-4111-8111-111111111111",
    );
    expect(result.current.game?.campaign_run?.id).toBe(campaign.id);
    expect(result.current.game?.daily_run?.id).toBe(daily.id);
  });

  it("automatically resumes the tutorial when the prologue already committed", async () => {
    const tutorial = createV3Run();
    dependencies.getGame.mockResolvedValue(
      createV3Game({ onboarding_stage: "tutorial" }),
    );
    dependencies.createRun.mockResolvedValue(tutorial);

    const { result } = renderHook(() => useGameController("en"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(dependencies.createRun).toHaveBeenCalledWith(
      {
        mode: "campaign",
        chapter_slug: "seventh-dock",
        character_slug: "nana7mi",
        noise_level: 0,
      },
      "11111111-1111-4111-8111-111111111111",
    );
    expect(result.current.game?.campaign_run?.id).toBe(tutorial.id);
    expect(
      window.sessionStorage.getItem("xuhuan.pending-tutorial-run.v3"),
    ).toBeNull();
  });

  it("recovers the one-tap tutorial with the same run key after a lost response", async () => {
    const intro = createV3Game({
      pending_scene_slug: "prologue-last-viewer",
      onboarding_stage: "intro",
    });
    const committed = createV3Game({
      progress: { ...intro.progress, version: 2 },
      onboarding_stage: "tutorial",
    });
    const tutorial = createV3Run();
    dependencies.getGame
      .mockReset()
      .mockResolvedValueOnce(intro)
      .mockResolvedValueOnce(committed);
    dependencies.createStoryChoice.mockResolvedValue({
      progress: committed.progress,
      pending_scene_slug: null,
    });
    dependencies.createRun
      .mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError"))
      .mockResolvedValueOnce(tutorial);

    const { result } = renderHook(() => useGameController("en"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.chooseStory(
        "prologue-last-viewer",
        "stay-online",
      );
    });

    expect(dependencies.createRun).toHaveBeenCalledTimes(2);
    expect(dependencies.createRun.mock.calls[1]?.[1]).toBe(
      dependencies.createRun.mock.calls[0]?.[1],
    );
    expect(result.current.game?.campaign_run?.id).toBe(tutorial.id);
    expect(result.current.error).toBeNull();
  });

  it("recovers when the prologue response is lost after the server commits", async () => {
    const intro = createV3Game({
      pending_scene_slug: "prologue-last-viewer",
      onboarding_stage: "intro",
    });
    const committed = createV3Game({
      progress: { ...intro.progress, version: 2 },
      onboarding_stage: "tutorial",
    });
    const tutorial = createV3Run();
    dependencies.getGame
      .mockReset()
      .mockResolvedValueOnce(intro)
      .mockResolvedValueOnce(committed);
    dependencies.createStoryChoice.mockRejectedValue(
      new DOMException("Timed out", "TimeoutError"),
    );
    dependencies.createRun.mockResolvedValue(tutorial);

    const { result } = renderHook(() => useGameController("en"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.chooseStory(
        "prologue-last-viewer",
        "stay-online",
      );
    });

    expect(result.current.game?.campaign_run?.id).toBe(tutorial.id);
    expect(result.current.error).toBeNull();
  });

  it("retries one completed room trace after a transient reload", async () => {
    const encounter = createV3Run({
      state: {
        ...v3BaseState,
        phase: "encounter",
        encounter: {
          slug: "signal-handshake",
          seed: "seed:tutorial",
          kind: "tutorial",
          duration_ticks: 600,
          max_ticks: 900,
          tutorial: true,
          objective: { kind: "recover", target: 3 },
          risk: 1,
          reward_bias: "surge",
          hazards: [],
        },
      },
    });
    const reward = createV3Run({
      version: 2,
      state: {
        ...v3BaseState,
        phase: "reward",
        reward: { module_choices: ["route-needle"], rerolled: false },
      },
    });
    const body = {
      type: "complete_encounter",
      expected_version: 1,
      trace: {
        encoding: "rle8-v1",
        ticks: 12,
        data: "MAw",
        prediction_digest: "4b2517cd",
      },
    } as const;
    window.sessionStorage.setItem(
      "xuhuan.pending-encounter.v3",
      JSON.stringify({
        runId: encounter.id,
        mode: "campaign",
        version: 1,
        idempotencyKey: "pending-key",
        body,
      }),
    );
    dependencies.getGame.mockResolvedValue(
      createV3Game({ campaign_run: encounter }),
    );
    dependencies.createRunCommand.mockResolvedValue({ run: reward, events: [] });

    const { result } = renderHook(() => useGameController("en"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(dependencies.createRunCommand).toHaveBeenCalledWith(
      encounter.id,
      body,
      "pending-key",
    );
    expect(result.current.game?.campaign_run?.version).toBe(2);
    expect(
      window.sessionStorage.getItem("xuhuan.pending-encounter.v3"),
    ).toBeNull();
  });

  it("discards an untrusted pending command instead of replaying it", async () => {
    const encounter = createV3Run({
      state: {
        ...v3BaseState,
        phase: "encounter",
        encounter: {
          slug: "signal-handshake",
          seed: "seed:tutorial",
          kind: "tutorial",
          duration_ticks: 600,
          max_ticks: 900,
          tutorial: true,
          objective: { kind: "recover", target: 3 },
          risk: 1,
          reward_bias: "surge",
          hazards: [],
        },
      },
    });
    window.sessionStorage.setItem(
      "xuhuan.pending-encounter.v3",
      JSON.stringify({
        runId: encounter.id,
        mode: "campaign",
        version: 1,
        idempotencyKey: "malicious-key",
        body: { type: "abandon_run", expected_version: 1 },
      }),
    );
    dependencies.getGame.mockResolvedValue(
      createV3Game({ campaign_run: encounter }),
    );

    const { result } = renderHook(() => useGameController("en"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(dependencies.createRunCommand).not.toHaveBeenCalled();
    expect(
      window.sessionStorage.getItem("xuhuan.pending-encounter.v3"),
    ).toBeNull();
  });

  it("reuses the original trace and idempotency key after a transient submit failure", async () => {
    const encounter = createV3Run({
      state: {
        ...v3BaseState,
        phase: "encounter",
        encounter: {
          slug: "signal-handshake",
          seed: "seed:tutorial",
          kind: "tutorial",
          duration_ticks: 600,
          max_ticks: 900,
          tutorial: true,
          objective: { kind: "recover", target: 3 },
          risk: 1,
          reward_bias: "surge",
          hazards: [],
        },
      },
    });
    const reward = createV3Run({
      version: 2,
      state: {
        ...v3BaseState,
        phase: "reward",
        reward: { module_choices: ["route-needle"], rerolled: false },
      },
    });
    const originalTrace = {
      encoding: "rle8-v1" as const,
      ticks: 12,
      data: "MAw",
      prediction_digest: "4b2517cd",
    };
    const replacementTrace = {
      ...originalTrace,
      data: "unexpected-replacement",
      prediction_digest: "ffffffff",
    };
    dependencies.getGame.mockResolvedValue(
      createV3Game({ campaign_run: encounter }),
    );
    dependencies.createRunCommand
      .mockRejectedValueOnce(new Error("temporary network failure"))
      .mockResolvedValueOnce({ run: reward, events: [] });

    const { result } = renderHook(() => useGameController("en"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.command("campaign", {
        type: "complete_encounter",
        trace: originalTrace,
      });
    });
    const pending = JSON.parse(
      window.sessionStorage.getItem("xuhuan.pending-encounter.v3") ?? "null",
    );
    expect(pending.body.trace).toEqual(originalTrace);

    await act(async () => {
      await result.current.command("campaign", {
        type: "complete_encounter",
        trace: replacementTrace,
      });
    });

    expect(dependencies.createRunCommand).toHaveBeenCalledTimes(2);
    expect(dependencies.createRunCommand.mock.calls[1]).toEqual(
      dependencies.createRunCommand.mock.calls[0],
    );
    expect(result.current.game?.campaign_run?.version).toBe(2);
    expect(
      window.sessionStorage.getItem("xuhuan.pending-encounter.v3"),
    ).toBeNull();
  });

  it("accepts an encounter when authority advanced after the response was lost", async () => {
    const encounter = createV3Run({
      state: {
        ...v3BaseState,
        phase: "encounter",
        encounter: {
          slug: "signal-handshake",
          seed: "seed:tutorial",
          kind: "tutorial",
          duration_ticks: 600,
          max_ticks: 900,
          tutorial: true,
          objective: { kind: "recover", target: 3 },
          risk: 1,
          reward_bias: "surge",
          hazards: [],
        },
      },
    });
    const reward = createV3Run({
      version: 2,
      state: {
        ...v3BaseState,
        phase: "reward",
        reward: { module_choices: ["route-needle"], rerolled: false },
      },
    });
    dependencies.getGame
      .mockReset()
      .mockResolvedValueOnce(createV3Game({ campaign_run: encounter }))
      .mockResolvedValueOnce(createV3Game({ campaign_run: reward }));
    dependencies.createRunCommand.mockRejectedValueOnce(
      new DOMException("request timed out", "TimeoutError"),
    );

    const { result } = renderHook(() => useGameController("en"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      const response = await result.current.command("campaign", {
        type: "complete_encounter",
        trace: {
          encoding: "rle8-v1",
          ticks: 12,
          data: "MAw",
          prediction_digest: "4b2517cd",
        },
      });
      expect(response?.run.version).toBe(2);
    });

    expect(result.current.game?.campaign_run?.state.phase).toBe("reward");
    expect(result.current.error).toBeNull();
    expect(
      window.sessionStorage.getItem("xuhuan.pending-encounter.v3"),
    ).toBeNull();
  });

  it("refetches the snapshot when a command opens a mid-run story scene", async () => {
    const current = createV3Run();
    const advanced = createV3Run({
      version: 2,
      state: {
        ...v3BaseState,
        phase: "event",
        current_event_slug: "discarded-caption",
      },
    });
    const initial = createV3Game({ campaign_run: current });
    const storyPending = createV3Game({
      campaign_run: advanced,
      pending_scene_slug: "nana-midpoint",
    });
    dependencies.getGame
      .mockReset()
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(storyPending);
    dependencies.createRunCommand.mockResolvedValue({
      run: advanced,
      events: [{ kind: "story_scene_ready", scene_slug: "nana-midpoint" }],
    });

    const { result } = renderHook(() => useGameController("en"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.command("campaign", {
        type: "choose_node",
        node_id: "l1-a",
      });
    });

    expect(dependencies.getGame).toHaveBeenNthCalledWith(2, "en");
    expect(result.current.game?.campaign_run?.version).toBe(2);
    expect(result.current.game?.pending_scene_slug).toBe("nana-midpoint");
  });

});
