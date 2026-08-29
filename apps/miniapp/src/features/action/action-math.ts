import type { ActionVec } from "@/features/action/action-types";

export const ACTION_DIRECTIONS: readonly ActionVec[] = [
  { x: 1000, y: 0 },
  { x: 924, y: 383 },
  { x: 707, y: 707 },
  { x: 383, y: 924 },
  { x: 0, y: 1000 },
  { x: -383, y: 924 },
  { x: -707, y: 707 },
  { x: -924, y: 383 },
  { x: -1000, y: 0 },
  { x: -924, y: -383 },
  { x: -707, y: -707 },
  { x: -383, y: -924 },
  { x: 0, y: -1000 },
  { x: 383, y: -924 },
  { x: 707, y: -707 },
  { x: 924, y: -383 },
];

export const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

export const integerSqrt = (value: number): number => {
  if (value <= 0) return 0;
  let root = value;
  let next = Math.trunc((root + 1) / 2);
  while (next < root) {
    root = next;
    next = Math.trunc((root + Math.trunc(value / root)) / 2);
  }
  return root;
};

export const distanceSquared = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};

export const nearTravelPath = (
  x: number,
  y: number,
  startX: number,
  startY: number,
  midpointX: number,
  midpointY: number,
  endX: number,
  endY: number,
  radius: number,
): boolean =>
  Math.min(
    distanceSquared(x, y, startX, startY),
    distanceSquared(x, y, midpointX, midpointY),
    distanceSquared(x, y, endX, endY),
  ) <=
  radius * radius;

export const goDivide = (numerator: number, denominator: number): number =>
  Math.trunc(numerator / denominator);
