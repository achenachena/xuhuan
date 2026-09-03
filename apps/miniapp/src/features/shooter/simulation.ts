import {
  ENEMY_RADIUS,
  PLAYER_RADIUS,
  SHOOTER_WIDTH,
  clamp,
} from "@/features/shooter/constants";
import { spawnBoss, updateBoss } from "@/features/shooter/bosses";
import {
  damagePlayer,
  encoreInterval,
  enemyIntent,
  fireEnemy,
  fireEnemySecondary,
  hasTrait,
  moveEnemy,
  removeDefeatedEnemies,
  threatSnapshots,
  updateEffects,
  updateKitPassives,
  updatePickups,
  updateProjectiles,
} from "@/features/shooter/enemies";
import type { ShooterInput } from "@/features/shooter/input";
import { ShooterRandom } from "@/features/shooter/random";
import { activateRescue } from "@/features/shooter/specials";
import type {
  ShooterMutableState,
  ShooterResult,
  ShooterRuntime,
  ShooterSnapshot,
  ShooterStepEvents,
} from "@/features/shooter/types";
import { emptyStepEvents } from "@/features/shooter/types";
import { createShooterRuntime, updateCompanions, updateWeapons } from "@/features/shooter/weapons";
import { spawnWave } from "@/features/shooter/waves";
import type { ShooterRuntimeConfig } from "@/lib/api/types";

export { createShooterRuntime } from "@/features/shooter/weapons";

export type ShooterSimulation = {
  readonly snapshot: () => ShooterSnapshot;
  readonly step: (input: ShooterInput) => ShooterStepEvents;
  readonly result: () => ShooterResult | null;
};

const createInitialState = (runtime: ShooterRuntime): ShooterMutableState => ({
  config: runtime.config,
  runtime: runtime.resolved,
  random: new ShooterRandom(runtime.config.seed),
  tick: 0,
  playerX: SHOOTER_WIDTH / 2,
  health: runtime.config.player_health,
  shield: runtime.resolved.startingShield,
  invulnerableTicks: 0,
  rescueCharge: clamp(runtime.resolved.rescueCharge, 0, 100),
  rescueHeld: false,
  rescuesUsed: 0,
  grazeCount: 0,
  combo: 0,
  comboClock: 0,
  kills: 0,
  score: 0,
  attackClock: 0,
  attackSequence: 0,
  alignmentTicks: 0,
  companionClocks: runtime.config.companions.map((companion) =>
    companion.trigger === "segment_start" ? Math.max(1, companion.cooldown_ticks) : 0,
  ),
  nextEnemyID: 0,
  nextProjectileID: 0,
  nextPickupID: 0,
  nextEffectID: 0,
  spawnedBoss: false,
  lastRescueTick: 0,
  bossPhaseTick: 0,
  dailyVariant: runtime.dailyVariant,
  enemies: [],
  enemyProjectiles: [],
  playerProjectiles: [],
  pickups: [],
  pickupsCollected: 0,
  lastPickupTick: 0,
  pickupPower: null,
  pickupPowerTicks: 0,
  pressureQuietTicks: 0,
  effects: [],
});

const updateEnemies = (state: ShooterMutableState): void => {
  for (const enemy of state.enemies) {
    if (enemy.health <= 0) continue;
    enemy.age += 1;
    if (enemy.boss) {
      updateBoss(state, enemy);
      continue;
    }
    const spec = state.config.enemies[enemy.specIndex]!;
    moveEnemy(state, enemy, spec);
    enemy.fireClock += 1;
    const interval = encoreInterval(
      spec.fire_interval,
      state.config.encore_level,
      12,
    );
    if (enemy.fireClock >= interval) {
      enemy.fireClock = 0;
      fireEnemy(state, enemy, spec, spec.shot_pattern);
      if (state.config.encore_level >= 2 && (enemy.volley & 1) !== 0) {
        fireEnemySecondary(state, enemy, spec);
      }
      enemy.volley += 1;
    }
    if (enemy.y >= 5_200 - ENEMY_RADIUS && Math.abs(enemy.x - state.playerX) < PLAYER_RADIUS + ENEMY_RADIUS) {
      damagePlayer(state, Math.max(1, spec.contact_damage));
      if (hasTrait(spec, "steal_pickup")) state.rescueCharge = Math.max(0, state.rescueCharge - 20);
      enemy.health = 0;
    }
  }
  removeDefeatedEnemies(state);
};

