import {
	insideSafeZone,
	onGraze,
} from "@/features/action/action-kit-effects";
import {
  ACTION_DIRECTIONS,
  clamp,
  distanceSquared,
  goDivide,
} from "@/features/action/action-math";
import {
  BULLET_RADIUS,
  ENEMY_RADIUS,
  PLAYER_RADIUS,
  type EnemyEntity,
  type ProjectileEntity,
  type SimulationState,
} from "@/features/action/action-simulation-state";
import type {
  ActionAttackSpec,
  ActionEnemySpec,
} from "@/features/action/action-types";
import {
  ACTION_HEIGHT,
  ACTION_MAX_PROJECTILES,
  ACTION_WIDTH,
} from "@/features/action/action-types";

const fireProjectileVelocity = (
  state: SimulationState,
  enemy: EnemyEntity,
  spec: ActionEnemySpec,
  vx: number,
  vy: number,
): void => {
  if (state.projectiles.length >= ACTION_MAX_PROJECTILES) return;
  state.nextBulletId += 1;
  state.projectiles.push({
    id: state.nextBulletId,
    x: enemy.x,
    y: enemy.y,
    vx,
    vy,
    damage: Math.max(1, spec.projectileDamage),
    pattern: spec.pattern,
    grazed: false,
    glitchMarked: false,
    delay: 0,
  });
};

const fireProjectile = (
  state: SimulationState,
  enemy: EnemyEntity,
  spec: ActionEnemySpec,
  dx: number,
  dy: number,
  distance: number,
): void => {
  const speed = Math.max(12, spec.projectileSpeed);
  fireProjectileVelocity(
    state,
    enemy,
    spec,
    goDivide(dx * speed, distance),
    goDivide(dy * speed, distance),
  );
};

export const fireEnemyAttack = (
  state: SimulationState,
  enemy: EnemyEntity,
  original: ActionEnemySpec,
  attack: ActionAttackSpec,
  dx: number,
  dy: number,
  distance: number,
  interval: number,
): void => {
  const spec: ActionEnemySpec = {
    ...original,
    fireInterval:
      attack.interval > 0 ? attack.interval : original.fireInterval,
    projectileSpeed:
      attack.projectileSpeed > 0
        ? attack.projectileSpeed
        : original.projectileSpeed,
    projectileDamage:
      attack.damage > 0 ? attack.damage : original.projectileDamage,
  };
  let kind = attack.kind;
  if (!kind) {
    if (spec.pattern === "mine") kind = "mine";
    else if (spec.pattern === "orbiter") kind = "spiral";
    else if (spec.pattern === "sweeper" || spec.pattern === "sniper") {
      kind = "fan";
    } else if (spec.pattern === "charger") kind = "beam";
    else kind = "aimed";
  }
	if (kind === "ring" || kind === "mine") {
    const speed = Math.max(12, spec.projectileSpeed);
    const count = attack.count > 0 ? attack.count : 8;
    const step = Math.max(1, goDivide(16, count));
    for (let index = 0; index < 16; index += step) {
      const vector = ACTION_DIRECTIONS[index]!;
      fireProjectileVelocity(
        state,
        enemy,
        spec,
        goDivide(vector.x * speed, 1000),
        goDivide(vector.y * speed, 1000),
      );
    }
    return;
  }
  if (kind === "spiral") {
    const speed = Math.max(12, spec.projectileSpeed);
    const start = (goDivide(state.tickValue, interval) * 2) & 15;
    const count = attack.count > 0 ? attack.count : 4;
    const step = Math.max(1, goDivide(16, count));
    for (let index = 0; index < 16; index += step) {
      const vector = ACTION_DIRECTIONS[(start + index) & 15]!;
      fireProjectileVelocity(
        state,
        enemy,
        spec,
        goDivide(vector.x * speed, 1000),
        goDivide(vector.y * speed, 1000),
      );
    }
    return;
  }
  if (kind === "beam") {
    enemy.x = clamp(
      enemy.x + goDivide(dx * 860, distance),
      ENEMY_RADIUS,
      ACTION_WIDTH - ENEMY_RADIUS,
    );
    enemy.y = clamp(
      enemy.y + goDivide(dy * 860, distance),
      700,
      ACTION_HEIGHT - ENEMY_RADIUS,
    );
    return;
  }
  if (kind === "fan") {
    const speed = Math.max(12, spec.projectileSpeed);
    const vx = goDivide(dx * speed, distance);
    const vy = goDivide(dy * speed, distance);
    const spread = attack.spread > 0 ? attack.spread : 4;
    fireProjectileVelocity(state, enemy, spec, vx, vy);
    fireProjectileVelocity(
      state,
      enemy,
      spec,
      goDivide(vx * 10 - vy * spread, 10),
      goDivide(vy * 10 + vx * spread, 10),
    );
    fireProjectileVelocity(
      state,
      enemy,
      spec,
      goDivide(vx * 10 + vy * spread, 10),
      goDivide(vy * 10 - vx * spread, 10),
    );
    return;
  }
  if (kind === "delayed_echo") {
    fireProjectile(state, enemy, spec, dx, dy, distance);
    const before = state.projectiles.length;
    const speed = Math.max(12, spec.projectileSpeed);
    fireProjectileVelocity(
      state,
      enemy,
      spec,
      goDivide(dx * speed, distance),
      goDivide(dy * speed, distance),
    );
    if (state.projectiles.length > before) {
      state.projectiles[state.projectiles.length - 1]!.delay = Math.max(
        12,
        attack.telegraphTicks,
      );
    }
    return;
  }
  fireProjectile(state, enemy, spec, dx, dy, distance);
};

