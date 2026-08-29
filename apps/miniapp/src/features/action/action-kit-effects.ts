import {
  distanceSquared,
  goDivide,
  integerSqrt,
  nearTravelPath,
} from "@/features/action/action-math";
import {
  BULLET_RADIUS,
  ENEMY_RADIUS,
  type FriendlyProjectileEntity,
  type SimulationState,
} from "@/features/action/action-simulation-state";
import {
  ACTION_MAX_FRIENDLY_PROJECTILES,
  ACTION_MAX_SIGNALS,
  type ActionVec,
} from "@/features/action/action-types";

export const AVA_REPLAY_DELAY_TICKS = 18;
const FRIENDLY_SHOT_SPEED = 180;
const FRIENDLY_SHOT_LIFE = 60;
const BLOOM_SAFE_TICKS = 45;

export const launchFriendlyShot = (
  state: SimulationState,
  position: ActionVec,
  damage: number,
): void => {
  const targetId = nearestEnemyId(state, position.x, position.y);
  if (
    targetId === 0 ||
    state.friendlyShots.length >= ACTION_MAX_FRIENDLY_PROJECTILES
  ) {
    return;
  }
  state.nextFriendlyId += 1;
  state.friendlyShots.push({
    id: state.nextFriendlyId,
    x: position.x,
    y: position.y,
    targetId,
    damage,
    life: FRIENDLY_SHOT_LIFE,
  });
};

export const recordWarp = (
  state: SimulationState,
  start: ActionVec,
  end: ActionVec,
): void => {
  state.lastWarpStart = { ...start };
  state.lastWarpEnd = { ...end };
  state.hasLastWarp = true;
  for (const behavior of state.config.runtime.behaviors) {
    if (behavior.kind === "warp_aftershock") {
      scheduleWarpReplay(
        state,
        start,
        end,
        6 + behavior.level * 2,
        behavior.amount,
        360 + behavior.level * 40,
      );
    }
  }
  if (state.config.runtime.passive === "ava_afterimage") {
    scheduleWarpReplay(
      state,
      start,
      end,
      AVA_REPLAY_DELAY_TICKS,
      Math.max(5, goDivide(state.config.runtime.warpDamage, 2)),
      380,
    );
  }
};

export const onGraze = (state: SimulationState): void => {
  state.totalGrazes += 1;
  for (const behavior of state.config.runtime.behaviors) {
    if (
      behavior.kind === "graze_guard" &&
      behavior.every > 0 &&
      state.totalGrazes % behavior.every === 0
    ) {
      state.shield += behavior.amount;
    }
  }
};

export const onProtocolComplete = (state: SimulationState): void => {
  for (const behavior of state.config.runtime.behaviors) {
    if (
      behavior.kind !== "protocol_echo" ||
      behavior.every <= 0 ||
      state.protocols % behavior.every !== 0
    ) {
      continue;
    }
    for (const enemy of state.enemies) {
      if (enemy.health > 0) enemy.health -= behavior.amount;
    }
    state.score += behavior.amount * 5;
  }
};

export const onEnemyKilled = (state: SimulationState): void => {
  for (const behavior of state.config.runtime.behaviors) {
    if (
      behavior.kind !== "kill_signal" ||
      behavior.every <= 0 ||
      state.kills % behavior.every !== 0
    ) {
      continue;
    }
    const index =
      (goDivide(state.kills, behavior.every) + behavior.level - 1) %
      state.signalCooldown.length;
    state.signalCooldown[index] = 0;
    state.signalPulse = Math.max(state.signalPulse, 12);
  }
};

const scheduleWarpReplay = (
  state: SimulationState,
  start: ActionVec,
  end: ActionVec,
  delay: number,
  damage: number,
  radius: number,
): void => {
  const replay = {
    start: { ...start },
    end: { ...end },
    triggerTick: state.tickValue + delay,
    damage,
    radius,
  };
  if (state.delayedWarps.length === 4) {
    state.delayedWarps = [...state.delayedWarps.slice(1), replay];
    return;
  }
  state.delayedWarps.push(replay);
};

export const empowerLatestAvaReplay = (
  state: SimulationState,
  power: number,
): void => {
  if (state.delayedWarps.length === 0 && state.hasLastWarp) {
    scheduleWarpReplay(
      state,
      state.lastWarpStart,
      state.lastWarpEnd,
      AVA_REPLAY_DELAY_TICKS,
      power,
      650,
    );
    return;
  }
  const latest = state.delayedWarps.at(-1);
  if (!latest) return;
  latest.damage = Math.max(
    latest.damage,
    power + goDivide(state.config.runtime.warpDamage, 2),
  );
  latest.radius = Math.max(latest.radius, 650);
};

export const activateKitWarp = (
  state: SimulationState,
  empowered: boolean,
): void => {
  switch (state.config.runtime.passive) {
    case "nana_route_chain":
      if (empowered && state.protocol !== "resonance") {
        detonateNanaWaypoints(
          state,
          Math.max(
            8,
            goDivide(state.config.runtime.warpDamage, 2) +
              goDivide(state.config.runtime.protocolDamage, 3),
          ),
        );
      }
      break;
    case "lulu_convert_projectiles":
      convertMarkedProjectiles(state);
      break;
    case "nailu_memory_bloom":
      detonateBlooms(state);
      break;
  }
};

export const detonateNanaWaypoints = (
  state: SimulationState,
  damage: number,
): void => {
  state.signalWaypoints.forEach((point, index) => {
    damageArea(state, point, 560, damage + index * 2);
    clearProjectiles(state, point, 620);
  });
};

