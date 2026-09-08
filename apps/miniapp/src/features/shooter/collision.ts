/** First intersection parameter for a moving shot and an axis-aligned body. */
export const sweptShooterHit = (fromX: number, fromY: number, toX: number, toY: number,
  x: number, y: number, halfWidth: number, halfHeight: number): number | null => {
  let near = 0, far = 1;
  // This runs for every shot/body pair; avoid allocating axis arrays per check.
  for (let axis = 0; axis < 2; axis += 1) {
    const start = axis === 0 ? fromX : fromY;
    const delta = axis === 0 ? toX - fromX : toY - fromY;
    const center = axis === 0 ? x : y;
    const extent = axis === 0 ? halfWidth : halfHeight;
    if (delta === 0) { if (Math.abs(start - center) > extent) return null; continue; }
    const a = (center - extent - start) / delta, b = (center + extent - start) / delta;
    near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
    if (near > far) return null;
  }
  return near;
};

export const sweptShooterCircleHit = (fromX: number, fromY: number, toX: number, toY: number,
  x: number, y: number, radius: number): boolean => {
  const dx = toX - fromX, dy = toY - fromY;
  const lengthSquared = dx * dx + dy * dy;
  const time = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - fromX) * dx + (y - fromY) * dy) / lengthSquared));
  return (fromX + dx * time - x) ** 2 + (fromY + dy * time - y) ** 2 <= radius * radius;
};
