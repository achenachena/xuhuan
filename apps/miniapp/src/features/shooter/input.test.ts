import { describe, expect, it } from "vitest";

import {
  beginShooterPointer,
  endShooterPointer,
  initialShooterControl,
  moveShooterPointer,
  sampleShooterInput,
} from "@/features/shooter/input";

const bounds = { left: 0, top: 0, width: 360, height: 640 };

describe("one-finger shooter input", () => {
  it("preserves the grab offset and follows held X continuously", () => {
    let control = initialShooterControl(1_800);
    control = beginShooterPointer(control, 7, 120, 500, bounds);
    control = moveShooterPointer(control, 7, 170, 500, bounds);
    expect(control.playerX).toBe(2_300);
    control = moveShooterPointer(control, 7, 171, 500, bounds);
    expect(control.playerX).toBe(2_310);
  });

  it("ignores vertical movement entirely", () => {
    const control = beginShooterPointer(
      initialShooterControl(1_800),
      9,
      180,
      500,
      bounds,
    );
    const first = moveShooterPointer(control, 9, 240, 340, bounds);
    const second = moveShooterPointer(control, 9, 240, 639, bounds);
    expect(second.playerX).toBe(first.playerX);
    expect(sampleShooterInput(second, false)).toEqual(
      sampleShooterInput(first, false),
    );
  });

  it("stops changing position immediately on release", () => {
    let control = beginShooterPointer(
      initialShooterControl(1_800),
      11,
      180,
      500,
      bounds,
    );
    control = moveShooterPointer(control, 11, 300, 500, bounds);
    control = endShooterPointer(control, 11);
    const releasedX = control.playerX;
    control = moveShooterPointer(control, 11, 20, 500, bounds);
    expect(control.pointer).toBeNull();
    expect(control.playerX).toBe(releasedX);
  });

  it("survives twenty downward drags without treating Y as an action", () => {
    let control = beginShooterPointer(
      initialShooterControl(1_800),
      13,
      180,
      330,
      bounds,
    );
    for (let index = 0; index < 20; index += 1) {
      control = moveShooterPointer(control, 13, 180, 340 + index * 24, bounds);
    }
    expect(control.playerX).toBe(1_800);
    expect(control.pointer?.pointerId).toBe(13);
  });

  it("does not start movement from the upper half", () => {
    const control = beginShooterPointer(
      initialShooterControl(1_800),
      15,
      180,
      100,
      bounds,
    );
    expect(control.pointer).toBeNull();
  });
});
