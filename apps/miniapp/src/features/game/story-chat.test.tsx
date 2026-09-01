import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StoryChat } from "@/features/game/story-chat";
import type { ShooterStoryScene } from "@/lib/api/types";

const endings: readonly ShooterStoryScene[] = [
  {
    id: "zero-open-signal",
    title: "Ending: Open Signal",
    messages: [
      {
        sender_id: "system",
        sender: "System",
        text: "Retention Protocol offline.",
      },
      {
        sender_id: "nana7mi",
        sender: "Nana",
        text: "Recognize us even when we change.",
      },
    ],
    options: [{ id: "disconnect-together", label: "Disconnect together" }],
  },
  {
    id: "zero-window-open",
    title: "Ending: A Window Left Open",
    messages: [
      { sender_id: "lulu", sender: "Lulu", text: "The window stays open." },
    ],
    options: [{ id: "leave-window-open", label: "Leave one window open" }],
  },
  {
    id: "zero-gentle-loop",
    title: "Ending: Gentle Loop",
    messages: [
      {
        sender_id: "nailu",
        sender: "Nailu",
        text: "The flower shop closes on Tuesdays.",
      },
    ],
    options: [{ id: "promise-return", label: "Promise to return" }],
  },
];

describe("StoryChat", () => {
  it.each(endings)("renders and submits $id", (scene) => {
    const onChoose = vi.fn();
    render(
      <StoryChat scene={scene} locale="en" busy={false} onChoose={onChoose} />,
    );

    expect(screen.getByText(scene.title!)).toBeVisible();
    for (const message of scene.messages) {
      expect(screen.getByText(message.text)).toBeVisible();
    }
    if (scene.messages.some((message) => message.sender_id === "system")) {
      expect(
        document.querySelector('[data-message-kind="system"]'),
      ).toHaveTextContent("Retention Protocol offline.");
    }
    fireEvent.click(screen.getByTestId(`story-option-${scene.options[0]!.id}`));
    expect(onChoose).toHaveBeenCalledWith(scene.id, scene.options[0]!.id);
  });
});
