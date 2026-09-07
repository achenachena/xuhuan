export const SHOOTER_WIDTH = 3_600;
export const SHOOTER_HEIGHT = 6_400;
export const SHOOTER_TPS = 30;
export const PLAYER_Y = 5_200;
export const PLAYER_RADIUS = 95;
export const PLAYER_MIN_X = PLAYER_RADIUS;
export const PLAYER_MAX_X = SHOOTER_WIDTH - PLAYER_MIN_X;

export const PLAYER_GRAZE_RADIUS = 180;
export const ENEMY_RADIUS = 120;
export const ENEMY_PROJECTILE_RADIUS = 42;

export const GATE_DWELL_TICKS = 12;

export const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

export const squaredDistance = (
  leftX: number,
  leftY: number,
  rightX: number,
  rightY: number,
): number => {
  const dx = leftX - rightX;
  const dy = leftY - rightY;
  return dx * dx + dy * dy;
};

export const goDivide = (numerator: number, denominator: number): number =>
  denominator === 0 ? 0 : Math.trunc(numerator / denominator);

export const integerSqrt = (value: number): number => {
  if (value <= 0) return 0;
  let current = value;
  let next = Math.trunc((current + 1) / 2);
  while (next < current) {
    current = next;
    next = Math.trunc((current + Math.trunc(value / current)) / 2);
  }
  return current;
};
