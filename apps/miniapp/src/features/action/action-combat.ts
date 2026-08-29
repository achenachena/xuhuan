import {
  currentEnemyAttack,
  enemyMovement,
  enemyTraitAmount,
  findEnemyTrait,
  hasEnemyTrait,
} from "@/features/action/action-enemy-behaviors";
import {
  clamp,
  distanceSquared,
  goDivide,
  integerSqrt,
} from "@/features/action/action-math";
import {
  damagePlayer,
  fireEnemyAttack,
} from "@/features/action/action-projectiles";
import {
  ENEMY_RADIUS,
  PLAYER_RADIUS,
  type SimulationState,
} from "@/features/action/action-simulation-state";
import { resolveDefeatedEnemies } from "@/features/action/action-spawning";
import {
  ACTION_HEIGHT,
  ACTION_MAX_PROJECTILES,
  ACTION_WIDTH,
} from "@/features/action/action-types";

const intentWindow = (state: SimulationState): number =>
  Math.max(8, 15 - state.config.noiseLevel * 2);

export const updateEnemies = (state: SimulationState): void => {
  for (const enemy of state.enemies) {
    if (enemy.health <= 0) continue;
    const spec = state.config.enemies[enemy.specIndex]!;
    let dx = state.playerX - enemy.x;
    let dy = state.playerY - enemy.y;
    let distance = Math.max(1, integerSqrt(dx * dx + dy * dy));
    const attack = currentEnemyAttack(
      spec,
      enemy.attackIndex,
      enemy.health,
      enemy.maxHealth,
      state.config.bossVariant,
    );
    const interval = Math.max(
      20,
      attack.interval - state.config.noiseLevel * 3,
    );
    const telegraphWindow = Math.max(intentWindow(state), attack.telegraphTicks);
    const telegraphing =
      attack.interval > 0 && interval - enemy.fireClock <= telegraphWindow;
    const motion = enemyMovement({
      enemy: spec,
      id: enemy.id,
      tick: state.tickValue,
      dx,
      dy,
      distance,
      telegraphing,
    });
    enemy.x = clamp(
      enemy.x + motion.x,
      ENEMY_RADIUS,
      ACTION_WIDTH - ENEMY_RADIUS,
    );
    enemy.y = clamp(
      enemy.y + motion.y,
      700,
      ACTION_HEIGHT - ENEMY_RADIUS,
    );
    const teleportEvery = enemyTraitAmount(spec, "teleport");
    if (
      teleportEvery > 0 &&
      state.tickValue % teleportEvery === enemy.id % teleportEvery
    ) {
      enemy.x = 400 + state.random.int(ACTION_WIDTH - 800);
      enemy.y = 850 + state.random.int(2500);
      dx = state.playerX - enemy.x;
      dy = state.playerY - enemy.y;
      distance = Math.max(1, integerSqrt(dx * dx + dy * dy));
    }
    if (
      distance < PLAYER_RADIUS + ENEMY_RADIUS &&
      state.invulnerable === 0
    ) {
      damagePlayer(state, Math.max(1, spec.contactDamage));
      state.invulnerable = 18;
      if (hasEnemyTrait(spec, "steal_signal") && state.weave.length > 0) {
        state.weave.pop();
        if (state.signalWaypoints.length > state.weave.length) {
          state.signalWaypoints = state.signalWaypoints.slice(
            0,
            state.weave.length,
          );
        }
        state.routeStep = state.weave.length;
        state.protocol = "";
        state.routeReady = false;
      }
    }
    if (
      hasEnemyTrait(spec, "distortion_aura") &&
      distance < 900 &&
      state.tickValue % 30 === 0
    ) {
      state.distortion = Math.min(99, state.distortion + 2);
    }
    enemy.fireClock += 1;
    if (
      attack.interval > 0 &&
      enemy.fireClock >= interval &&
      state.projectiles.length < ACTION_MAX_PROJECTILES
    ) {
      enemy.fireClock = 0;
      fireEnemyAttack(
        state,
        enemy,
        spec,
        attack,
        dx,
        dy,
        distance,
        interval,
      );
      enemy.attackIndex += 1;
    }
  }
  resolveDefeatedEnemies(state);
};

export const autoAttack = (state: SimulationState): void => {
  state.attackClock += 1;
  const effectiveInterval = Math.max(
    4,
    goDivide(
      state.config.runtime.attackInterval * 100,
      Math.max(1, state.config.runtime.projectileSpeed),
    ),
  );
  if (state.attackClock < effectiveInterval) return;
  state.attackClock = 0;
  let damage = state.config.runtime.attackDamage;
  if (state.distortion >= 60) {
    damage += goDivide(
      damage * Math.max(25, state.config.runtime.overloadBonus),
      100,
    );
  }
  let targetCount = Math.max(
    1,
    state.config.runtime.projectileCount +
      state.config.runtime.projectilePierce,
  );
  if (state.config.runtime.passive === "xingtong_signal_stance") {
    if (state.lastSignal === "surge") {
      damage += Math.max(1, goDivide(damage, 4));
    } else if (state.lastSignal === "echo") {
      targetCount += 1;
    }
  }
  const selected = new Array<boolean>(state.enemies.length).fill(false);
  let primary = -1;
  for (let shot = 0; shot < targetCount; shot += 1) {
    let nearest = -1;
    let nearestDistance = Number.MAX_SAFE_INTEGER;
    for (let index = 0; index < state.enemies.length; index += 1) {
      const enemy = state.enemies[index]!;
      const distance = distanceSquared(
        state.playerX,
        state.playerY,
        enemy.x,
        enemy.y,
      );
      if (
        enemy.health > 0 &&
        !selected[index] &&
        distance < nearestDistance
      ) {
        nearest = index;
        nearestDistance = distance;
      }
    }
    if (nearest < 0) break;
    selected[nearest] = true;
    if (primary < 0) primary = nearest;
    let shotDamage = damage;
    if (shot >= Math.max(1, state.config.runtime.projectileCount)) {
      shotDamage = Math.max(1, goDivide(damage * 70, 100));
    }
    const target = state.enemies[nearest]!;
    const spec = state.config.enemies[target.specIndex]!;
    const armor = enemyTraitAmount(spec, "armored");
    if (armor > 0) {
      shotDamage -= Math.min(
        armor,
        Math.max(1, goDivide(shotDamage, 3)),
      );
    }
    const link = findEnemyTrait(spec, "linked_shield");
    if (link) {
      const linked = state.enemies.some(
        (enemy, index) =>
          index !== nearest &&
          enemy.health > 0 &&
          state.config.enemies[enemy.specIndex]!.slug === link.value,
      );
      if (linked) {
        const mitigation = clamp(100 - link.amount * 10, 50, 90);
        shotDamage = Math.max(1, goDivide(shotDamage * mitigation, 100));
      }
    }
    target.health -= shotDamage;
  }
  if (primary < 0) return;
  state.autoAttacks += 1;
  if (
    state.config.runtime.passive === "xingtong_signal_stance" &&
    state.lastSignal === "guard" &&
    state.autoAttacks % 3 === 0
  ) {
    state.shield += 1;
  }
  if (
    state.config.runtime.passive === "diana_cheer_pulse" &&
    state.autoAttacks % 3 === 0
  ) {
    const center = state.enemies[primary]!;
    state.enemies.forEach((enemy, index) => {
      if (
        index !== primary &&
        distanceSquared(center.x, center.y, enemy.x, enemy.y) < 900 ** 2
      ) {
        enemy.health -= Math.max(1, goDivide(damage, 2));
      }
    });
  }
};