export const plantBloom = (
  state: SimulationState,
  position: ActionVec,
): void => {
  const bloom = { ...position };
  if (state.blooms.length === ACTION_MAX_SIGNALS) {
    state.blooms = [...state.blooms.slice(1), bloom];
    return;
  }
  state.blooms.push(bloom);
};

export const detonateBlooms = (state: SimulationState): void => {
  state.blooms.forEach((bloom, index) => {
    const damage =
      Math.max(5, goDivide(state.config.runtime.warpDamage, 2)) + index * 2;
    damageArea(state, bloom, 650, damage);
    clearProjectiles(state, bloom, 720);
    const zone = {
      position: { ...bloom },
      radius: 460,
      expiresTick: state.tickValue + BLOOM_SAFE_TICKS,
    };
    if (state.safeZones.length === ACTION_MAX_SIGNALS) {
      state.safeZones = [...state.safeZones.slice(1), zone];
    } else {
      state.safeZones.push(zone);
    }
  });
  state.blooms = [];
};

export const markAllProjectiles = (state: SimulationState): void => {
  for (const bullet of state.projectiles) bullet.glitchMarked = true;
};

export const convertMarkedProjectiles = (
  state: SimulationState,
): void => {
  const kept = [];
  for (const bullet of state.projectiles) {
    if (!bullet.glitchMarked) {
      kept.push(bullet);
      continue;
    }
    launchFriendlyShot(
      state,
      { x: bullet.x, y: bullet.y },
      Math.max(
        3,
        goDivide(state.config.runtime.attackDamage, 2) +
          goDivide(state.config.runtime.resonancePower, 4),
      ),
    );
  }
  state.projectiles = kept;
};

export const updateKitEffects = (state: SimulationState): void => {
  state.safeZones = state.safeZones.filter(
    (zone) => zone.expiresTick > state.tickValue,
  );
  const pending = [];
  for (const replay of state.delayedWarps) {
    if (replay.triggerTick > state.tickValue) {
      pending.push(replay);
      continue;
    }
    const middle = {
      x: goDivide(replay.start.x + replay.end.x, 2),
      y: goDivide(replay.start.y + replay.end.y, 2),
    };
    for (const enemy of state.enemies) {
      if (
        nearTravelPath(
          enemy.x,
          enemy.y,
          replay.start.x,
          replay.start.y,
          middle.x,
          middle.y,
          replay.end.x,
          replay.end.y,
          replay.radius,
        )
      ) {
        enemy.health -= replay.damage;
      }
    }
    state.projectiles = state.projectiles.filter(
      (bullet) =>
        !nearTravelPath(
          bullet.x,
          bullet.y,
          replay.start.x,
          replay.start.y,
          middle.x,
          middle.y,
          replay.end.x,
          replay.end.y,
          replay.radius,
        ),
    );
    state.score += 40;
  }
  state.delayedWarps = pending;
  updateFriendlyProjectiles(state);
};

const updateFriendlyProjectiles = (state: SimulationState): void => {
  const kept: FriendlyProjectileEntity[] = [];
  for (const source of state.friendlyShots) {
    const shot = { ...source, life: source.life - 1 };
    if (shot.life <= 0) continue;
    let targetIndex = enemyIndexById(state, shot.targetId);
    if (targetIndex < 0 || state.enemies[targetIndex]!.health <= 0) {
      shot.targetId = nearestEnemyId(state, shot.x, shot.y);
      targetIndex = enemyIndexById(state, shot.targetId);
    }
    if (targetIndex < 0) continue;
    const target = state.enemies[targetIndex]!;
    const dx = target.x - shot.x;
    const dy = target.y - shot.y;
    const distance = Math.max(1, integerSqrt(dx * dx + dy * dy));
    if (distance <= ENEMY_RADIUS + BULLET_RADIUS) {
      target.health -= shot.damage;
      state.score += 20;
      continue;
    }
    shot.x += goDivide(dx * FRIENDLY_SHOT_SPEED, distance);
    shot.y += goDivide(dy * FRIENDLY_SHOT_SPEED, distance);
    kept.push(shot);
  }
  state.friendlyShots = kept;
};

const nearestEnemyId = (
  state: SimulationState,
  x: number,
  y: number,
): number => {
  let nearestId = 0;
  let nearestDistance = Number.MAX_SAFE_INTEGER;
  for (const enemy of state.enemies) {
    const distance = distanceSquared(x, y, enemy.x, enemy.y);
    if (enemy.health > 0 && distance < nearestDistance) {
      nearestId = enemy.id;
      nearestDistance = distance;
    }
  }
  return nearestId;
};

const enemyIndexById = (state: SimulationState, id: number): number =>
  state.enemies.findIndex((enemy) => enemy.id === id);

const damageArea = (
  state: SimulationState,
  center: ActionVec,
  radius: number,
  damage: number,
): void => {
  for (const enemy of state.enemies) {
    if (distanceSquared(center.x, center.y, enemy.x, enemy.y) <= radius ** 2) {
      enemy.health -= damage;
    }
  }
};

const clearProjectiles = (
  state: SimulationState,
  center: ActionVec,
  radius: number,
): void => {
  state.projectiles = state.projectiles.filter(
    (bullet) =>
      distanceSquared(center.x, center.y, bullet.x, bullet.y) > radius ** 2,
  );
};

export const insideSafeZone = (
  state: SimulationState,
  x: number,
  y: number,
): boolean =>
  state.safeZones.some(
    (zone) =>
      zone.expiresTick > state.tickValue &&
      distanceSquared(x, y, zone.position.x, zone.position.y) <= zone.radius ** 2,
  );
