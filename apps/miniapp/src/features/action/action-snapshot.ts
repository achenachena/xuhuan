import {
  bossMimic,
  enemyBossPhase,
} from "@/features/action/action-boss-scripts";
import { fnvDigest } from "@/features/action/action-digest";
import { currentEnemyAttack } from "@/features/action/action-enemy-behaviors";
import { ACTION_DIRECTIONS, goDivide } from "@/features/action/action-math";
import {
  SIGNAL_PATTERNS,
  SIGNAL_TYPES,
  stableStringId,
  type EnemyEntity,
  type SimulationState,
} from "@/features/action/action-simulation-state";
import type {
  ActionAttackSpec,
  ActionEnemySnapshot,
  ActionEnemySpec,
  ActionProjectileSnapshot,
  ActionResult,
  ActionSignalSnapshot,
  ActionSnapshot,
  ActionVec,
} from "@/features/action/action-types";

const intentWindow = (state: SimulationState): number =>
  Math.max(8, 15 - state.config.noiseLevel * 2);

const enemyIntent = (
  state: SimulationState,
  enemy: EnemyEntity,
  spec: ActionEnemySpec,
  attack: ActionAttackSpec,
): { readonly ticks: number; readonly target: ActionVec } => {
  if (attack.interval <= 0) return { ticks: 0, target: { x: 0, y: 0 } };
  const interval = Math.max(
    20,
    attack.interval - state.config.noiseLevel * 3,
  );
  const remaining = interval - enemy.fireClock;
  const window = Math.max(intentWindow(state), attack.telegraphTicks);
  if (remaining <= 0 || remaining > window) {
    return { ticks: 0, target: { x: 0, y: 0 } };
  }
  if (attack.kind === "ring" || attack.kind === "mine") {
    return { ticks: remaining, target: { x: enemy.x, y: enemy.y } };
  }
  if (attack.kind === "spiral") {
    const direction =
      (goDivide(state.tickValue + remaining, interval) * 2) & 15;
    const vector = ACTION_DIRECTIONS[direction]!;
    return {
      ticks: remaining,
      target: { x: enemy.x + vector.x * 3, y: enemy.y + vector.y * 3 },
    };
  }
  if (spec.pattern === "mine") {
    return { ticks: remaining, target: { x: enemy.x, y: enemy.y } };
  }
  if (spec.pattern === "orbiter") {
    const direction =
      (goDivide(state.tickValue + remaining, interval) * 2) & 15;
    const vector = ACTION_DIRECTIONS[direction]!;
    return {
      ticks: remaining,
      target: { x: enemy.x + vector.x * 3, y: enemy.y + vector.y * 3 },
    };
  }
  return {
    ticks: remaining,
    target: { x: state.playerX, y: state.playerY },
  };
};

export const buildActionSnapshot = (state: SimulationState): ActionSnapshot => {
  const enemies: ActionEnemySnapshot[] = state.enemies.map((enemy) => {
    const spec = state.config.enemies[enemy.specIndex]!;
    const maximum = enemy.maxHealth > 0 ? enemy.maxHealth : spec.maxHealth;
    const phase =
      spec.pattern === "boss" ? enemyBossPhase(enemy.health, maximum) : 0;
    const attack = currentEnemyAttack(
      spec,
      enemy.attackIndex,
      enemy.health,
      maximum,
      state.config.bossVariant,
    );
    const intent = enemyIntent(state, enemy, spec, attack);
    return {
      id: enemy.id,
      slug: spec.slug,
      kind: spec.kind,
      movement: spec.movement.kind,
      attack: attack.kind,
      traits: spec.traits,
      pattern: spec.pattern,
      position: { x: enemy.x, y: enemy.y },
      health: enemy.health,
      maxHealth: maximum,
      boss: spec.kind === "boss" || spec.pattern === "boss",
      bossPhase: phase,
      bossMimic: phase > 0 ? bossMimic(state.config.runtime) : "",
      intentTicks: intent.ticks,
      intentTarget: intent.target,
    };
  });
  const projectiles: ActionProjectileSnapshot[] = state.projectiles.map(
    (bullet) => ({
      id: bullet.id,
      pattern: bullet.pattern,
      position: { x: bullet.x, y: bullet.y },
      velocity: { x: bullet.vx, y: bullet.vy },
      grazed: bullet.grazed,
      glitchMarked: bullet.glitchMarked,
    }),
  );
  const positions = SIGNAL_PATTERNS[state.signalPattern]!;
  const signals: ActionSignalSnapshot[] = [];
  for (let index = 0; index < positions.length; index += 1) {
    if (state.signalCooldown[index] === 0) {
      signals.push({
        id: index + 1,
        type: SIGNAL_TYPES[index]!,
        position: positions[index]!,
      });
    }
  }
  return {
    tick: state.tickValue,
    player: { x: state.playerX, y: state.playerY },
    health: Math.max(0, state.health),
    maxHealth: state.config.playerMaxHealth,
    shield: state.shield,
    distortion: state.distortion,
    warpCooldown: state.warpClock,
    invulnerable: state.invulnerable,
    reconnectFX: state.reconnectFX,
    warpFX: state.warpFX,
    signalPulse: state.signalPulse,
    signals,
    weave: [...state.weave],
    protocol: state.protocol,
    objective: {
      kind: state.config.objective.kind,
      target: state.config.objective.target,
      progress: state.objectiveProgress,
    },
    score: state.score,
    totalGrazes: state.totalGrazes,
    enemies,
    projectiles,
    signalWaypoints: state.signalWaypoints.map((point) => ({ ...point })),
    blooms: state.blooms.map((point) => ({ ...point })),
    safeZones: state.safeZones.map((zone) => ({
      position: { ...zone.position },
      radius: zone.radius,
      ticks: Math.max(0, zone.expiresTick - state.tickValue),
    })),
    friendlyShots: state.friendlyShots.map((shot) => ({
      id: shot.id,
      position: { x: shot.x, y: shot.y },
      targetId: shot.targetId,
    })),
    warpReplays: state.delayedWarps.map((replay) => ({
      start: { ...replay.start },
      end: { ...replay.end },
      triggerTicks: Math.max(0, replay.triggerTick - state.tickValue),
    })),
  };
};