export const updateHazards = (state: SimulationState): void => {
  if (!state.config.hazards.includes("crossfire")) return;
  const interval = Math.max(90, 150 - state.config.noiseLevel * 10);
  if (
    state.tickValue % interval !== 0 ||
    state.projectiles.length + 2 > ACTION_MAX_PROJECTILES
  ) {
    return;
  }
  const y = 1100 + state.random.int(3600);
  const speed = 24 + state.config.noiseLevel * 2;
  const damage = 3 + state.config.noiseLevel;
  for (const shot of [
    { x: 80, vx: speed },
    { x: ACTION_WIDTH - 80, vx: -speed },
  ]) {
    state.nextBulletId += 1;
    state.projectiles.push({
      id: state.nextBulletId,
      x: shot.x,
      y,
      vx: shot.vx,
      vy: 0,
      damage,
      pattern: "crossfire",
      grazed: false,
      glitchMarked: false,
      delay: 0,
    });
  }
};

export const damagePlayer = (
  state: SimulationState,
  amount: number,
): void => {
  let remaining = amount;
  if (state.shield > 0) {
    const absorbed = Math.min(state.shield, remaining);
    state.shield -= absorbed;
    remaining -= absorbed;
    if (absorbed > 0 && state.config.runtime.reflectDamage > 0) {
      for (const enemy of state.enemies) {
        if (
          distanceSquared(
            state.playerX,
            state.playerY,
            enemy.x,
            enemy.y,
          ) <
          800 ** 2
        ) {
          enemy.health -= state.config.runtime.reflectDamage;
        }
      }
    }
  }
  if (remaining > 0) state.health -= remaining;
};

export const updateProjectiles = (state: SimulationState): void => {
  const kept: ProjectileEntity[] = [];
  for (const source of state.projectiles) {
    const bullet = { ...source };
    if (insideSafeZone(state, bullet.x, bullet.y)) continue;
    if (bullet.delay > 0) {
      bullet.delay -= 1;
      kept.push(bullet);
      continue;
    }
    bullet.x += bullet.vx;
    bullet.y += bullet.vy;
    if (
      bullet.x < -100 ||
      bullet.x > ACTION_WIDTH + 100 ||
      bullet.y < 500 ||
      bullet.y > ACTION_HEIGHT + 100
    ) {
      continue;
    }
    if (insideSafeZone(state, bullet.x, bullet.y)) continue;
    const distance = distanceSquared(
      state.playerX,
      state.playerY,
      bullet.x,
      bullet.y,
    );
    if (distance <= (PLAYER_RADIUS + BULLET_RADIUS) ** 2) {
      if (state.invulnerable === 0) {
        damagePlayer(state, bullet.damage);
        state.invulnerable = 10;
      }
      continue;
    }
    if (!bullet.grazed && distance <= state.config.runtime.grazeRadius ** 2) {
      bullet.grazed = true;
      if (state.config.runtime.passive === "lulu_convert_projectiles") {
        bullet.glitchMarked = true;
      }
      state.lastGraze = state.tickValue;
      state.distortion +=
        state.config.runtime.distortionGain + state.config.noiseLevel;
      onGraze(state);
      if (state.distortion >= 100) {
        damagePlayer(state, 12);
        state.distortion = Math.min(55, 40 + state.config.noiseLevel * 5);
        state.projectiles = [];
        return;
      }
    }
    kept.push(bullet);
  }
  state.projectiles = kept;
};
