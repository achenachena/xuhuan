import { describe, expect, it } from "vitest";

import {
  beginJoystickControl,
  joystickVisual,
  moveJoystickControl,
  readJoystickInput,
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

  it("maps thumb deflection directly to direction and speed", () => {
    const started = beginJoystickControl(4, 90, 500, 50);
    expect(
      readJoystickInput(moveJoystickControl(started, 90, 512), false),
    ).toMatchObject({ direction: 4, magnitude: 1 });
    expect(
      readJoystickInput(moveJoystickControl(started, 90, 532), false),
    ).toMatchObject({ direction: 4, magnitude: 2 });
    expect(
      readJoystickInput(moveJoystickControl(started, 90, 558), false),
    ).toMatchObject({ direction: 4, magnitude: 3 });
  });

  it("clamps the rendered knob to the joystick radius", () => {
    const control = moveJoystickControl(
      beginJoystickControl(4, 80, 500, 50),
      180,
      500,
    );
    expect(joystickVisual(control)).toEqual({
      origin: { x: 80, y: 500 },
      knob: { x: 130, y: 500 },
    });
  });

  it("preserves a skill press without movement", () => {
    expect(readJoystickInput(null, true)).toEqual({
      direction: 0,
      magnitude: 0,
      skill: true,
    });
  });
});
