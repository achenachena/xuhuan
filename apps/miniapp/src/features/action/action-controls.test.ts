import { describe, expect, it } from "vitest";

import {
  beginJoystickControl,
  joystickVisual,
  isWarpArmed,
  moveJoystickControl,
  readJoystickInput,
  releasedWarpDirection,
} from "@/features/action/action-controls";

describe("hold-to-move joystick controls", () => {
  it("starts still and stops immediately when released", () => {
    const control = beginJoystickControl(4, 90, 500);
    expect(readJoystickInput(control, false)).toEqual({
      direction: 0,
      magnitude: 0,
      skill: false,
    });
    expect(readJoystickInput(null, false)).toEqual({
      direction: 0,
      magnitude: 0,
      skill: false,
    });
  });

  it("uses full speed immediately outside the neutral zone", () => {
    const started = beginJoystickControl(4, 90, 500, 50);
    expect(
      readJoystickInput(moveJoystickControl(started, 90, 504), false),
    ).toMatchObject({ direction: 4, magnitude: 3 });
    expect(
      readJoystickInput(moveJoystickControl(started, 90, 512), false),
    ).toMatchObject({ direction: 4, magnitude: 3 });
    expect(
      readJoystickInput(moveJoystickControl(started, 90, 532), false),
    ).toMatchObject({ direction: 4, magnitude: 3 });
    expect(
      readJoystickInput(moveJoystickControl(started, 90, 558), false),
    ).toMatchObject({ direction: 4, magnitude: 3 });
  });

  it("clamps the rendered knob to the outer warp radius", () => {
    const control = moveJoystickControl(
      beginJoystickControl(4, 80, 500, 50),
      180,
      500,
    );
    expect(joystickVisual(control)).toEqual({
      origin: { x: 80, y: 500 },
      knob: { x: 157.5, y: 500 },
      warpArmed: true,
    });
  });

  it("preserves the release direction for a warp frame", () => {
    expect(readJoystickInput(null, true, 7)).toEqual({
      direction: 7,
      magnitude: 3,
      skill: true,
    });
  });

  it("only arms warp beyond the deliberate outer ring", () => {
    const started = beginJoystickControl(4, 80, 500, 50);
    const running = moveJoystickControl(started, 145, 500);
    const armed = moveJoystickControl(started, 160, 500);

    expect(isWarpArmed(running)).toBe(false);
    expect(releasedWarpDirection(running)).toBeNull();
    expect(isWarpArmed(armed)).toBe(true);
    expect(releasedWarpDirection(armed)).toBe(0);
  });
});
