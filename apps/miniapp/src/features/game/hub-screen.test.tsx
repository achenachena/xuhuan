import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { HubScreen } from "@/features/game/hub-screen";
import type { ShooterContent } from "@/lib/api/types";
import { createV4Game, v4Content } from "@/test/v4-fixtures";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt?: string }) => <span role="img" aria-label={alt} />,
}));
vi.mock("@/components/providers/audio-provider", () => ({
  useAudio: () => ({ muted: false, toggleMuted: vi.fn() }),
}));

const characterIDs = ["nana7mi", "jiaran", "xiangwan", "bella", "lulu"] as const;

const finaleContent = (): ShooterContent => {
  const baseCharacter = v4Content.characters[0]!;
  const baseChapter = v4Content.chapters[0]!;
  return {
    ...v4Content,
    characters: characterIDs.map((id) => ({
      ...baseCharacter,
      id,
      name: id,
      portrait_url: `/game/v4/players/${id}.webp`,
      sprite_url: `/game/v4/players/${id}.webp`,
    })),
    chapters: [
      {
        ...baseChapter,
        id: "zero-channel",
        order: 8,
        title: "Zero Channel",
        featured_character: "player-choice",
        endings: [
          {
            id: "open-archive",
            title: "Open Archive",
            summary: "Let every imperfect version remain.",
            messages: [],
          },
        ],
      },
    ],
  };
};

describe("HubScreen finale selection", () => {
  it("shows today's personal best and clear streak beside Daily Aftershow", () => {
    const game = createV4Game({
      progress: {
        ...createV4Game().progress,
        daily_unlocked: true,
      },
      daily_result: {
        date: "2026-08-31",
        character_slug: "nana7mi",
        score: 12_340,
        show_effects: [],
        companion_slugs: [],
        streak: 4,
      },
    });

    render(
      <HubScreen
        content={v4Content}
        game={game}
        locale="en"
        busy={false}
        onStartCampaign={vi.fn()}
        onStartDaily={vi.fn()}
      />,
    );

    expect(screen.getByTestId("daily-best-summary")).toHaveTextContent(
      "TODAY 12340 · STREAK 4",
    );
  });

  it("uses unlocked pilots instead of the player-choice placeholder", () => {
    const content = finaleContent();
    const onStartCampaign = vi.fn();
    const game = createV4Game({
      progress: {
        ...createV4Game().progress,
        current_chapter_slug: "zero-channel",
        unlocks: characterIDs.map((id) => ({
          type: "character" as const,
          content_slug: id,
          created_at: "2026-08-31T00:00:00Z",
        })),
        chapters: [
          {
            chapter_slug: "zero-channel",
            highest_encore_level: 0,
            clears: 0,
            best_score: 0,
            updated_at: "2026-08-31T00:00:00Z",
          },
        ],
      },
    });

    render(
      <HubScreen
        content={content}
        game={game}
        locale="en"
        busy={false}
        onStartCampaign={onStartCampaign}
        onStartDaily={vi.fn()}
      />,
    );

    expect(screen.queryByText(/being upgraded/i)).not.toBeInTheDocument();
    for (const id of characterIDs) {
      expect(screen.getByTestId(`pilot-${id}`)).toBeVisible();
    }
    fireEvent.click(screen.getByTestId("pilot-lulu"));
    fireEvent.click(screen.getByTestId("start-campaign"));
    expect(onStartCampaign).toHaveBeenCalledWith(
      "zero-channel",
      "lulu",
      0,
      undefined,
    );
  });

  it("sends an explicitly selected unlocked companion on a cleared replay", () => {
    const content = finaleContent();
    const onStartCampaign = vi.fn();
    const game = createV4Game({
      progress: {
        ...createV4Game().progress,
        current_chapter_slug: "zero-channel",
        unlocks: [
          {
            type: "character" as const,
            content_slug: "nana7mi",
            created_at: "2026-08-31T00:00:00Z",
          },
          {
            type: "companion" as const,
            content_slug: "jiaran-assist",
            created_at: "2026-08-31T00:00:00Z",
          },
        ],
        chapters: [
          {
            chapter_slug: "zero-channel",
            highest_encore_level: 0,
            clears: 1,
            best_score: 1_000,
            updated_at: "2026-08-31T00:00:00Z",
          },
        ],
      },
    });

    render(
      <HubScreen
        content={content}
        game={game}
        locale="en"
        busy={false}
        onStartCampaign={onStartCampaign}
        onStartDaily={vi.fn()}
      />,
    );

    const companion = screen.getByTestId("companion-jiaran-assist");
    fireEvent.click(companion);
    expect(companion).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByTestId("start-campaign"));
    expect(onStartCampaign).toHaveBeenCalledWith(
      "zero-channel",
      "nana7mi",
      0,
      "jiaran-assist",
    );
  });
});
