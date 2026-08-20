import { describe, expect, it } from "vitest";

import {
  beginDragControl,
  moveDragControl,
  readDragInput,
} from "@/features/action/action-controls";

const player = { x: 1800, y: 5200 };
const viewport = { width: 360, height: 640 };

describe("relative drag controls", () => {
  it("does not move when the finger first touches the arena", () => {
    const control = beginDragControl(4, 120, 400, player, viewport);
    expect(readDragInput(control, player, false)).toEqual({
      direction: 0,
      magnitude: 0,
      skill: false,
    });
  });

  it("makes the player follow the finger displacement and stop at its target", () => {
    const started = beginDragControl(4, 120, 400, player, viewport);
    const dragged = moveDragControl(started, 120, 440);
    const moving = readDragInput(dragged, player, false);
    expect(moving.direction).toBe(4);
    expect(moving.magnitude).toBe(3);

    expect(readDragInput(dragged, { x: 1800, y: 5590 }, false).magnitude).toBe(
      0,
    );
  });

  it("preserves a skill press without an active drag", () => {
    expect(readDragInput(null, player, true)).toEqual({
      direction: 0,
      magnitude: 0,
      skill: true,
    });
  });
});
