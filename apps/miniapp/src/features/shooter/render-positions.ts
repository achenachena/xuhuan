type PositionEntity = {
  readonly id: number;
  readonly position: { readonly x: number; readonly y: number };
};
export type PositionIndex = ReadonlyMap<number, PositionEntity["position"]>;
const indexes = new WeakMap<readonly PositionEntity[], PositionIndex>();

export const indexShooterPositions = (entities: readonly PositionEntity[]): PositionIndex => {
  const cached = indexes.get(entities);
  if (cached) return cached;
  const index = new Map(entities.map((entity) => [entity.id, entity.position]));
  indexes.set(entities, index);
  return index;
};

export const interpolateShooterPosition = (entity: PositionEntity, previous: PositionIndex, alpha: number) => {
  const prior = previous.get(entity.id) ?? entity.position;
  return {
    x: Math.round(prior.x + (entity.position.x - prior.x) * alpha),
    y: Math.round(prior.y + (entity.position.y - prior.y) * alpha),
  };
};
