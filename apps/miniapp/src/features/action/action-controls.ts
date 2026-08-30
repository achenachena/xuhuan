import type { ActionInput } from "@/features/action/action-types";

type Point = { readonly x: number; readonly y: number };

export type JoystickControl = {
  readonly pointerId: number;
  readonly origin: Point;
  readonly pointer: Point;
  readonly radius: number;
  readonly warpRadius: number;
};

export type JoystickVisual = {
  readonly origin: Point;
  readonly knob: Point;
  readonly warpArmed: boolean;
};

// Movement is deliberately binary. Once the thumb leaves a generous dead zone,
// the character moves at full speed; releasing emits a neutral frame on the
// very next simulation tick. Variable speed bands felt like acceleration on a
// small WebView even though the simulation itself has no retained velocity.
const DEAD_ZONE_RATIO = 0.2;
const WARP_RADIUS_RATIO = 1.7;

export const beginJoystickControl = (
  pointerId: number,
  x: number,
  y: number,
  radius = 52,
): JoystickControl => ({
  pointerId,
  origin: { x, y },
  pointer: { x, y },
  radius,
  warpRadius: radius * WARP_RADIUS_RATIO,
});

export const moveJoystickControl = (
  control: JoystickControl,
  x: number,
  y: number,
): JoystickControl => ({ ...control, pointer: { x, y } });

export const readJoystickInput = (
  control: JoystickControl | null,
  skill: boolean,
  skillDirection = 0,
): ActionInput => {
  if (!control)
    return {
      direction: skill ? skillDirection & 15 : 0,
      // A released outer-ring Warp must carry its quantized direction in the
      // same authoritative frame. Magnitude three is the trace protocol's
      // directional Warp form; magnitude zero is intentionally the upward
      // keyboard/accessibility fallback in the Go engine.
      magnitude: skill ? 3 : 0,
      skill,
    };

  const dx = control.pointer.x - control.origin.x;
  const dy = control.pointer.y - control.origin.y;
  const distance = Math.hypot(dx, dy);
  const ratio = distance / control.radius;
  if (ratio < DEAD_ZONE_RATIO)
    return { direction: 0, magnitude: 0, skill };

  const direction =
    (Math.round((Math.atan2(dy, dx) / (Math.PI * 2)) * 16) + 16) % 16;
  return { direction, magnitude: 3, skill };
};

export const isWarpArmed = (control: JoystickControl): boolean => {
  const dx = control.pointer.x - control.origin.x;
  const dy = control.pointer.y - control.origin.y;
  return Math.hypot(dx, dy) >= control.warpRadius;
};

export const releasedWarpDirection = (
  control: JoystickControl,
): number | null => {
  if (!isWarpArmed(control)) return null;
  return readJoystickInput(control, false).direction;
};

export const joystickVisual = (
  control: JoystickControl,
): JoystickVisual => {
  const dx = control.pointer.x - control.origin.x;
  const dy = control.pointer.y - control.origin.y;
  const distance = Math.hypot(dx, dy);
  const scale =
    distance > control.warpRadius ? control.warpRadius / distance : 1;
  return {
    origin: control.origin,
    knob: {
      x: control.origin.x + dx * scale,
      y: control.origin.y + dy * scale,
    },
    warpArmed: isWarpArmed(control),
  };
};
