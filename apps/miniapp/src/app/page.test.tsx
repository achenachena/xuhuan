import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import demoManifest from "../../public/game/v4/demo/demo-v3.en.json";

const dependencies = vi.hoisted(() => ({
  getGameContent: vi.fn(),
  getGame: vi.fn(),
  createRun: vi.fn(),
  getRun: vi.fn(),
  createRunCommand: vi.fn(),
}));
const localeState = vi.hoisted(() => ({ language: "en" as "en" | "zh-CN" }));
const hostState = vi.hoisted(() => ({ kind: "telegram" as "detecting" | "telegram" | "browser" }));

vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  ...dependencies,
  createIdempotencyKey: () => "11111111-1111-4111-8111-111111111111",
}));
vi.mock("@/components/providers/use-locale", () => ({
  default: () => ({ language: localeState.language, setLanguage: vi.fn() }),
}));
vi.mock("@/components/providers/use-telegram-host", () => ({
  default: () => hostState.kind,
}));
vi.mock("@/components/providers/audio-provider", () => ({
  useAudio: () => ({
    muted: false,
    toggleMuted: vi.fn(),
    playSound: vi.fn(),
  }),
}));
vi.mock("next/image", () => ({
  default: ({ alt }: { alt?: string }) => <span role="img" aria-label={alt} />,
}));
vi.mock("@/features/shooter/shooter-arena", () => ({
  ShooterArena: () => <div data-testid="shooter-arena">SHOOTER ARENA</div>,
}));
vi.mock("@/features/shooter/shooter-gates", () => ({
  ShooterGates: ({ onChoose }: { onChoose: (id: string) => void }) => (
    <button data-testid="shooter-gate" onClick={() => onChoose("double-take")}>
      TWIN GATE
    </button>
  ),
}));

import HomePage from "@/app/page";
import {
  createV4Game,
  createV4Run,
  v4BaseState,
  v4Content,
} from "@/test/v4-fixtures";

describe("Shooter V4 game shell", () => {
  beforeEach(() => {
    Object.values(dependencies).forEach((mock) => mock.mockReset());
    localeState.language = "en";
    hostState.kind = "telegram";
    dependencies.getGameContent.mockResolvedValue(v4Content);
    dependencies.getGame.mockResolvedValue(createV4Game());
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => demoManifest }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("starts the local browser game directly without protected API calls", async () => {
    hostState.kind = "browser";
    render(<HomePage />);

    expect(await screen.findByTestId("shooter-arena")).toBeVisible();
    expect(screen.getByRole("link", { name: "Play full campaign" })).toHaveAttribute("href", "/play");
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(dependencies.getGame).not.toHaveBeenCalled();
    expect(dependencies.getGameContent).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith("/game/v4/demo/demo-v3.en.json", expect.objectContaining({ cache: "force-cache" }));
  });

  it.each(["browser", "telegram"] as const)("waits for host detection before entering %s mode", async (host) => {
    hostState.kind = "detecting";
    const view = render(<HomePage />);
    expect(screen.getByTestId("game-entry")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByTestId("shooter-arena")).not.toBeInTheDocument();
    expect(dependencies.getGame).not.toHaveBeenCalled();
    expect(dependencies.getGameContent).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    hostState.kind = host;
    view.rerender(<HomePage />);
    expect(await screen.findByTestId(host === "telegram" ? "start-campaign" : "shooter-arena")).toBeVisible();
    if (host === "telegram") expect(fetch).not.toHaveBeenCalled();
    else expect(dependencies.getGame).not.toHaveBeenCalled();
  });

  it("starts one campaign and enters the live shooter directly", async () => {
    dependencies.createRun.mockResolvedValue(createV4Run());
    render(<HomePage />);

    fireEvent.click(await screen.findByTestId("start-campaign"));

    await waitFor(() =>
      expect(dependencies.createRun).toHaveBeenCalledWith(
        {
          mode: "campaign",
          chapter_slug: "seventh-dock",
          character_slug: "nana7mi",
          encore_level: 0,
        },
        "11111111-1111-4111-8111-111111111111",
      ),
    );
    expect(await screen.findByTestId("shooter-arena")).toBeVisible();
  });

  it("submits the in-arena show gate without a reward page", async () => {
    const gateRun = createV4Run({
      state: {
        ...v4BaseState,
        phase: "show_choice",
        segment: undefined,
        pending_show_options: ["double-take", "safety-chat"],
      },
    });
    const advanced = createV4Run({ version: 2 });
    dependencies.getGame.mockResolvedValue(
      createV4Game({ campaign_run: gateRun }),
    );
    dependencies.createRunCommand.mockResolvedValue({ run: advanced, events: [] });

    render(<HomePage />);
    fireEvent.click(await screen.findByTestId("shooter-gate"));

    await waitFor(() =>
      expect(dependencies.createRunCommand).toHaveBeenCalledWith(
        gateRun.id,
        {
          type: "choose_show_option",
          option_id: "double-take",
          expected_version: 1,
        },
        "11111111-1111-4111-8111-111111111111",
      ),
    );
  });

  it("renders the maintenance screen before creating a canvas on mismatch", async () => {
    dependencies.getGameContent.mockResolvedValue({
      ...v4Content,
      protocol: "unsupported-v0",
    });
    dependencies.getGame.mockResolvedValue(
      createV4Game({ campaign_run: createV4Run() }),
    );

    render(<HomePage />);

    expect(await screen.findByTestId("protocol-maintenance")).toBeVisible();
    expect(screen.queryByTestId("shooter-arena")).not.toBeInTheDocument();
  });

  it("shows a Chinese intermission with optional story details", async () => {
    localeState.language = "zh-CN";
    const chapter = v4Content.chapters[0]!;
    const localizedSender = "Localized archive";
    dependencies.getGameContent.mockResolvedValue({
      ...v4Content,
      locale: "zh-CN",
      chapters: [
        {
          ...chapter,
          story: {
            ...chapter.story,
            intermission: {
              ...chapter.story.intermission,
              messages: chapter.story.intermission.messages.map((message) =>
                message.sender_id === "system"
                  ? { ...message, sender: localizedSender }
                  : message,
              ),
            },
          },
        },
      ],
    });
    dependencies.getGame.mockResolvedValue(
      createV4Game({
        campaign_run: createV4Run({
          state: {
            ...v4BaseState,
            phase: "story",
            segment: undefined,
            story: {
              scene_id: "seventh-dock-intermission",
              choice_ids: ["keep-voice"],
            },
          },
        }),
      }),
    );

    render(<HomePage />);

    expect(await screen.findByText("信号已恢复")).toBeVisible();
    fireEvent.click(screen.getByText("剧情回顾"));
    expect(screen.getByText(chapter.story.intermission.prompt)).toBeVisible();
    expect(screen.queryByText("System")).not.toBeInTheDocument();
  });
});
