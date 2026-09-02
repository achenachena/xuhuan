import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PortfolioDemoManifest } from "@/features/portfolio/demo-types";
import type { ShooterResult } from "@/features/shooter/types";
import { v4BaseState, v4Content, v4Runtime } from "@/test/v4-fixtures";

const localeState = vi.hoisted(() => ({ language: "en" as "en" | "zh-CN" }));

vi.mock("@/components/providers/use-locale", () => ({
  default: () => ({ language: localeState.language, setLanguage: vi.fn() }),
}));
vi.mock("next/image", () => ({
  default: ({ alt }: { alt?: string }) => <span role="img" aria-label={alt} />,
}));
vi.mock("@/features/shooter/shooter-arena", () => ({
  ShooterArena: ({ run, onComplete }: { run: { state: { segment?: { segment_slug: string } } }; onComplete: (result: ShooterResult) => Promise<boolean> }) => (
    <button
      data-testid={`finish-${run.state.segment?.segment_slug}`}
      onClick={() => void onComplete(result)}
    >
      FINISH
    </button>
  ),
}));

import { BrowserDemo } from "@/features/portfolio/browser-demo";

const result: ShooterResult = {
  won: true,
  health: 2,
  ticks: 900,
  kills: 4,
  rescues_used: 1,
  grazes: 2,
  score: 500,
  final: {
    tick: 900,
    player_x: 1800,
    health: 2,
    max_health: 3,
    shield: 0,
    invulnerable_ticks: 0,
    rescue_charge: 0,
    rescues_used: 1,
    graze_count: 2,
    combo: 0,
    score: 500,
    enemies: [],
    enemy_projectiles: [],
    player_projectiles: [],
    pickups: [],
    threats: [],
    effects: [],
  },
};

const bossRuntime = {
  ...v4Runtime,
  seed: "portfolio-demo-boss-v1:double-take",
  show_effects: [{ kind: "twin_shot" as const, amount: 1 }],
  boss: {
    id: "optimal-nana" as const,
    health: 360,
    score: 1_000,
    stages: [],
  },
};

const manifest: PortfolioDemoManifest = {
  version: "demo-v1",
  locale: "en",
  content: v4Content,
  wave: {
    ...v4BaseState.segment!,
    segment_slug: "portfolio-demo-wave",
    duration_ticks: 900,
    runtime_config: { ...v4Runtime, duration_ticks: 900 },
  },
  options: [
    {
      id: "double-take",
      name: "Double Take",
      description: "Add a second shot.",
      boss: {
        ...v4BaseState.segment!,
        segment_slug: "portfolio-demo-boss-double-take",
        segment_index: 1,
        duration_ticks: 900,
        boss_id: "optimal-nana",
        wave_id: undefined,
        reward_stage: undefined,
        runtime_config: bossRuntime,
      },
    },
    {
      id: "safety-chat",
      name: "Safety Chat",
      description: "Rescue grants guard.",
      boss: {
        ...v4BaseState.segment!,
        segment_slug: "portfolio-demo-boss-safety-chat",
        segment_index: 1,
        duration_ticks: 900,
        boss_id: "optimal-nana",
        wave_id: undefined,
        reward_stage: undefined,
        runtime_config: { ...bossRuntime, seed: "portfolio-demo-boss-v1:safety-chat", show_effects: [{ kind: "guard_on_special", amount: 1 }] },
      },
    },
  ],
};

describe("browser portfolio demo", () => {
  beforeEach(() => {
    localeState.language = "en";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => manifest }));
  });

  it("runs a local wave, one clear choice, and a boss without API writes", async () => {
    render(<BrowserDemo />);

    fireEvent.click(await screen.findByTestId("finish-portfolio-demo-wave"));
    fireEvent.click(await screen.findByTestId("demo-option-double-take"));
    fireEvent.click(await screen.findByTestId("finish-portfolio-demo-boss-double-take"));

    expect(await screen.findByText("The channel stayed live")).toBeVisible();
    expect(screen.getByText("1000")).toBeVisible();
    expect(fetch).toHaveBeenCalledWith(
      "/game/v4/demo/demo-v1.en.json",
      expect.objectContaining({ cache: "force-cache" }),
    );
  });
});
