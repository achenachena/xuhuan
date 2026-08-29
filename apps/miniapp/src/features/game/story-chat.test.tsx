import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StoryChat } from "@/features/game/story-chat";
import type { APIGameContent } from "@/lib/api/client";
import { v3Content } from "@/test/v3-fixtures";

const metrics = { trust: 1, authenticity: 1, retention: 1 };

const endings: APIGameContent["scenes"] = [
  {
    slug: "zero-authentic-ending",
    chapter_slug: "zero-channel",
    title: "Ending: Open Signal",
    trigger: { kind: "ending", chapter_slug: "zero-channel", ending: "authentic" },
    messages: [
      { sender: "system", kind: "system", text: "Retention Protocol offline." },
      { sender: "xingtong", kind: "character", text: "Some of us may change." },
      { sender: "nana7mi", kind: "character", text: "Recognize us anyway." },
    ],
    options: [
      { slug: "disconnect-together", label: "Disconnect together", metrics },
    ],
  },
  {
    slug: "zero-balanced-ending",
    chapter_slug: "zero-channel",
    title: "Ending: A Window Left Open",
    trigger: { kind: "ending", chapter_slug: "zero-channel", ending: "balanced" },
    messages: [
      { sender: "system", kind: "system", text: "Preserve memories, never personalities." },
      { sender: "bella", kind: "character", text: "Nobody has to live inside the archive." },
      { sender: "lulu", kind: "character", text: "The window stays open." },
    ],
    options: [
      { slug: "leave-window-open", label: "Leave one window open", metrics },
    ],
  },
  {
    slug: "zero-retained-ending",
    chapter_slug: "zero-channel",
    title: "Ending: Gentle Loop",
    trigger: { kind: "ending", chapter_slug: "zero-channel", ending: "retained" },
    messages: [
      { sender: "system", kind: "system", text: "Voluntary exit enabled." },
      { sender: "jiaran", kind: "character", text: "Today, I can say I am tired." },
      { sender: "nailu", kind: "character", text: "The flower shop closes on Tuesdays." },
    ],
    options: [
      { slug: "promise-return", label: "Promise to return", metrics },
    ],
  },
];

describe("StoryChat finale endings", () => {
  it.each(endings)("renders and submits $slug", (ending) => {
    const onChoose = vi.fn();
    const content: APIGameContent = {
      ...v3Content,
      scenes: [...v3Content.scenes, ending],
    };

    render(
      <StoryChat
        content={content}
        sceneSlug={ending.slug}
        locale="en"
        busy={false}
        onChoose={onChoose}
      />,
    );

    expect(screen.getByTestId("story-scene")).toHaveAttribute(
      "data-scene-slug",
      ending.slug,
    );
    expect(screen.getByText(ending.title)).toBeVisible();
    for (const message of ending.messages) {
      expect(screen.getByText(message.text)).toBeVisible();
    }

    const option = ending.options[0]!;
    fireEvent.click(screen.getByTestId(`story-choice-${option.slug}`));
    expect(onChoose).toHaveBeenCalledWith(ending.slug, option.slug);
  });
});
