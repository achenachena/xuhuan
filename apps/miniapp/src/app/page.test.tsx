import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  APIGameContent,
  APIGameRun,
  APIGameSnapshot,
} from "@/lib/api/client";

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
    language: "zh-CN",
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

const content: APIGameContent = {
  version: "v2",
  protocol: "action-v1",
  locale: "zh-CN",
  characters: [
    {
      slug: "nana7mi",
      name: "七海",
      biography: "数字分身",
      playstyle: "航线循环",
      color_theme: "#67e8f9",
      portrait_url: "/nana.png",
      model_url: "/nana.png",
      available: true,
    },
  ],
  modules: [
    {
      slug: "route-needle",
      character_slug: "nana7mi",
      name: "航线针",
      description: "攻击提高",
      archetype: "route",
      rarity: "common",
      effects: [{ kind: "attack_damage", amount: 2 }],
    },
  ],
  plugins: [],
  enemies: [
    {
      slug: "retention-drone",
      name: "留存无人机",
      description: "测试敌人",
      kind: "normal",
      pattern: "chaser",
      max_health: 28,
      speed: 10,
      contact_damage: 5,
      fire_interval: 0,
      projectile_speed: 0,
      projectile_damage: 0,
      color_theme: "#f43f5e",
      image_url: "/game/v2/retention-drone.webp",
    },
  ],
  encounters: [
    {
      slug: "signal-handshake",
      kind: "tutorial",
      duration_ticks: 1350,
      max_ticks: 1350,
      spawn_interval: 240,
      max_alive: 3,
      enemy_slugs: ["retention-drone"],
      tutorial: true,
    },
  ],
  events: [],
  scenes: [
    {
      slug: "prologue-last-viewer",
      title: "最后一位观众",
      messages: [
        { sender: "system", kind: "system", text: "检测到仅一位观众在线。" },
      ],
      options: [{ slug: "answer", label: "回复七海" }],
    },
  ],
  chapters: [
    {
      slug: "seventh-dock",
      title: "第七码头没有海",
      subtitle: "找回非标准的七海",
      character_slug: "nana7mi",
      available: true,
    },
  ],
};

const baseState: APIGameRun["state"] = {
  phase: "map",
  chapter_slug: "seventh-dock",
  character_slug: "nana7mi",
  weapon_slug: "auto-signal",
  noise_level: 0,
  health: 64,
  max_health: 64,
  modules: [],
  plugins: [],
  map: {
    nodes: [
      {
        id: "l1-a",
        layer: 1,
        lane: 0,
        type: "combat",
        status: "available",
        next: [],
        encounter_slug: "signal-handshake",
      },
    ],
  },
  choice_tags: [],
  rng_cursor: 1,
  emergency_reconnect_available: true,
};

const createRun = (overrides: Partial<APIGameRun> = {}): APIGameRun => ({
  id: "10000000-0000-4000-8000-000000000001",
  content_version: "v2",
  state: baseState,
  status: "active",
  outcome: null,
  version: 1,
  created_at: "2026-08-18T12:00:00Z",
  updated_at: "2026-08-18T12:00:00Z",
  completed_at: null,
  ...overrides,
});

const createGame = (
  overrides: Partial<APIGameSnapshot> = {},
): APIGameSnapshot => ({
  protocol: "action-v1",
  player: {
    id: "20000000-0000-4000-8000-000000000002",
    display_name: "Viewer One",
    language_code: "zh-CN",
  },
  progress: {
    current_chapter_slug: "seventh-dock",
    highest_noise_level: 0,
    story_version: 2,
    version: 1,
    unlocks: [],
    choices: [],
  },
  active_run: null,
  pending_scene_slug: null,
  onboarding_stage: "complete",
  ...overrides,
});

describe("story roguelite page", () => {
  beforeEach(() => {
    Object.values(dependencies).forEach((mock) => mock.mockReset());
    dependencies.getGameContent.mockResolvedValue(content);
  });

  it("plays a pending story scene before showing the run hub", async () => {
    dependencies.getGame.mockResolvedValue(
      createGame({ pending_scene_slug: "prologue-last-viewer" }),
    );
    dependencies.createStoryChoice.mockResolvedValue({
      progress: createGame().progress,
      pending_scene_slug: null,
    });
    dependencies.createRun.mockResolvedValue(
      createRun({
        state: {
          ...baseState,
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
            duration_ticks: 1350,
            max_ticks: 1350,
            tutorial: true,
          },
        },
      }),
    );

    render(<HomePage />);
    expect(
      await screen.findByText("检测到仅一位观众在线。"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "回复七海" }));

    await waitFor(() =>
      expect(dependencies.createStoryChoice).toHaveBeenCalledWith(
        {
          scene_slug: "prologue-last-viewer",
          option_slug: "answer",
          expected_version: 1,
        },
        "11111111-1111-4111-8111-111111111111",
      ),
    );
    expect(await screen.findByTestId("action-arena")).toBeInTheDocument();
  });

  it("starts a run and immediately renders its authoritative map", async () => {
    dependencies.getGame.mockResolvedValue(createGame());
    dependencies.createRun.mockResolvedValue(createRun());

    render(<HomePage />);
    fireEvent.click(
      await screen.findByRole("button", { name: /再次潜入第七码头/ }),
    );

    await waitFor(() =>
      expect(dependencies.createRun).toHaveBeenCalledWith(
        {
          chapter_slug: "seventh-dock",
          character_slug: "nana7mi",
          noise_level: 0,
        },
        "11111111-1111-4111-8111-111111111111",
      ),
    );
    expect(
      await screen.findByRole("img", { name: "频道拓扑" }),
    ).toBeInTheDocument();
  });

  it("restores an unfinished run without using browser storage", async () => {
    dependencies.getGame.mockResolvedValue(
      createGame({ active_run: createRun() }),
    );

    render(<HomePage />);

    expect(
      await screen.findByRole("img", { name: "频道拓扑" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("route-map-header")).toHaveClass(
      "pt-[var(--xuhuan-host-safe-top)]",
    );
    expect(dependencies.createRun).not.toHaveBeenCalled();
  });

  it("keeps reward content below the Telegram host controls", async () => {
    dependencies.getGame.mockResolvedValue(
      createGame({
        active_run: createRun({
          state: {
            ...baseState,
            phase: "reward",
            reward: { module_choices: ["route-needle"] },
          },
        }),
      }),
    );

    render(<HomePage />);

    expect(await screen.findByText("航线针")).toBeInTheDocument();
    expect(screen.getByTestId("interstitial-screen")).toHaveClass(
      "pt-[var(--xuhuan-host-safe-top)]",
    );
  });

  it("submits expected_version and resynchronizes after a conflict", async () => {
    const run = createRun();
    dependencies.getGame.mockResolvedValue(createGame({ active_run: run }));
    dependencies.createRunCommand.mockRejectedValueOnce(
      new APIError(409, "version_conflict", "changed"),
    );
    dependencies.getRun.mockResolvedValue(createRun({ version: 2 }));

    render(<HomePage />);
    const node = await screen.findByRole("button", { name: /冲突 available/ });
    fireEvent.click(node);

    await waitFor(() =>
      expect(dependencies.createRunCommand).toHaveBeenCalledWith(
        run.id,
        { type: "choose_node", node_id: "l1-a", expected_version: 1 },
        "11111111-1111-4111-8111-111111111111",
      ),
    );
    await waitFor(() =>
      expect(dependencies.getRun).toHaveBeenCalledWith(run.id),
    );
    expect(
      screen.queryByText("连接失败；服务器状态没有丢失。"),
    ).not.toBeInTheDocument();
  });
});
