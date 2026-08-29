import { findEnemyTrait } from "@/features/action/action-enemy-behaviors";
import { onEnemyKilled } from "@/features/action/action-kit-effects";
import { clamp, goDivide } from "@/features/action/action-math";
import {
  ENEMY_RADIUS,
  type EnemyEntity,
  type SimulationState,
} from "@/features/action/action-simulation-state";
import { ACTION_WIDTH } from "@/features/action/action-types";

const nextEliteEncounterSpec = (
  state: SimulationState,
  start: number,
): number => {
  for (let offset = 0; offset < state.config.enemies.length; offset += 1) {
    const index = (start + offset) % state.config.enemies.length;
    const spec = state.config.enemies[index]!;
    if (
      spec.kind !== "elite" ||
      state.eliteSpawned < state.config.objective.target
    ) {
      return index;
    }
  }
  return -1;
};

export const spawnEnemies = (state: SimulationState): void => {
  if (state.enemies.length >= state.config.maxAlive) return;
  const spawnDeadline =
    state.config.objective.kind === "holdout"
      ? state.config.durationTicks - 90
      : state.config.maxTicks - 90;
  let shouldSpawn =
    state.tickValue === 1 ||
    (state.config.kind !== "boss" &&
      state.tickValue % state.config.spawnInterval === 0 &&
      state.tickValue < spawnDeadline);
  if (state.config.objective.kind === "elite" && state.tickValue > 1) {
    const supportStart = Math.max(450, state.config.spawnInterval * 3);
    shouldSpawn =
      state.tickValue >= supportStart &&
      (state.tickValue - supportStart) % state.config.spawnInterval === 0 &&
      state.tickValue < spawnDeadline;
  }
  if (!shouldSpawn) return;
  let specIndex = state.spawnIndex % state.config.enemies.length;
  if (state.config.objective.kind === "elite") {
    specIndex = nextEliteEncounterSpec(state, specIndex);
    if (specIndex < 0) return;
  }
  const spec = state.config.enemies[specIndex]!;
  state.spawnIndex += 1;
  if (spec.kind === "elite") state.eliteSpawned += 1;
  const edge = state.random.int(3);
  let x = 300 + state.random.int(ACTION_WIDTH - 600);
  let y = 850;
  if (edge === 1) {
    x = 280;
    y = 900 + state.random.int(2800);
  }
  if (edge === 2) {
    x = ACTION_WIDTH - 280;
    y = 900 + state.random.int(2800);
  }
  if (spec.pattern === "boss") {
    x = ACTION_WIDTH / 2;
    y = 1200;
  }
  state.nextEnemyId += 1;
  const health =
    spec.maxHealth +
    goDivide(spec.maxHealth * state.config.noiseLevel, 10);
  state.enemies.push({
    id: state.nextEnemyId,
    specIndex,
    x,
    y,
    health,
    maxHealth: health,
    fireClock: 0,
    attackIndex: 0,
  });
};

export const resolveDefeatedEnemies = (state: SimulationState): void => {
  const alive: EnemyEntity[] = [];
  const splits: EnemyEntity[] = [];
  for (const enemy of state.enemies) {
    if (enemy.health > 0) {
      alive.push(enemy);
      continue;
    }
    state.kills += 1;
    state.score += 100;
    onEnemyKilled(state);
    const spec = state.config.enemies[enemy.specIndex]!;
    if (spec.kind === "elite") state.eliteKills += 1;
    const split = findEnemyTrait(spec, "death_split");
    if (!split) continue;
    const childSpecIndex = state.config.enemies.findIndex(
      (candidate) => candidate.slug === split.value,
    );
    let childCount = clamp(split.amount, 1, 3);
    const available = Math.max(
      0,
      state.config.maxAlive - alive.length - splits.length,
    );
    childCount = Math.min(childCount, available);
    for (
      let child = 0;
      child < childCount && childSpecIndex >= 0;
      child += 1
    ) {
      let offset = (child - goDivide(childCount - 1, 2)) * 180;
      if (childCount % 2 === 0) offset = (child * 2 - 1) * 120;
      state.nextEnemyId += 1;
      const childSpec = state.config.enemies[childSpecIndex]!;
      const health = Math.max(1, goDivide(childSpec.maxHealth, 2));
      splits.push({
        id: state.nextEnemyId,
        specIndex: childSpecIndex,
        x: clamp(
          enemy.x + offset,
          ENEMY_RADIUS,
          ACTION_WIDTH - ENEMY_RADIUS,
        ),
        y: enemy.y,
        health,
        maxHealth: health,
        fireClock: 0,
        attackIndex: 0,
      });
    }
  }
  state.enemies = [...alive, ...splits];
};
