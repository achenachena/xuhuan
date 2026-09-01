import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  getGameContent: vi.fn(),
  getGame: vi.fn(),
  createRun: vi.fn(),
  getRun: vi.fn(),
  createRunCommand: vi.fn(),
}));
const localeState = vi.hoisted(() => ({ language: "en" as "en" | "zh-CN" }));

vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  ...dependencies,
  createIdempotencyKey: () => "11111111-1111-4111-8111-111111111111",
}));
vi.mock("@/components/providers/use-locale", () => ({
  default: () => ({ language: localeState.language, setLanguage: vi.fn() }),
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
    dependencies.getGameContent.mockResolvedValue(v4Content);
    dependencies.getGame.mockResolvedValue(createV4Game());
  });

  it("keeps the release marker in server-renderable page output", async () => {
    render(<HomePage />);
    expect(
      document.querySelector(
        '[data-release-marker="CONTENT-V4 / SHOOTER-V1"]',
      ),
    ).toHaveTextContent("CONTENT-V4 / SHOOTER-V1");
    expect(await screen.findByTestId("start-campaign")).toBeVisible();
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

  it("uses the localized system sender for a Chinese intermission prompt", async () => {
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

    expect((await screen.findAllByText(localizedSender)).length).toBeGreaterThan(0);
    expect(screen.queryByText("System")).not.toBeInTheDocument();
  });
});
