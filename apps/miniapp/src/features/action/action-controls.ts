import type {
  ActionInput,
  ActionVec,
} from "@/features/action/action-types";

type Point = { readonly x: number; readonly y: number };

export type DragControl = {
  readonly pointerId: number;
  readonly origin: Point;
  readonly pointer: Point;
  readonly arenaPointer: ActionVec;
  readonly dragged: boolean;
};

const DRAG_ACTIVATION_PX = 5;
const SLOW_DRAG_PX = 3;
const FAST_DRAG_PX = 10;

const neutralInput = (): ActionInput => ({
  direction: 0,
  magnitude: 0,
  skill: false,
});

const quantizedDirection = (dx: number, dy: number): number =>
  (Math.round((Math.atan2(dy, dx) / (Math.PI * 2)) * 16) + 16) % 16;

export const beginDragControl = (
  pointerId: number,
  x: number,
  y: number,
  arenaPointer: ActionVec,
): DragControl => ({
  pointerId,
  origin: { x, y },
  pointer: { x, y },
  arenaPointer,
  dragged: false,
});

export const moveDragControl = (
  control: DragControl,
  x: number,
  y: number,
  arenaPointer: ActionVec,
): DragControl => ({
  ...control,
  pointer: { x, y },
  arenaPointer,
  dragged:
    control.dragged ||
    Math.hypot(x - control.origin.x, y - control.origin.y) >=
      DRAG_ACTIVATION_PX,
});

// Movement follows only displacement received since the previous simulation
// tick. Consuming that displacement makes a stationary or released finger
// produce a neutral frame immediately, with no hidden target or velocity.
export const readDragInput = (control: DragControl | null): ActionInput => {
  if (!control?.dragged) return neutralInput();
  const dx = control.pointer.x - control.origin.x;
  const dy = control.pointer.y - control.origin.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1) return neutralInput();
  return {
    direction: quantizedDirection(dx, dy),
    magnitude:
      distance >= FAST_DRAG_PX ? 3 : distance >= SLOW_DRAG_PX ? 2 : 1,
    skill: false,
  };
};

export const consumeDragInput = (
  control: DragControl | null,
): DragControl | null =>
  control
    ? {
        ...control,
        origin: control.pointer,
      }
    : null;

export const releasedTapWarpDirection = (
  control: DragControl,
  player: ActionVec,
): number | null => {
  if (control.dragged) return null;
  const dx = control.arenaPointer.x - player.x;
  const dy = control.arenaPointer.y - player.y;
  if (Math.hypot(dx, dy) < 80) return null;
  return quantizedDirection(dx, dy);
};

export const warpInput = (direction: number): ActionInput => ({
  direction: direction & 15,
  magnitude: 0,
  skill: true,
});

export const dragReticle = (
  control: DragControl,
): Point | null => (control.dragged ? control.pointer : null);
