import {
  PLAYER_RADIUS,
  PLAYER_Y,
  SHOOTER_WIDTH,
  clamp,
  goDivide,
  squaredDistance,
} from "@/features/shooter/constants";
import type { ShooterMutableState } from "@/features/shooter/types";
import { addPlayerProjectile, addShooterEffect } from "@/features/shooter/weapons";

export const earnRescue = (state: ShooterMutableState, amount: number): void => {
  if (amount <= 0) return;
  const adjusted = Math.max(
    1,
    goDivide(
      amount * (100 - state.config.special_charge_penalty_percent),
      100,
    ),
  );
  state.rescueCharge = Math.min(100, state.rescueCharge + adjusted);
};

const defaultBehavior: Record<string, string> = {
  nana7mi: "barrage_break",
  jiaran: "cheer_guard",
  xiangwan: "afterimage_replay",
  bella: "captain_parry",
  lulu: "subtitle_flip",
  xingtong: "prism_shift",
  nailu: "memory_bloom",
};

export const activateRescue = (state: ShooterMutableState): boolean => {
  if (state.rescueCharge < 100 || state.health <= 0) return false;
  state.rescueCharge = 0;
  state.rescuesUsed += 1;
  state.lastRescueTick = state.tick;
  let damage = state.runtime.rescueDamage;
  state.shield += state.runtime.guardOnSpecial;
  const behavior = state.config.kit.special_behavior || defaultBehavior[state.config.kit.id];
  if (behavior === "barrage_break") {
    damage += state.combo * 2;
    for (const enemy of state.enemies) {
      if (enemy.marks === 0) continue;
      const extra = enemy.marks * Math.max(4, goDivide(damage, 3));
      enemy.health -= extra;
      addShooterEffect(state, "mark_detonation", enemy.x, enemy.y, 24, extra);
      enemy.marks = 0;
    }
  } else if (behavior === "cheer_guard") state.shield += 8;
  else if (behavior === "afterimage_replay") {
    damage += goDivide(state.enemyProjectiles.length, 3);
    for (const offset of [-180, 0, 180]) {
      if (!addPlayerProjectile(state, { x: clamp(state.playerX + offset, PLAYER_RADIUS, SHOOTER_WIDTH - PLAYER_RADIUS), y: PLAYER_Y + 240, vy: -205, damage: Math.max(1, state.runtime.damage) })) break;
    }
    addShooterEffect(state, "afterimage_replay", state.playerX, PLAYER_Y, 36, damage);
  } else if (behavior === "captain_parry") {
    state.shield += 18;
    for (const vx of [-140, -70, 0, 70, 140]) {
      if (!addPlayerProjectile(state, { x: state.playerX, y: PLAYER_Y, vx, vy: -190, damage: Math.max(1, state.runtime.damage) })) break;
    }
    addShooterEffect(state, "captain_parry", state.playerX, PLAYER_Y, 24, state.shield);
  } else if (behavior === "subtitle_flip") {
    damage += goDivide(state.enemyProjectiles.length, 2);
    while (state.enemyProjectiles.length > 0 && state.playerProjectiles.length < state.config.limits.player_projectiles) {
      const bullet = state.enemyProjectiles.pop()!;
      addPlayerProjectile(state, { x: bullet.x, y: bullet.y, vy: -190, damage: Math.max(1, goDivide(state.runtime.damage, 2)), pierce: 1 });
    }
    addShooterEffect(state, "subtitle_flip", state.playerX, PLAYER_Y, 30, damage);
  } else if (behavior === "prism_shift") {
    damage += Math.max(4, state.runtime.damage);
    for (const enemy of state.enemies) if (Math.abs(enemy.x - state.playerX) <= 420) enemy.health -= damage;
    addShooterEffect(state, "prism_shift", state.playerX, 0, 30, damage);
  } else if (behavior === "memory_bloom") {
    const plants = [];
    let bloomed = 0;
    for (const effect of state.effects) {
      if (effect.kind !== "memory_plant") {
        plants.push(effect);
        continue;
      }
      bloomed += 1;
      for (const enemy of state.enemies) {
        if (squaredDistance(enemy.x, enemy.y, effect.x, effect.y) <= 720 ** 2) enemy.health -= Math.max(4, effect.power * 2);
      }
    }
    state.effects = plants;
    if (bloomed > 0) {
      state.health = Math.min(state.runtime.maxHealth, state.health + 1);
      state.shield += bloomed;
    }
    addShooterEffect(state, "memory_bloom", state.playerX, PLAYER_Y, 45, bloomed);
  }
  for (const enemy of state.enemies) enemy.health -= damage;
  state.enemyProjectiles = [];
  state.combo += 3;
  state.comboClock = 120 + state.runtime.comboExtend;
  state.score += 250;
  return true;
};
