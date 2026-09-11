import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PortfolioDemoManifest } from "@/features/portfolio/demo-types";
import type { ShooterResult } from "@/features/shooter/types";
import type { ShooterContent, ShooterGameRun } from "@/lib/api/types";
import { v4BaseState, v4Content, v4Runtime } from "@/test/v4-fixtures";

const localeState = vi.hoisted(() => ({ language: "en" as "en" | "zh-CN" }));
const arenaState = vi.hoisted(() => ({
  mounts: 0,
  run: null as ShooterGameRun | null,
  content: null as ShooterContent | null,
  musicProgress: 0,
}));

vi.mock("@/components/providers/use-locale", () => ({
  default: () => ({ language: localeState.language, setLanguage: vi.fn() }),
}));
vi.mock("@/features/portfolio/show-choice-preview", () => ({
  ShowChoicePreview: ({ weapon }: { weapon: string }) => <canvas data-testid={`preview-${weapon}`} />,
}));
vi.mock("@/features/shooter/shooter-arena", async () => {
  const { useEffect } = await import("react");
  return {
    ShooterArena: ({ run, content, musicProgress = 0, onComplete }: {
      run: ShooterGameRun;
      content: ShooterContent;
      musicProgress?: number;
      onComplete: (result: ShooterResult) => Promise<boolean>;
    }) => {
      useEffect(() => { arenaState.mounts += 1; }, []);
      arenaState.run = run;
      arenaState.content = content;
      arenaState.musicProgress = musicProgress;
      return <>
        <button data-testid={`finish-${run.state.segment?.segment_slug}`} onClick={() => void onComplete(result)}>FINISH</button>
        <button data-testid={`fail-${run.state.segment?.segment_slug}`} onClick={() => void onComplete({ ...result, won: false, health: 0 })}>FAIL</button>
      </>;
    },
  };
});

import { BrowserDemo } from "@/features/portfolio/browser-demo";

const result: ShooterResult = {
  won: true,
  health: 2,
  ticks: 1_200,
  kills: 4,
  rescues_used: 1,
  grazes: 2,
  score: 500,
  final: {
    tick: 1_200, player_x: 1_800, health: 2, max_health: 3,
    shield: 0, invulnerable_ticks: 0, rescue_charge: 0,
    rescues_used: 1, graze_count: 2, combo: 0, score: 500,
    enemies: [], enemy_projectiles: [], player_projectiles: [],
    pickups: [], threats: [], effects: [],
    reversal: { breaks: 3, weapon: "single", fans: [] },
  },
};

const manifest: PortfolioDemoManifest = {
  version: "demo-v3",
  locale: "en",
  opening: "Where's the mod? ...Oh. Just you.",
  content: v4Content,
  wave: {
    ...v4BaseState.segment!,
    segment_slug: "reversal-wave",
    duration_ticks: 1_200,
    runtime_config: { ...v4Runtime, duration_ticks: 1_200, reversal: { weapon: "single", groups: [] } },
  },
  options: ([
    ["double-take", "Twin Live Feed", "twin"],
    ["clean-cut", "Piercing Cannon", "pierce"],
  ] as const).map(([id, name, weapon]) => ({
    id,
    name,
    boss: {
      ...v4BaseState.segment!,
      segment_slug: `reversal-boss-${id}`,
      segment_index: 1,
      duration_ticks: 1_350,
      boss_id: "optimal-nana",
      wave_id: undefined,
      reward_stage: undefined,
      runtime_config: {
        ...v4Runtime,
        seed: `reversal-boss:${id}`,
        duration_ticks: 1_350,
        reversal: { weapon, groups: [] },
        boss: { id: "optimal-nana", health: 360, score: 1_000, stages: [] },
      },
    },
  })),
};

const translatedManifest: PortfolioDemoManifest = {
  ...structuredClone(manifest),
  locale: "zh-CN",
  options: manifest.options.map((option, index) => ({ ...option, name: index === 0 ? "Twin translated" : "Pierce translated" })),
};

