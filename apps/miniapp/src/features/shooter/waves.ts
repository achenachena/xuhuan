import {
  ENEMY_RADIUS,
  SHOOTER_WIDTH,
  clamp,
  goDivide,
} from "@/features/shooter/constants";
import { shooterSeedFromString } from "@/features/shooter/random";
import type { ShooterMutableState } from "@/features/shooter/types";

const formationX = (
  formation: string,
  index: number,
  count: number,
  tick: number,
): number => {
  const center = SHOOTER_WIDTH / 2;
  if (formation === "line") return center + ((index * 2 - (count - 1)) * 520) / 2;
  if (formation === "fan") return center + ((index * 2 - (count - 1)) * 360) / 2;
  if (formation === "staggered") return 520 + (index * 760) % 2_560;
  if (formation === "pincer") return index & 1 ? SHOOTER_WIDTH - 400 - Math.trunc(index / 2) * 220 : 400 + Math.trunc(index / 2) * 220;
  if (formation === "center") return center + ((index * 2 - (count - 1)) * 180) / 2;
  if (formation === "sweep") return 320 + (tick * 17 + index * 540) % (SHOOTER_WIDTH - 640);
  return center;
};

const spawnEnemy = (
  state: ShooterMutableState,
  specID: string,
  authoredX: number,
): void => {
  if (state.enemies.length >= state.config.limits.enemies) return;
  const specIndex = state.config.enemies.findIndex((spec) => spec.id === specID);
  if (specIndex < 0) return;
  let x = authoredX;
  if (x <= 0 || x >= SHOOTER_WIDTH) x = 320 + state.random.integer(SHOOTER_WIDTH - 640);
  x = clamp(x, ENEMY_RADIUS, SHOOTER_WIDTH - ENEMY_RADIUS);
  const spec = state.config.enemies[specIndex]!;
  const health = spec.health;
  state.nextEnemyID += 1;
  state.enemies.push({
    id: state.nextEnemyID,
    specIndex,
    x,
    y: 500,
    health,
    maxHealth: health,
    fireClock: 0,
    age: 0,
    phase: 0,
    warning: 0,
    volley: 0,
    marks: 0,
    boss: false,
  });
};

const spawnLatePressure = (state: ShooterMutableState): void => {
  if (
    state.config.boss ||
    state.config.wave.spawns.length === 0 ||
    state.enemies.length >= state.config.limits.enemies
  ) {
    return;
  }
  if (state.enemies.length === 0 && state.enemyProjectiles.length === 0) {
    state.pressureQuietTicks += 1;
  } else {
    state.pressureQuietTicks = 0;
  }
  let lastAuthoredTick = 0;
  const pool: string[] = [];
  for (const spawn of state.config.wave.spawns) {
    lastAuthoredTick = Math.max(
      lastAuthoredTick,
      spawn.at_tick +
        (Math.max(1, spawn.count) - 1) * Math.max(1, spawn.interval_ticks),
    );
    if (!pool.includes(spawn.enemy_id)) pool.push(spawn.enemy_id);
  }
  const start = lastAuthoredTick + 90;
  const interval = state.config.encore_level >= 1 ? 105 : 120;
  const elapsed = state.tick - 1 - start;
  const finalTick = state.config.duration_ticks - 90;
  const regularPulse =
    elapsed >= 0 &&
    elapsed % interval === 0 &&
    state.tick - 1 <= state.config.duration_ticks - 60;
  let lastRegular = start;
  if (finalTick > start) {
    lastRegular = start + goDivide(finalTick - start, interval) * interval;
  }
  const finalPulse = state.tick - 1 === finalTick && finalTick !== lastRegular;
  const emergencyPulse = state.tick - 1 > 30 && state.pressureQuietTicks >= 90;
  if (!regularPulse && !finalPulse && !emergencyPulse) return;

  const cycle = Math.max(0, goDivide(elapsed, interval));
  const seedOffset =
    shooterSeedFromString(`${state.config.seed}:late-pressure`) % pool.length;
  const enemyID = pool[(seedOffset + cycle) % pool.length]!;
  const formations = ["pincer", "sweep", "staggered", "fan"] as const;
  const formation = formations[(seedOffset + cycle) % formations.length]!;
  const count =
    state.config.encore_level >= 1 && (cycle & 1) !== 0 ? 2 : 1;
  for (
    let index = 0;
    index < count && state.enemies.length < state.config.limits.enemies;
    index += 1
  ) {
    spawnEnemy(
      state,
      enemyID,
      formationX(formation, index, count, state.tick),
    );
  }
  state.pressureQuietTicks = 0;
};

export const spawnWave = (state: ShooterMutableState): void => {
  for (const spawn of state.config.wave.spawns) {
    const count = Math.max(1, spawn.count);
    const every = Math.max(1, spawn.interval_ticks);
    for (let occurrence = 0; occurrence < count; occurrence += 1) {
      if (state.tick - 1 === spawn.at_tick + occurrence * every) {
        spawnEnemy(state, spawn.enemy_id, formationX(spawn.formation, occurrence, count, state.tick));
      }
    }
  }
  spawnLatePressure(state);
};