const snapshot = (state: ShooterMutableState): ShooterSnapshot => ({
  tick: state.tick,
  player_x: state.playerX,
  health: state.health,
  max_health: 3,
  shield: state.shield,
  invulnerable_ticks: state.invulnerableTicks,
  rescue_charge: state.rescueCharge,
  rescues_used: state.rescuesUsed,
  graze_count: state.grazeCount,
  combo: state.combo,
  score: state.score,
  ...(state.pickupPower && state.pickupPowerTicks > 0
    ? {
        pickup_power: state.pickupPower,
        pickup_power_ticks: state.pickupPowerTicks,
      }
    : {}),
  ...(state.dailyVariant ? { daily_variant: state.dailyVariant } : {}),
  enemies: state.enemies.map((enemy) => {
    const spec = enemy.boss ? null : state.config.enemies[enemy.specIndex]!;
    let intent: "fire" | "charge" | "" = "";
    if (enemy.boss && state.config.boss) {
      const stage = state.config.boss.stages[enemy.phase - 1];
      if (stage?.telegraph_ticks && enemy.fireClock >= Math.max(1, stage.fire_interval - stage.telegraph_ticks)) intent = "fire";
    } else if (spec) {
      intent = enemyIntent(enemy, spec, state.config.encore_level);
    }
    return {
      id: enemy.id,
      spec_id: enemy.boss && state.config.boss ? state.config.boss.id : (spec?.id ?? ""),
      chassis: enemy.boss ? "censor-frame" : (spec?.chassis ?? "spam-bot"),
      position: { x: enemy.x, y: enemy.y },
      health: Math.max(0, enemy.health),
      max_health: enemy.maxHealth,
      boss: enemy.boss,
      ...(enemy.phase ? { stage: enemy.phase } : {}),
      ...(intent ? { intent } : {}),
      ...(enemy.marks ? { marks: enemy.marks } : {}),
    };
  }),
  enemy_projectiles: state.enemyProjectiles.map((item) => ({
    id: item.id,
    position: { x: item.x, y: item.y },
    velocity: { x: item.vx, y: item.vy },
    hostile: item.hostile,
    ...(item.kind ? { kind: item.kind } : {}),
    ...(item.radius ? { radius: item.radius } : {}),
    ...(item.width ? { width: item.width } : {}),
    ...(item.health > 0 ? { health: item.health } : {}),
  })),
  player_projectiles: state.playerProjectiles.map((item) => ({
    id: item.id,
    position: { x: item.x, y: item.y },
    velocity: { x: item.vx, y: item.vy },
    hostile: item.hostile,
    ...(item.kind ? { kind: item.kind } : {}),
    ...(item.radius ? { radius: item.radius } : {}),
    ...(item.width ? { width: item.width } : {}),
    ...(item.health > 0 ? { health: item.health } : {}),
  })),
  pickups: state.pickups.map((item) => ({
    id: item.id,
    kind: item.kind,
    position: { x: item.x, y: item.y },
    value: item.value,
  })),
  threats: threatSnapshots(state),
  effects: state.effects.map((item) => ({
    id: item.id,
    kind: item.kind,
    position: { x: item.x, y: item.y },
    ticks: item.ticks,
    ...(item.power ? { power: item.power } : {}),
  })),
});

