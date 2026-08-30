import { describe, expect, it } from "vitest";

import {
  beginDragControl,
  consumeDragInput,
  dragReticle,
  moveDragControl,
  readDragInput,
  releasedTapWarpDirection,
  warpInput,
} from "@/features/action/action-controls";

describe("direct drag controls", () => {
  it("starts still and stops on the first consumed tick", () => {
    const started = beginDragControl(4, 90, 500, { x: 900, y: 5000 });
    const dragged = moveDragControl(started, 102, 500, { x: 1020, y: 5000 });

    expect(readDragInput(dragged)).toEqual({
      direction: 0,
      magnitude: 3,
      skill: false,
    });
    const consumed = consumeDragInput(dragged);
    expect(readDragInput(consumed)).toEqual({
      direction: 0,
      magnitude: 0,
      skill: false,
    });
    expect(readDragInput(null)).toEqual({
      direction: 0,
      magnitude: 0,
      skill: false,
    });
  });

  it("maps recent drag distance directly to three speed levels", () => {
    const started = beginDragControl(4, 90, 500, { x: 900, y: 5000 });
    expect(
      readDragInput(
        moveDragControl(started, 96, 500, { x: 960, y: 5000 }),
      ),
    ).toMatchObject({ direction: 0, magnitude: 2 });
    expect(
      readDragInput(
        moveDragControl(started, 104, 500, { x: 1040, y: 5000 }),
      ),
    ).toMatchObject({ direction: 0, magnitude: 3 });
  });

  it("shows only a compact reticle after a real drag", () => {
    const started = beginDragControl(4, 80, 500, { x: 800, y: 5000 });
    expect(dragReticle(started)).toBeNull();
    const dragged = moveDragControl(started, 92, 506, { x: 920, y: 5060 });
    expect(dragReticle(dragged)).toEqual({ x: 92, y: 506 });
  });

  it("turns a tap into a zero-movement directional Warp", () => {
    const tapped = beginDragControl(4, 180, 200, { x: 1800, y: 2000 });
    expect(releasedTapWarpDirection(tapped, { x: 1800, y: 4200 })).toBe(12);
    expect(warpInput(12)).toEqual({
      direction: 12,
      magnitude: 0,
      skill: true,
    });
  });

  it("does not Warp after dragging or when tapping the player", () => {
    const started = beginDragControl(4, 180, 420, { x: 1800, y: 4200 });
    const dragged = moveDragControl(started, 190, 420, { x: 1900, y: 4200 });
    expect(releasedTapWarpDirection(dragged, { x: 1800, y: 4200 })).toBeNull();
    expect(releasedTapWarpDirection(started, { x: 1800, y: 4200 })).toBeNull();
  });
});
