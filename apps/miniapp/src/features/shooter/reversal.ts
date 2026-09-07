import { PLAYER_Y, SHOOTER_WIDTH, clamp } from "@/features/shooter/constants";
import { addEnemyHazard } from "@/features/shooter/enemies";
import { addPlayerProjectile, addShooterEffect } from "@/features/shooter/weapons";
import type { ReversalRole, ShooterEnemyEntity, ShooterMutableState, ShooterProjectileEntity, ShooterThreatSnapshot } from "@/features/shooter/types";

/** Opt-in demo choreography. Campaign content continues to use its authored rules. */
export const reversalHitbox = (enemy: Pick<ShooterEnemyEntity, "role">) => {
  if (enemy.role === "boss") return { width: 720, height: 740, core_width: 230, core_height: 180, core_offset_y: 180 };
  if (enemy.role === "controller" || enemy.role === "arm") return { width: 500, height: 420, core_width: 180, core_height: 160, core_offset_y: enemy.role === "arm" ? 80 : 0 };
  return { width: 380, height: 160, core_width: 0, core_height: 0, core_offset_y: 0 };
};

const spawn = (state: ShooterMutableState, role: ReversalRole, groupID: number, x: number, health: number): void => {
  if (state.enemies.length >= state.config.limits.enemies) return;
  state.enemies.push({
    id: ++state.nextEnemyID, specIndex: 0, x: clamp(x, 300, SHOOTER_WIDTH - 300), y: 260,
    health, maxHealth: health, fireClock: role === "escort" ? 95 : 0, age: 0, phase: 0, warning: 0,
    volley: 0, marks: 0, boss: false, groupID, role, exposed: false,
    disabledTicks: 0, coreHealth: 32, anchorX: x,
  });
};

export const spawnReversalGroups = (state: ShooterMutableState): void => {
  for (const group of state.config.reversal?.groups ?? []) {
    if (group.at_tick !== state.tick - 1) continue;
    const learning = group.at_tick < 240;
    spawn(state, learning ? "escort" : "controller", group.group_id, group.x, learning ? 24 : 100);
    if (learning) {
      const target = state.enemies.at(-1);
      if (target?.groupID === group.group_id) target.fireClock = -10_000;
    }
    for (let index = 0; index < group.escorts; index += 1) {
      spawn(state, "escort", group.group_id, group.x + (index % 2 ? 520 : -520), 24);
    }
  }
};

/** The tell and the projectile use the same muzzle and velocity. */
const reversalVolley = (enemy: ShooterEnemyEntity) => {
  const y = enemy.y + 180;
  if (enemy.boss && enemy.phase === 1) {
    return [{ kind: "reversal_cut", x: enemy.x + (enemy.volley % 2 ? 500 : -500), y, vx: 0, vy: 95, width: 1_050 }];
  }
  if (enemy.boss && enemy.phase === 2) {
    const vx = Math.trunc(((enemy.aimX ?? enemy.x) - enemy.x) * 110 / (PLAYER_Y - y));
    return [-90, 0, 90].map((offset) => ({ kind: "reversal_echo", x: enemy.x + offset, y, vx, vy: 110, width: 0 }));
  }
  const fan = enemy.role === "escort" ? [0] : enemy.boss ? [-45, 0, 45] : [-35, 0, 35];
  return fan.map((vx) => ({ kind: "reversal_shard", x: enemy.x, y, vx, vy: 110, width: 0 }));
};

const fire = (state: ShooterMutableState, enemy: ShooterEnemyEntity): void => {
  for (const shot of reversalVolley(enemy)) {
    addEnemyHazard(state, shot.kind, shot.x, shot.y, shot.vx, shot.vy,
      1, shot.width ? 42 : 46, shot.width, 0, enemy.groupID);
  }
};