export const createShooterSimulation = (runtime: ShooterRuntime): ShooterSimulation => {
  const state = createInitialState(runtime);
  let cachedResult: ShooterResult | null = null;

  const step = (input: ShooterInput): ShooterStepEvents => {
    if (state.tick >= state.config.duration_ticks || state.health <= 0) {
      return emptyStepEvents();
    }
    const before = {
      health: state.health,
      shield: state.shield,
      combo: state.combo,
      pickups: state.pickupsCollected,
      rescues: state.rescuesUsed,
      warnings: threatSnapshots(state).length,
      enemyHealth: new Map(state.enemies.map((enemy) => [enemy.id, enemy.health])),
    };
    state.tick += 1;
    if (state.invulnerableTicks > 0) state.invulnerableTicks -= 1;
    let moveLimit = state.config.kit.move_limit;
    if (moveLimit <= 0 || moveLimit > SHOOTER_WIDTH / 2 - PLAYER_RADIUS) moveLimit = SHOOTER_WIDTH / 2 - PLAYER_RADIUS;
    state.playerX = SHOOTER_WIDTH / 2 - moveLimit + input.x * (moveLimit * 2) / 127;
    state.playerX = Math.trunc(state.playerX);
    const rescueActivated = input.rescue && !state.rescueHeld ? activateRescue(state) : false;
    state.rescueHeld = input.rescue;
    spawnWave(state);
    spawnBoss(state);
    updateWeapons(state);
    updateCompanions(state);
    updateEnemies(state);
    updateKitPassives(state);
    updateProjectiles(state);
    updatePickups(state);
    updateEffects(state);
    if (state.pickupPowerTicks > 0) state.pickupPowerTicks -= 1;
    if (state.pickupPowerTicks === 0) state.pickupPower = null;
    if (state.comboClock > 0) state.comboClock -= 1;
    else state.combo = 0;
    if (state.health < 0) state.health = 0;
    const warnings = threatSnapshots(state).length;
    const enemyHitIDs = state.enemies
      .filter(
        (enemy) =>
          (before.enemyHealth.get(enemy.id) ?? enemy.maxHealth) > enemy.health,
      )
      .map((enemy) => enemy.id);
    const enemyDefeatedIDs = state.enemies
      .filter(
        (enemy) =>
          enemy.health <= 0 &&
          (before.enemyHealth.get(enemy.id) ?? enemy.maxHealth) > 0,
      )
      .map((enemy) => enemy.id);
    return {
      pickup: state.pickupsCollected > before.pickups,
      enemyHitIDs,
      enemyDefeatedIDs,
      hit: state.health < before.health,
      shield: state.shield < before.shield && state.health === before.health,
      combo: state.combo > before.combo,
      rescue: rescueActivated || state.rescuesUsed > before.rescues,
      bossWarning: warnings > before.warnings,
    };
  };

  const result = (): ShooterResult | null => {
    const aliveBoss = state.enemies.some((enemy) => enemy.boss && enemy.health > 0);
    const bossDefeated = Boolean(
      state.config.boss && state.spawnedBoss && !aliveBoss,
    );
    if (
      state.health > 0 &&
      state.tick < state.config.duration_ticks &&
      !bossDefeated
    ) {
      return null;
    }
    if (cachedResult) return cachedResult;
    const won = state.health > 0 && (!state.config.boss || !aliveBoss);
    if (won) state.score += state.health * 10 + state.rescueCharge * 2;
    cachedResult = {
      won,
      health: state.health,
      ticks: state.tick,
      kills: state.kills,
      rescues_used: state.rescuesUsed,
      grazes: state.grazeCount,
      score: state.score,
      ...(state.dailyVariant ? { daily_variant: state.dailyVariant } : {}),
      final: snapshot(state),
    };
    return cachedResult;
  };

  return { snapshot: () => snapshot(state), step, result };
};

export const createShooterSimulationFromConfig = (config: ShooterRuntimeConfig): ShooterSimulation =>
  createShooterSimulation(createShooterRuntime(config));
