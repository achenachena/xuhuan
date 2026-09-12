import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StageIntermission } from "@/features/game/stage-intermission";
import type { ShooterStoryScene } from "@/lib/api/types";

const scene: ShooterStoryScene = {
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
};

describe("StageIntermission", () => {
  it("expands the story and submits the selected choice", () => {
    const onChoose = vi.fn();
    render(
      <StageIntermission scene={scene} locale="en" busy={false} onChoose={onChoose} />,
    );

    expect(screen.getByText(scene.title!)).toBeVisible();
    fireEvent.click(screen.getByText("Story so far"));
    for (const message of scene.messages) {
      expect(screen.getByText(message.text)).toBeVisible();
    }
    fireEvent.click(screen.getByTestId(`story-option-${scene.options[0]!.id}`));
    expect(onChoose).toHaveBeenCalledWith(scene.id, scene.options[0]!.id);
  });
});