export const updateReversalEnemy = (state: ShooterMutableState, enemy: ShooterEnemyEntity): boolean => {
  if (!state.config.reversal || !enemy.role || enemy.boss) return false;
  if ((enemy.disabledTicks ?? 0) > 0) {
    enemy.disabledTicks! -= 1;
    enemy.exposed = false;
    return true;
  }
  if (enemy.y < (enemy.role === "escort" ? 1_600 : 1_150)) enemy.y += 28;
  enemy.fireClock += 1;
  if (enemy.role === "escort") {
    if (enemy.fireClock >= 125) {
      fire(state, enemy);
      enemy.fireClock = 0;
    }
    return true;
  }
  // Opening the hatch is the tell, not a separate immunity rule.
  enemy.exposed = enemy.fireClock >= 30 && enemy.fireClock < 90;
  if (enemy.fireClock >= 90) {
    fire(state, enemy);
    enemy.fireClock = -45;
    enemy.exposed = false;
    enemy.volley += 1;
  }
  return true;
};

export const updateReversalBoss = (state: ShooterMutableState, boss: ShooterEnemyEntity): void => {
  boss.role = "boss";
  boss.groupID = 1_000;
  boss.coreHealth ??= 44;
  const phase = boss.health * 3 > boss.maxHealth * 2 ? 1 : boss.health * 3 > boss.maxHealth ? 2 : 3;
  if (boss.phase !== phase) {
    boss.phase = phase;
    boss.fireClock = 0;
    state.bossPhaseTick = state.tick;
    addShooterEffect(state, "boss_warning", boss.x, boss.y, 24, phase);
    if (phase === 3) {
      spawn(state, "arm", 1_001, 650, 100);
      spawn(state, "arm", 1_002, 2_950, 100);
    }
  }
  if ((boss.disabledTicks ?? 0) > 0) {
    boss.disabledTicks! -= 1;
    boss.exposed = true;
    if (boss.disabledTicks === 0) {
      boss.coreHealth = 44;
      boss.broken = false;
      boss.fireClock = 0;
      boss.exposed = false;
    }
    return;
  }
  boss.fireClock += 1;
  const clock = boss.fireClock;
  const interval = phase === 1 ? 150 : phase === 2 ? 135 : 120;
  const attackAt = 75;
  boss.exposed = clock >= attackAt && clock < attackAt + 60;
  // Stay still throughout telegraph and exposure so aiming is rewarding.
  if (clock < 30) {
    const target = phase === 2 ? (boss.volley % 2 ? 2_300 : 1_300) : 1_800;
    boss.x += clamp(target - boss.x, -14, 14);
  }
  if (clock === 30) boss.aimX = state.playerX;
  if (clock === attackAt) {
    fire(state, boss);
    boss.volley += 1;
  }
  if (clock >= interval) boss.fireClock = 0;
};

export const reversalThreats = (state: ShooterMutableState): ShooterThreatSnapshot[] => {
  const threats: ShooterThreatSnapshot[] = [];
  for (const enemy of state.enemies) {
    if (!enemy.role || enemy.health <= 0 || (enemy.disabledTicks ?? 0) > 0) continue;
    const fireAt = enemy.boss ? 75 : enemy.role === "escort" ? 125 : 90;
    const remaining = fireAt - enemy.fireClock;
    if (remaining <= 0 || remaining > (enemy.role === "escort" ? 20 : 45)) continue;
    for (const shot of reversalVolley(enemy)) {
      const travelTicks = (PLAYER_Y - shot.y) / shot.vy;
      threats.push({ source_id: enemy.id, kind: shot.kind === "reversal_cut" ? "reversal_cut" : "reversal_aim",
        ticks_remaining: remaining, origin: { x: shot.x, y: shot.y },
        target: { x: shot.x + shot.vx * travelTicks, y: PLAYER_Y },
        width: shot.width || 92,
      });
    }
  }
  return threats;
};

