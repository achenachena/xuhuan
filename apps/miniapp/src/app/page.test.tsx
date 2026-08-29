import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  getGameContent: vi.fn(),
  getGame: vi.fn(),
  createRun: vi.fn(),
  getRun: vi.fn(),
  createRunCommand: vi.fn(),
  createStoryChoice: vi.fn(),
}));

vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  ...dependencies,
  createIdempotencyKey: () => "11111111-1111-4111-8111-111111111111",
}));
vi.mock("@/components/providers/use-locale", () => ({
  default: () => ({
    translate: (key: string) => key,
    isReady: true,
    language: "en",
    setLanguage: vi.fn(),
  }),
}));
vi.mock("next/image", () => ({
  default: ({ alt }: { alt?: string }) =>
    alt ? <span role="img" aria-label={alt} /> : <span />,
}));
vi.mock("@/features/action/action-arena", () => ({
  ActionArena: () => <div data-testid="action-arena">ACTION ARENA</div>,
}));

import HomePage from "@/app/page";
import { APIError } from "@/lib/api/client";
import {
  createV3Game,
  createV3Run,
  v3BaseState,
  v3Content,
} from "@/test/v3-fixtures";

describe("Action V3 game shell", () => {
  beforeEach(() => {
    Object.values(dependencies).forEach((mock) => mock.mockReset());
    dependencies.getGameContent.mockResolvedValue(v3Content);
  });

  it("starts the tutorial from the one-tap English prologue", async () => {
    dependencies.getGame.mockResolvedValue(
      createV3Game({ pending_scene_slug: "prologue-last-viewer" }),
    );
    dependencies.createStoryChoice.mockResolvedValue({
      progress: createV3Game().progress,
      pending_scene_slug: null,
    });
    dependencies.createRun.mockResolvedValue(
      createV3Run({
        state: {
          ...v3BaseState,
          phase: "encounter",
          map: {
            nodes: [
              {
                id: "tutorial",
                layer: 0,
                lane: 0,
                type: "tutorial",
                status: "current",
                next: [],
                encounter_slug: "signal-handshake",
              },
            ],
            current_node_id: "tutorial",
          },
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
      }),
    );

    render(<HomePage />);
    expect(
      await screen.findByText("The stream has ended. Current viewers: 1."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep online" }));

    await waitFor(() =>
      expect(dependencies.createStoryChoice).toHaveBeenCalledWith(
        {
          scene_slug: "prologue-last-viewer",
          option_slug: "stay-online",
          expected_version: 1,
        },
        "11111111-1111-4111-8111-111111111111",
      ),
    );
    expect(dependencies.createRun).toHaveBeenCalledWith(
      {
        mode: "campaign",
        chapter_slug: "seventh-dock",
        character_slug: "nana7mi",
        noise_level: 0,
      },
      "11111111-1111-4111-8111-111111111111",
    );
    expect(await screen.findByTestId("action-arena")).toBeInTheDocument();
  });

  it("starts a campaign and renders its authoritative route", async () => {
    dependencies.getGame.mockResolvedValue(createV3Game());
    dependencies.createRun.mockResolvedValue(createV3Run());

    render(<HomePage />);
    fireEvent.click(
      await screen.findByRole("button", { name: /Enter this channel/ }),
    );

    await waitFor(() =>
      expect(dependencies.createRun).toHaveBeenCalledWith(
        {
          mode: "campaign",
          chapter_slug: "seventh-dock",
          character_slug: "nana7mi",
          noise_level: 0,
        },
        "11111111-1111-4111-8111-111111111111",
      ),
    );
    expect(
      await screen.findByRole("img", { name: "Channel topology" }),
    ).toBeInTheDocument();
  });

  it("starts the server-selected daily run without campaign parameters", async () => {
    const game = createV3Game({
      progress: { ...createV3Game().progress, daily_unlocked: true },
    });
    dependencies.getGame.mockResolvedValue(game);
    dependencies.createRun.mockResolvedValue(
      createV3Run({ mode: "daily", daily_date: "2026-08-29" }),
    );

    render(<HomePage />);
    const dailyButtons = await screen.findAllByRole("button", {
      name: "Daily anomaly",
    });
    fireEvent.click(dailyButtons.at(-1)!);

    await waitFor(() =>
      expect(dependencies.createRun).toHaveBeenCalledWith(
        { mode: "daily" },
        "11111111-1111-4111-8111-111111111111",
      ),
    );
  });

  it("renders the latest anonymous daily result independently of active runs", async () => {
    dependencies.getGame.mockResolvedValue(
      createV3Game({
        progress: { ...createV3Game().progress, daily_unlocked: true },
        daily_result: {
          date: "2026-08-29",
          character_slug: "nana7mi",
          score: 4242,
          modules: [{ slug: "route-needle", level: 2 }],
          plugins: ["archive-lens"],
          streak: 3,
        },
      }),
    );

    render(<HomePage />);

    expect(await screen.findByText("4242")).toBeInTheDocument();
    expect(screen.getByText("Clear streak")).toHaveTextContent("Clear streak3");
    expect(screen.queryByTestId("action-arena")).not.toBeInTheDocument();
  });

  it("restores a campaign run without treating browser storage as game truth", async () => {
    dependencies.getGame.mockResolvedValue(
      createV3Game({ campaign_run: createV3Run() }),
    );

    render(<HomePage />);

    expect(
      await screen.findByRole("img", { name: "Channel topology" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("route-map-header")).toHaveClass(
      "pt-[var(--xuhuan-host-safe-top)]",
    );
    expect(dependencies.createRun).not.toHaveBeenCalled();
  });

  it("shows a required story scene before resuming an active campaign", async () => {
    dependencies.getGame.mockResolvedValue(
      createV3Game({
        campaign_run: createV3Run(),
        pending_scene_slug: "nana-midpoint",
      }),
    );

    render(<HomePage />);

    expect(
      await screen.findByText(
        "If two memories disagree, neither one has to be deleted.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: "Channel topology" }),
    ).not.toBeInTheDocument();
  });

  it("keeps rewards safe and sends the one-time reroll command", async () => {
    const run = createV3Run({
      state: {
        ...v3BaseState,
        phase: "reward",
        reward: {
          module_choices: ["route-needle", "soft-firewall"],
          rerolled: false,
        },
      },
    });
    dependencies.getGame.mockResolvedValue(
      createV3Game({ campaign_run: run }),
    );
    dependencies.createRunCommand.mockResolvedValue({ run, events: [] });

    render(<HomePage />);

    expect(await screen.findByText("Route Needle")).toBeInTheDocument();
    expect(screen.getByTestId("interstitial-screen")).toHaveClass(
      "pt-[var(--xuhuan-host-safe-top)]",
    );
    fireEvent.click(screen.getByRole("button", { name: /Free reroll/ }));
    await waitFor(() =>
      expect(dependencies.createRunCommand).toHaveBeenCalledWith(
        run.id,
        { type: "reroll_module_reward", expected_version: 1 },
        "11111111-1111-4111-8111-111111111111",
      ),
    );
  });

  it("resynchronizes the campaign slot after an optimistic conflict", async () => {
    const run = createV3Run();
    dependencies.getGame.mockResolvedValue(
      createV3Game({ campaign_run: run }),
    );
    dependencies.createRunCommand.mockRejectedValueOnce(
      new APIError(409, "version_conflict", "changed"),
    );
    dependencies.getRun.mockResolvedValue(createV3Run({ version: 2 }));

    render(<HomePage />);
    const node = await screen.findByRole("button", {
      name: /Conflict available/i,
    });
    fireEvent.click(node);

    await waitFor(() =>
      expect(dependencies.createRunCommand).toHaveBeenCalledWith(
        run.id,
        { type: "choose_node", node_id: "l1-a", expected_version: 1 },
        "11111111-1111-4111-8111-111111111111",
      ),
    );
    await waitFor(() => expect(dependencies.getRun).toHaveBeenCalledWith(run.id));
    expect(
      screen.queryByText("Connection failed; the authoritative run is safe."),
    ).not.toBeInTheDocument();
  });
});