export const canonicalDigest = (state: SimulationState): string => {
  const values = [
    state.tickValue,
    Math.max(0, state.health),
    state.shield,
    state.playerX,
    state.playerY,
    state.kills,
    state.protocols,
    state.distortion,
    state.objectiveProgress,
    state.score,
    state.emergencyUsed ? 1 : 0,
    state.won ? 1 : 0,
    state.warpClock,
    state.invulnerable,
    state.attackClock,
    state.totalGrazes,
    state.routeStep,
    state.routeReady ? 1 : 0,
    state.routeWarpUsed ? 1 : 0,
    state.lastGraze,
    state.nextEnemyId,
    state.nextBulletId,
    state.spawnIndex,
    state.random.state,
    state.signalPattern,
    state.autoAttacks,
    state.warpReadyTick,
    state.lastSignalTick,
    stableStringId(state.protocol),
    stableStringId(state.lastSignal),
    state.hasLastWarp ? 1 : 0,
    state.lastWarpStart.x,
    state.lastWarpStart.y,
    state.lastWarpEnd.x,
    state.lastWarpEnd.y,
    state.nextFriendlyId,
  ];
  if (
    state.config.kind === "boss" ||
    state.config.objective.kind === "boss"
  ) {
    values.push(stableStringId(state.config.bossVariant));
  }
  if (state.config.objective.kind === "elite") {
    values.push(state.eliteSpawned, state.eliteKills);
  }
  values.push(
    ...state.signalCooldown,
    ...state.weave.map(stableStringId),
  );
  for (const waypoint of state.signalWaypoints) {
    values.push(waypoint.x, waypoint.y);
  }
  for (const bloom of state.blooms) values.push(bloom.x, bloom.y);
  for (const zone of state.safeZones) {
    values.push(
      zone.position.x,
      zone.position.y,
      zone.radius,
      zone.expiresTick,
    );
  }
  for (const replay of state.delayedWarps) {
    values.push(
      replay.start.x,
      replay.start.y,
      replay.end.x,
      replay.end.y,
      replay.triggerTick,
      replay.damage,
      replay.radius,
    );
  }
  for (const shot of state.friendlyShots) {
    values.push(
      shot.id,
      shot.x,
      shot.y,
      shot.targetId,
      shot.damage,
      shot.life,
    );
  }
  for (const enemy of state.enemies) {
    values.push(
      enemy.id,
      enemy.specIndex,
      enemy.x,
      enemy.y,
      Math.max(0, enemy.health),
      enemy.maxHealth,
      enemy.fireClock,
      enemy.attackIndex,
    );
  }
  for (const bullet of state.projectiles) {
    values.push(
      bullet.id,
      bullet.x,
      bullet.y,
      bullet.vx,
      bullet.vy,
      bullet.damage,
      bullet.grazed ? 1 : 0,
      bullet.glitchMarked ? 1 : 0,
      bullet.delay,
      stableStringId(bullet.pattern),
    );
  }
  return fnvDigest(values);
};

export const buildActionResult = (state: SimulationState): ActionResult => {
  const final = buildActionSnapshot(state);
  state.score +=
    Math.max(0, state.health) * 5 +
    state.protocols * 250 +
    goDivide(Math.max(0, state.config.maxTicks - state.tickValue), 3);
  const authoritativeFinal: ActionSnapshot = { ...final, score: state.score };
  return {
    won: state.won,
    health: Math.max(0, state.health),
    ticks: state.tickValue,
    kills: state.kills,
    protocolsCompleted: state.protocols,
    distortion: state.distortion,
    score: state.score,
    emergencyReconnectUsed: state.emergencyUsed,
    digest: canonicalDigest(state),
    final: authoritativeFinal,
  };
};
