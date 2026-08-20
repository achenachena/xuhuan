import {
  ACTION_HEIGHT,
  ACTION_WIDTH,
  type ActionInput,
} from "@/features/action/action-engine";

type Point = { readonly x: number; readonly y: number };
type Viewport = { readonly width: number; readonly height: number };

export type DragControl = {
  readonly pointerId: number;
  readonly originX: number;
  readonly originY: number;
  readonly x: number;
  readonly y: number;
  readonly anchor: Point;
  readonly unitsPerPixel: number;
};

const STOP_DISTANCE = 48;
const WALK_DISTANCE = 150;
const RUN_DISTANCE = 360;

export const beginDragControl = (
  pointerId: number,
  x: number,
  y: number,
  player: Point,
  viewport: Viewport,
): DragControl => {
  const scale = Math.min(
    viewport.width / ACTION_WIDTH,
    viewport.height / ACTION_HEIGHT,
  );
  return {
    pointerId,
    originX: x,
    originY: y,
    x,
    y,
    anchor: player,
    unitsPerPixel: scale > 0 ? 1 / scale : 1,
  };
};

export const moveDragControl = (
  control: DragControl,
  x: number,
  y: number,
): DragControl => ({ ...control, x, y });

export const readDragInput = (
  control: DragControl | null,
  player: Point,
  skill: boolean,
): ActionInput => {
  if (!control) return { direction: 0, magnitude: 0, skill };

  const targetX =
    control.anchor.x + (control.x - control.originX) * control.unitsPerPixel;
  const targetY =
    control.anchor.y + (control.y - control.originY) * control.unitsPerPixel;
  const dx = targetX - player.x;
  const dy = targetY - player.y;
  const distance = Math.hypot(dx, dy);
  const direction =
    (Math.round((Math.atan2(dy, dx) / (Math.PI * 2)) * 16) + 16) % 16;
  const magnitude =
    distance < STOP_DISTANCE
      ? 0
      : distance < WALK_DISTANCE
        ? 1
        : distance < RUN_DISTANCE
          ? 2
          : 3;
  return { direction, magnitude, skill };
};
