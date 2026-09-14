import {
  ENEMY_RADIUS,
  SHOOTER_WIDTH,
  clamp,
} from "@/features/shooter/constants";
import type { ShooterMutableState } from "@/features/shooter/types";
import { spawnReversalGroups } from "@/features/shooter/reversal";

export const hasClearedAuthoredWave = (state: ShooterMutableState): boolean => {
  if (state.config.boss || state.enemies.some((enemy) => enemy.health > 0)) return false;
  const spawns = state.config.reversal?.groups ?? state.config.wave.spawns;
  if (spawns.length === 0) return false;
  const lastTick = Math.max(...spawns.map((spawn) => spawn.at_tick + ("count" in spawn
    ? (Math.max(1, spawn.count) - 1) * Math.max(1, spawn.interval_ticks)
    : 0)));
  return state.config.reversal ? state.tick > lastTick : state.waveTick >= lastTick;
};

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
  const cap = specID === "clip-cutter" ? 2 : specID === "censor-frame" || specID === "shield-relay" ? 1 : state.config.limits.enemies;
  if (state.enemies.filter(enemy => enemy.health > 0 && enemy.specIndex === specIndex).length >= cap) return;
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

export const spawnWave = (state: ShooterMutableState): void => {
  if (state.config.reversal) { spawnReversalGroups(state); return; }
  if (state.config.boss) return;
  state.waveTick += 1;
  state.waveQuietTicks = state.nextEnemyID > 0 && !state.enemies.some(enemy => enemy.health > 0)
    ? state.waveQuietTicks + 1 : 0;
  // Advance only the spawn schedule after a 0.8-second breather. Combat, buffs,
  // projectiles and the survival timer keep their real 30 Hz clock.
  if (state.waveQuietTicks >= 24) {
    let nextTick = Infinity;
    for (const spawn of state.config.wave.spawns) {
      for (let index = 0; index < Math.max(1, spawn.count); index += 1) {
        const at = spawn.at_tick + index * Math.max(1, spawn.interval_ticks);
        if (at >= state.waveTick) nextTick = Math.min(nextTick, at);
      }
    }
    if (Number.isFinite(nextTick)) state.waveTick = nextTick;
    state.waveQuietTicks = 0;
  }
  for (const spawn of state.config.wave.spawns) {
    const count = Math.max(1, spawn.count);
    const every = Math.max(1, spawn.interval_ticks);
    for (let occurrence = 0; occurrence < count; occurrence += 1) {
      if (state.waveTick === spawn.at_tick + occurrence * every) {
        spawnEnemy(state, spawn.enemy_id, formationX(spawn.formation, occurrence, count, state.tick));
      }
    }
  }
};