export const breakReversalCore = (state: ShooterMutableState, enemy: ShooterEnemyEntity): void => {
  if (!state.reversal || enemy.broken || enemy.groupID === undefined || enemy.role === "escort") return;
  enemy.broken = true;
  state.reversal.breaks += 1;
  const converted = state.enemyProjectiles.filter((bullet) => bullet.groupID === enemy.groupID);
  // Remove hostile entities immediately; the flip is purely a harmless effect.
  state.enemyProjectiles = state.enemyProjectiles.filter((bullet) => bullet.groupID !== enemy.groupID);
  for (const member of state.enemies) {
    if (member.groupID === enemy.groupID) member.disabledTicks = 75;
  }
  const count = Math.min(6, Math.max(2, converted.length), state.config.limits.pickups - state.pickups.length);
  for (let index = 0; index < count; index += 1) {
    const bullet = converted[Math.floor(index * converted.length / count)];
    const x = clamp(bullet?.x ?? enemy.x + (index * 2 - count + 1) * 90, 180, SHOOTER_WIDTH - 180);
    const y = clamp(bullet?.y ?? enemy.y + 180, 400, PLAYER_Y - 300);
    state.pickups.push({ id: ++state.nextPickupID, x, y, kind: "support", value: 12 });
    addShooterEffect(state, "reversal_flip", x, y, 18, 1);
  }
  // Reserve feedback for the major beat rather than letting old mark decorations hide it.
  state.effects = state.effects.filter((effect) => effect.kind !== "route_mark");
  if (state.effects.length >= state.config.limits.effects) state.effects.shift();
  addShooterEffect(state, "core_break", enemy.x, enemy.y, 24, state.reversal.breaks);
  if (enemy.role === "arm") {
    const boss = state.enemies.find((candidate) => candidate.boss && candidate.health > 0);
    if (boss) { boss.disabledTicks = 60; boss.exposed = true; boss.health -= 50; }
  }
};

export const updateReversalWeapons = (state: ShooterMutableState): void => {
  const mode = state.config.reversal!.weapon;
  const powered = state.pickupPower === "support" && state.pickupPowerTicks > 0;
  state.attackClock += 1;
  if (state.attackClock < state.runtime.fireInterval) return;
  state.attackClock = 0;
  state.attackSequence += 1;
  const count = mode === "pierce" ? 1 : (mode === "twin" ? 2 : 1) + Number(powered);
  for (let index = 0; index < count; index += 1) {
    addPlayerProjectile(state, { x: state.playerX + (index * 2 - count + 1) * 80,
      y: PLAYER_Y - 110, vy: -390,
      damage: mode === "pierce" ? Math.ceil(state.runtime.damage * 1.75) : state.runtime.damage,
      pierce: mode === "pierce" ? 14 : 0,
      kind: mode === "pierce" ? powered ? "reversal_pierce_wide" : "reversal_pierce" : "reversal_shot",
      radius: mode === "pierce" ? powered ? 100 : 45 : 24,
    });
  }
};

/** First intersection parameter for a swept shot and an axis-aligned body. */
export const sweptReversalHit = (fromX: number, fromY: number, toX: number, toY: number,
  x: number, y: number, halfWidth: number, halfHeight: number): number | null => {
  let near = 0, far = 1;
  for (const [start, delta, center, extent] of [
    [fromX, toX - fromX, x, halfWidth], [fromY, toY - fromY, y, halfHeight],
  ]) {
    if (delta === 0) { if (Math.abs(start! - center!) > extent!) return null; continue; }
    const a = (center! - extent! - start!) / delta!, b = (center! + extent! - start!) / delta!;
    near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
    if (near > far) return null;
  }
  return near;
};

