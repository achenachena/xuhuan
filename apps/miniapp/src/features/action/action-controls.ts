import type { ActionInput } from "@/features/action/action-engine";

type Point = { readonly x: number; readonly y: number };

export type JoystickControl = {
  readonly pointerId: number;
  readonly origin: Point;
  readonly pointer: Point;
  readonly radius: number;
};

export type JoystickVisual = {
  readonly origin: Point;
  readonly knob: Point;
};

const DEAD_ZONE_RATIO = 0.16;
const WALK_RATIO = 0.48;
const RUN_RATIO = 0.78;

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
});

export const moveJoystickControl = (
  control: JoystickControl,
  x: number,
  y: number,
): JoystickControl => ({ ...control, pointer: { x, y } });

export const readJoystickInput = (
  control: JoystickControl | null,
  skill: boolean,
): ActionInput => {
  if (!control) return { direction: 0, magnitude: 0, skill };

  const dx = control.pointer.x - control.origin.x;
  const dy = control.pointer.y - control.origin.y;
  const distance = Math.hypot(dx, dy);
  const ratio = Math.min(1, distance / control.radius);
  if (ratio < DEAD_ZONE_RATIO)
    return { direction: 0, magnitude: 0, skill };

  const direction =
    (Math.round((Math.atan2(dy, dx) / (Math.PI * 2)) * 16) + 16) % 16;
  const magnitude = ratio < WALK_RATIO ? 1 : ratio < RUN_RATIO ? 2 : 3;
  return { direction, magnitude, skill };
};

export const joystickVisual = (
  control: JoystickControl,
): JoystickVisual => {
  const dx = control.pointer.x - control.origin.x;
  const dy = control.pointer.y - control.origin.y;
  const distance = Math.hypot(dx, dy);
  const scale = distance > control.radius ? control.radius / distance : 1;
  return {
    origin: control.origin,
    knob: {
      x: control.origin.x + dx * scale,
      y: control.origin.y + dy * scale,
    },
  };
};
