import {
  PLAYER_MAX_X,
  PLAYER_MIN_X,
  SHOOTER_WIDTH,
  clamp,
} from "@/features/shooter/constants";

export type SurfaceBounds = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
};

export type ShooterPointerState = {
  readonly pointerId: number;
  readonly xOffset: number;
  readonly targetX: number;
};

export type ShooterControl = {
  readonly pointer: ShooterPointerState | null;
  readonly playerX: number;
  readonly minimumX: number;
  readonly maximumX: number;
};

export type ShooterInput = {
  readonly x: number;
  readonly rescue: boolean;
};

export const initialShooterControl = (
  playerX: number,
  minimumX = PLAYER_MIN_X,
  maximumX = PLAYER_MAX_X,
): ShooterControl => ({
  pointer: null,
  playerX: clamp(playerX, minimumX, maximumX),
  minimumX,
  maximumX,
});

const clientXToArenaX = (clientX: number, bounds: SurfaceBounds): number =>
  clamp(
    ((clientX - bounds.left) / Math.max(1, bounds.width)) * SHOOTER_WIDTH,
    PLAYER_MIN_X,
    PLAYER_MAX_X,
  );

export const beginShooterPointer = (
  control: ShooterControl,
  pointerId: number,
  clientX: number,
  clientY: number,
  bounds: SurfaceBounds,
): ShooterControl => {
  if (
    control.pointer !== null ||
    clientY < bounds.top + bounds.height / 2 ||
    clientY > bounds.top + bounds.height
  ) {
    return control;
  }
  const pointerX = clientXToArenaX(clientX, bounds);
  return {
    ...control,
    pointer: {
      pointerId,
      xOffset: control.playerX - pointerX,
      targetX: control.playerX,
    },
  };
};

export const moveShooterPointer = (
  control: ShooterControl,
  pointerId: number,
  clientX: number,
  _clientY: number,
  bounds: SurfaceBounds,
): ShooterControl => {
  if (control.pointer?.pointerId !== pointerId) return control;
  const targetX = clamp(
    clientXToArenaX(clientX, bounds) + control.pointer.xOffset,
    control.minimumX,
    control.maximumX,
  );
  return {
    ...control,
    playerX: targetX,
    pointer: { ...control.pointer, targetX },
  };
};

export const endShooterPointer = (
  control: ShooterControl,
  pointerId: number,
): ShooterControl =>
  control.pointer?.pointerId === pointerId
    ? { ...control, pointer: null }
    : control;

export const sampleShooterInput = (
  control: ShooterControl,
  rescue: boolean,
): ShooterInput => ({
  x: Math.round(
    ((clamp(control.playerX, control.minimumX, control.maximumX) - control.minimumX) /
      Math.max(1, control.maximumX - control.minimumX)) *
      127,
  ),
  rescue,
});

export const isShooterPointerActive = (control: ShooterControl): boolean =>
  control.pointer !== null;