const hitEnemy = (state: ShooterMutableState, enemy: ShooterEnemyEntity, shot: ShooterProjectileEntity, fromX: number, fromY: number): void => {
  const body = reversalHitbox(enemy);
  const core = enemy.exposed && body.core_width > 0 && sweptReversalHit(
    fromX, fromY, shot.x, shot.y, enemy.x, enemy.y + body.core_offset_y,
    body.core_width / 2 + shot.radius, body.core_height / 2 + shot.radius,
  ) !== null;
  const damage = Math.max(1, shot.damage * (core ? 2 : 1));
  enemy.health -= damage;
  enemy.marks = Math.min(3, enemy.marks + 1);
  if (core) {
    enemy.coreHealth = (enemy.coreHealth ?? 32) - damage;
    if (enemy.coreHealth <= 0 && !enemy.broken) {
      if (!enemy.boss) enemy.health = 0;
      breakReversalCore(state, enemy);
    }
  }
  addShooterEffect(state, core ? "core_hit" : "reversal_hit", shot.x, enemy.y + body.height / 2, 8, damage);
  if (enemy.health <= 0) breakReversalCore(state, enemy);
};

export const updateReversalPlayerProjectiles = (state: ShooterMutableState): void => {
  const kept: ShooterProjectileEntity[] = [];
  for (const shot of state.playerProjectiles) {
    const oldX = shot.x, oldY = shot.y;
    shot.x += shot.vx; shot.y += shot.vy;
    const hits = state.enemies.flatMap((enemy) => {
      if (enemy.health <= 0 || shot.hitEnemyIDs?.includes(enemy.id)) return [];
      const body = reversalHitbox(enemy);
      const time = sweptReversalHit(oldX, oldY, shot.x, shot.y, enemy.x, enemy.y,
        body.width / 2 + shot.radius, body.height / 2 + shot.radius);
      return time === null ? [] : [{ enemy, time }];
    }).sort((left, right) => left.time - right.time || left.enemy.id - right.enemy.id);
    let consumed = false;
    for (const { enemy } of hits) {
      if (enemy.health <= 0) continue;
      hitEnemy(state, enemy, shot, oldX, oldY);
      (shot.hitEnemyIDs ??= []).push(enemy.id);
      if (shot.pierce <= 0) { consumed = true; break; }
      shot.pierce -= 1;
    }
    if (!consumed && shot.y >= -150 && shot.x >= -150 && shot.x <= SHOOTER_WIDTH + 150) kept.push(shot);
  }
  state.playerProjectiles = kept;
  if (state.enemies.some((enemy) => enemy.boss && enemy.health <= 0)) state.enemyProjectiles = [];
};

export const activateReversalRescue = (state: ShooterMutableState): void => {
  state.enemyProjectiles = [];
  state.shield = Math.min(1, state.shield + state.runtime.guardOnSpecial);
  state.invulnerableTicks = Math.max(state.invulnerableTicks, 24);
  const marked = state.enemies.filter((enemy) => enemy.health > 0 && enemy.marks > 0);
  for (const enemy of state.enemies) {
    if (enemy.marks === 0) enemy.health -= state.runtime.rescueDamage;
  }
  state.reversal!.chain = marked.map((enemy, index) => ({ enemyID: enemy.id,
    tick: state.tick + 1 + Math.floor(index * 16 / Math.max(1, marked.length)),
    damage: state.runtime.rescueDamage + enemy.marks * 12,
  }));
  addShooterEffect(state, "chain_launch", state.playerX, PLAYER_Y, 18, marked.length);
  state.combo += 3; state.comboClock = 120; state.score += 250;
};

export const updateReversalChain = (state: ShooterMutableState): void => {
  if (!state.reversal) return;
  state.reversal.chain = state.reversal.chain.filter((entry) => {
    if (entry.tick > state.tick) return true;
    const enemy = state.enemies.find((candidate) => candidate.id === entry.enemyID && candidate.health > 0);
    if (enemy) {
      enemy.health -= entry.damage; enemy.marks = 0;
      addShooterEffect(state, "chain_blast", enemy.x, enemy.y, 15, entry.damage);
      if (enemy.health <= 0) breakReversalCore(state, enemy);
    }
    return false;
  });
};