describe("browser reversal demo", () => {
  beforeEach(() => {
    localeState.language = "en";
    arenaState.mounts = 0;
    arenaState.run = null;
    arenaState.content = null;
    arenaState.musicProgress = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => url.includes("zh-CN") ? translatedManifest : manifest,
    })));
  });

  it.each(["double-take", "clean-cut"])("plays the local wave and %s Boss without API writes", async (optionID) => {
    render(<BrowserDemo />);
    fireEvent.click(await screen.findByTestId("finish-reversal-wave"));
    expect(screen.getByTestId("preview-twin")).toBeInTheDocument();
    expect(screen.getByTestId("preview-pierce")).toBeInTheDocument();
    expect(screen.getByTestId("finish-reversal-wave").closest("[inert]")).not.toBeNull();
    expect(arenaState.mounts).toBe(1);
    expect(arenaState.musicProgress).toBe(0);

    fireEvent.click(screen.getByTestId(`demo-option-${optionID}`));
    const boss = await screen.findByTestId(`finish-reversal-boss-${optionID}`);
    expect(arenaState.run?.state.hearts).toBe(2);
    expect(arenaState.run?.state.segment?.runtime_config.player_health).toBe(2);
    expect(arenaState.musicProgress).toBe(3);
    expect(arenaState.run?.state.segment?.runtime_config.reversal?.weapon).toBe(optionID === "clean-cut" ? "pierce" : "twin");
    fireEvent.click(boss);

    const actions = within(await screen.findByTestId("demo-end-actions"));
    expect(actions.getByRole("heading", { name: "YOU BROUGHT THE MUSIC BACK" })).toBeVisible();
    expect(actions.getByTestId("demo-reversals")).toHaveTextContent("6");
    expect(actions.getByTestId("demo-hearts")).toHaveTextContent("2 / 3");
    expect(actions.queryByText("1000")).not.toBeInTheDocument();
    expect(actions.getAllByRole("button")).toHaveLength(2);
    expect(actions.getAllByRole("link")).toHaveLength(4);
    expect(actions.getByRole("link", { name: "Open Telegram" })).toHaveAttribute("href", "https://t.me/xuhuangamebot");
    expect(actions.getByRole("link", { name: "GitHub" })).toHaveAttribute("href", "https://github.com/achenachena/xuhuan");
    fireEvent.click(actions.getByRole("button", { name: "Restart" }));
    expect(await screen.findByTestId("finish-reversal-wave")).toBeVisible();
    expect(arenaState.run?.state.segment?.runtime_config.player_health).toBe(3);
    expect(arenaState.musicProgress).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/game/v4/demo/demo-v3.en.json", expect.objectContaining({ cache: "force-cache" }));
  });

  it("restarts a failed wave immediately with a fresh simulation", async () => {
    render(<BrowserDemo />);
    fireEvent.click(await screen.findByTestId("fail-reversal-wave"));
    expect(screen.getByRole("heading", { name: "THE SHOW CAN GO ON" })).toBeVisible();
    expect(screen.getByTestId("demo-hearts")).toHaveTextContent("0 / 3");
    expect(screen.getByTestId("demo-reversals")).toHaveTextContent("3");
    fireEvent.click(await screen.findByRole("button", { name: "Restart" }));
    expect(await screen.findByTestId("finish-reversal-wave")).toBeVisible();
    expect(arenaState.mounts).toBe(2);
    expect(arenaState.run?.state.hearts).toBe(3);
  });

  it("restarts the entire demo after a failed Boss", async () => {
    render(<BrowserDemo />);
    fireEvent.click(await screen.findByTestId("finish-reversal-wave"));
    fireEvent.click(screen.getByTestId("demo-option-clean-cut"));
    fireEvent.click(await screen.findByTestId("fail-reversal-boss-clean-cut"));
    fireEvent.click(await screen.findByRole("button", { name: "Restart" }));
    expect(await screen.findByTestId("finish-reversal-wave")).toBeVisible();
    expect(arenaState.mounts).toBe(3);
    expect(arenaState.run?.state.hearts).toBe(3);
    expect(arenaState.run?.state.segment?.runtime_config.reversal?.weapon).toBe("single");
    expect(screen.queryByTestId("finish-reversal-boss-clean-cut")).not.toBeInTheDocument();
  });

  it("translates choice labels without restarting or healing the active arena", async () => {
    const view = render(<BrowserDemo />);
    await screen.findByTestId("finish-reversal-wave");
    const waveRun = arenaState.run;
    const content = arenaState.content;
    localeState.language = "zh-CN";
    view.rerender(<BrowserDemo />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(arenaState.run).toBe(waveRun);
    expect(arenaState.content).toBe(content);
    expect(arenaState.mounts).toBe(1);
    fireEvent.click(screen.getByTestId("finish-reversal-wave"));
    fireEvent.click(await screen.findByRole("button", { name: /Pierce translated/ }));
    await screen.findByTestId("finish-reversal-boss-clean-cut");
    const bossRun = arenaState.run;
    localeState.language = "en";
    view.rerender(<BrowserDemo />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(arenaState.run).toBe(bossRun);
    expect(arenaState.run?.state.hearts).toBe(2);
    expect(arenaState.mounts).toBe(2);
  });

  it("reports a local loading failure without claiming server-side saved progress", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("Unavailable"));
    render(<BrowserDemo />);
    expect(await screen.findByText("The game could not load.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Reconnect" })).toBeVisible();
    expect(screen.queryByText(/authoritative run/i)).not.toBeInTheDocument();
    expect(arenaState.mounts).toBe(0);
  });
});
