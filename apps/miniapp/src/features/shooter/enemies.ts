import {
  ENEMY_PROJECTILE_RADIUS,
  ENEMY_RADIUS,
  PLAYER_GRAZE_RADIUS,
  PLAYER_RADIUS,
  PLAYER_Y,
  SHOOTER_HEIGHT,
  SHOOTER_WIDTH,
  clamp,
  goDivide,
  integerSqrt,
  squaredDistance,
} from "@/features/shooter/constants";
import type {
  ShooterEnemyEntity,
  ShooterMutableState,
  ShooterThreatSnapshot,
} from "@/features/shooter/types";
import type { ShooterEnemySpec } from "@/lib/api/types";
import { shooterSeedFromString } from "@/features/shooter/random";
import { earnRescue } from "@/features/shooter/specials";
import { storyChoiceMode } from "@/features/shooter/story";
import { addShooterEffect, addPlayerProjectile } from "@/features/shooter/weapons";

export const hasTrait = (
  spec: ShooterEnemySpec,
  trait: ShooterEnemySpec["traits"][number],
): boolean =>
  spec.traits.includes(trait);

const structuredHazardFamily = (kind: string): string => {
  if (kind === "caption_block") return "caption";
  if (kind === "black_wall") return "wall";
  if (kind === "horizontal_cut" || kind === "highlight_cut") return "cut";
  if (
    [
      "censor_bar",
      "censor_bar_fast",
      "boss_lane",
      "audit_bar",
      "finale_lane",
      "special_frame",
      "encore_frame",
      "choice_frame",
    ].includes(kind)
  ) {
    return "frame";
  }
  return kind;
};

const structuredHazardLimit = (kind: string): number => {
  const family = structuredHazardFamily(kind);
  if (family === "caption") return 3;
  if (family === "wall" || family === "cut") return 2;
  if (family === "frame") return 4;
  return 0;
};

export const addEnemyHazard = (
  state: ShooterMutableState,
  kind: string,
  x: number,
  y: number,
  vx: number,
  vy: number,
  damage: number,
  radius: number,
  width: number,
  health: number,
): void => {
  if (state.enemyProjectiles.length >= state.config.limits.enemy_projectiles) return;
  const limit = structuredHazardLimit(kind);
  if (
    limit > 0 &&
    state.enemyProjectiles.filter(
      (projectile) =>
        structuredHazardFamily(projectile.kind) ===
        structuredHazardFamily(kind),
    ).length >= limit
  ) {
    return;
  }
  state.nextProjectileID += 1;
  state.enemyProjectiles.push({
    id: state.nextProjectileID,
    x,
    y,
    vx,
    vy,
    damage,
    pierce: 0,
    radius: Math.max(1, radius),
    width: Math.max(0, width),
    health: Math.max(0, health),
    kind,
    hostile: true,
    grazed: false,
  });
};

export const addEnemyBullet = (
  state: ShooterMutableState,
  x: number,
  y: number,
  vx: number,
  vy: number,
  damage: number,
): void =>
  addEnemyHazard(
    state,
    "enemy_shot",
    x,
    y,
    vx,
    vy,
    damage,
    ENEMY_PROJECTILE_RADIUS,
    0,
    0,
  );

export const encoreInterval = (
  base: number,
  level: number,
  minimum: number,
): number =>
  Math.max(minimum, level >= 1 ? goDivide(base * 9, 10) : base);

export const moveEnemy = (
  state: ShooterMutableState,
  enemy: ShooterEnemyEntity,
  spec: ShooterEnemySpec,
): void => {
  if (spec.chassis === "spam-bot") {
    enemy.y += Math.max(4, goDivide(spec.speed, 3));
    return;
  }
  if (spec.chassis === "clip-cutter") {
    if (enemy.y < 1_250) enemy.y += Math.max(5, goDivide(spec.speed, 3));
    const direction = (goDivide(enemy.age, 45) + enemy.id) & 1 ? -1 : 1;
    enemy.x = clamp(
      enemy.x + direction * Math.max(5, spec.speed),
      ENEMY_RADIUS,
      SHOOTER_WIDTH - ENEMY_RADIUS,
    );
    return;
  }
  if (spec.chassis === "caption-blob") {
    if (enemy.y < 1_500) enemy.y += Math.max(3, goDivide(spec.speed, 4));
    const direction = enemy.id & 1 ? -1 : 1;
    enemy.x = clamp(
      enemy.x + direction * Math.max(3, goDivide(spec.speed, 3)),
      ENEMY_RADIUS,
      SHOOTER_WIDTH - ENEMY_RADIUS,
    );
    return;
  }
  if (spec.chassis === "black-screen-ghost") {
    const target = SHOOTER_WIDTH - state.playerX;
    enemy.x = clamp(
      enemy.x + clamp(target - enemy.x, -spec.speed, spec.speed),
      ENEMY_RADIUS,
      SHOOTER_WIDTH - ENEMY_RADIUS,
    );
    if (enemy.y < 1_350) enemy.y += Math.max(4, goDivide(spec.speed, 3));
    return;
  }
  if (spec.chassis === "gift-thief") {
    if (enemy.age < 35) enemy.y += Math.max(8, goDivide(spec.speed, 3));
    else if (enemy.age < 120) {
      const direction = enemy.id & 1 ? -1 : 1;
      enemy.x = clamp(
        enemy.x + direction * Math.max(5, goDivide(spec.speed, 2)),
        ENEMY_RADIUS,
        SHOOTER_WIDTH - ENEMY_RADIUS,
      );
    } else enemy.y -= Math.max(14, goDivide(spec.speed, 2));
    return;
  }
  if (spec.chassis === "censor-frame") {
    if (enemy.y < 1_150) enemy.y += Math.max(2, goDivide(spec.speed, 4));
    return;
  }
  const defaults: Record<ShooterEnemySpec["chassis"], string> = {
    "spam-bot": "drift",
    "clip-cutter": "sweep",
    "caption-blob": "orbit",
    "black-screen-ghost": "dive",
    "gift-thief": "mirror",
    "censor-frame": "anchor",
  };
  const pattern = spec.move_pattern || defaults[spec.chassis];
  if (pattern === "drift") {
    const direction = (goDivide(enemy.age, 45) + enemy.id) & 1 ? -1 : 1;
    enemy.x += direction * Math.max(4, goDivide(spec.speed, 2));
    enemy.y += Math.max(3, goDivide(spec.speed, 3));
  } else if (pattern === "sweep") {
    if (enemy.y < 1_450) enemy.y += Math.max(4, goDivide(spec.speed, 2));
    enemy.x += (goDivide(enemy.age, 60) & 1 ? -1 : 1) * Math.max(3, spec.speed);
  } else if (pattern === "dive") {
    const cycle = enemy.age % Math.max(45, spec.fire_interval);
    if (cycle < 24) enemy.warning = 24 - cycle;
    else {
      enemy.warning = 0;
      enemy.y += Math.max(12, spec.speed * 2);
    }
  } else if (pattern === "orbit") {
    enemy.x += (enemy.id & 1 ? -1 : 1) * Math.max(3, goDivide(spec.speed, 2));
    enemy.y += Math.max(3, goDivide(spec.speed, 3));
  } else if (pattern === "anchor") {
    enemy.y += Math.max(2, goDivide(spec.speed, 4));
  } else if (pattern === "mirror") {
    const dx = SHOOTER_WIDTH - state.playerX - enemy.x;
    enemy.x += clamp(dx, -spec.speed, spec.speed);
    enemy.y += Math.max(5, goDivide(spec.speed, 2));
  }
  enemy.x = clamp(enemy.x, ENEMY_RADIUS, SHOOTER_WIDTH - ENEMY_RADIUS);
};

export const fireEnemy = (
  state: ShooterMutableState,
  enemy: ShooterEnemyEntity,
  spec: ShooterEnemySpec,
  authoredPattern: string,
): void => {
  if (state.enemyProjectiles.length >= state.config.limits.enemy_projectiles) return;
  const speed = spec.projectile_speed;
  if (spec.chassis === "spam-bot") {
    addEnemyHazard(state, "spam_stream", enemy.x, enemy.y, 0, speed, spec.damage, ENEMY_PROJECTILE_RADIUS, 0, 0);
    return;
  }
  if (spec.chassis === "clip-cutter") {
    addEnemyHazard(state, "horizontal_cut", enemy.x, enemy.y, 0, Math.max(20, goDivide(speed, 2)), spec.damage, 65, 1_700, 0);
    return;
  }
  if (spec.chassis === "caption-blob") {
    const x = clamp(state.playerX + (enemy.id % 3 - 1) * 520, 420, SHOOTER_WIDTH - 420);
    addEnemyHazard(state, "caption_block", x, enemy.y, 0, Math.max(45, goDivide(speed, 2)), spec.damage, 150, 600, 0);
    return;
  }
  if (spec.chassis === "black-screen-ghost") {
    addEnemyHazard(state, "black_wall", enemy.x, enemy.y, 0, Math.max(28, goDivide(speed, 3)), spec.damage, 125, 900, Math.max(16, goDivide(spec.health, 2)));
    return;
  }
  if (spec.chassis === "gift-thief") return;
  if (spec.chassis === "censor-frame") {
    fireCensorFrame(state, enemy, speed, spec.damage, "censor_bar");
    return;
  }
  const defaults: Record<ShooterEnemySpec["chassis"], string> = {
    "spam-bot": "aimed",
    "clip-cutter": "fan",
    "caption-blob": "ring",
    "black-screen-ghost": "delayed",
    "gift-thief": "beam",
    "censor-frame": "lane",
  };
  const pattern = authoredPattern || defaults[spec.chassis];
  if (pattern === "aimed") {
    const dx = state.playerX - enemy.x;
    const dy = PLAYER_Y - enemy.y;
    const distance = Math.max(1, integerSqrt(dx * dx + dy * dy));
    addEnemyBullet(state, enemy.x, enemy.y, goDivide(dx * speed, distance), goDivide(dy * speed, distance), spec.damage);
  } else if (pattern === "beam") {
    addEnemyBullet(state, enemy.x, enemy.y, 0, speed, spec.damage);
  } else if (pattern === "fan") {
    for (const vx of [goDivide(-speed, 2), 0, goDivide(speed, 2)]) addEnemyBullet(state, enemy.x, enemy.y, vx, speed, spec.damage);
  } else if (pattern === "delayed") {
    addEnemyBullet(state, enemy.x, enemy.y, 0, Math.max(1, goDivide(speed, 2)), spec.damage);
    addEnemyBullet(state, enemy.x + 180, enemy.y - 240, 0, speed, spec.damage);
  } else if (pattern === "ring") {
    for (const vx of [-speed, speed]) addEnemyBullet(state, enemy.x, enemy.y, goDivide(vx, 2), speed, spec.damage);
  } else if (pattern === "lane") {
    for (const vx of [-speed, goDivide(-speed, 2), 0, goDivide(speed, 2), speed]) addEnemyBullet(state, enemy.x, enemy.y, vx, speed, spec.damage);
  }
  if (hasTrait(spec, "echo")) addEnemyBullet(state, enemy.x + 120, enemy.y - 180, 0, speed, spec.damage);
};

const fireCensorFrame = (
  state: ShooterMutableState,
  enemy: ShooterEnemyEntity,
  speed: number,
  damage: number,
  kind: string,
): void => {
  const gap = goDivide(state.tick, 150) % 5;
  for (let lane = 0; lane < 5; lane += 1) {
    if (lane === gap) continue;
    addEnemyHazard(
      state,
      kind,
      360 + lane * 720,
      enemy.y,
      0,
      speed,
      damage,
      110,
      460,
      0,
    );
  }
};

export const fireEnemySecondary = (
  state: ShooterMutableState,
  enemy: ShooterEnemyEntity,
  spec: ShooterEnemySpec,
): void => {
  const speed = Math.max(1, spec.projectile_speed);
  if (spec.chassis === "spam-bot") {
    addEnemyHazard(state, "spam_cross", enemy.x, enemy.y, goDivide(speed, 3), speed, spec.damage, ENEMY_PROJECTILE_RADIUS, 0, 0);
    addEnemyHazard(state, "spam_cross", enemy.x, enemy.y, goDivide(-speed, 3), speed, spec.damage, ENEMY_PROJECTILE_RADIUS, 0, 0);
  } else if (spec.chassis === "clip-cutter") {
    addEnemyHazard(state, "horizontal_cut", SHOOTER_WIDTH - enemy.x, enemy.y - 220, 0, Math.max(20, goDivide(speed, 2)), spec.damage, 65, 1_300, 0);
  } else if (spec.chassis === "caption-blob") {
    const x = clamp(SHOOTER_WIDTH - state.playerX, 420, SHOOTER_WIDTH - 420);
    addEnemyHazard(state, "caption_block", x, enemy.y - 180, 0, Math.max(48, goDivide(speed, 2)), spec.damage, 135, 520, 0);
  } else if (spec.chassis === "black-screen-ghost") {
    addEnemyHazard(state, "black_wall", SHOOTER_WIDTH - enemy.x, enemy.y - 220, 0, Math.max(30, goDivide(speed, 3)), spec.damage, 110, 720, Math.max(12, goDivide(spec.health, 3)));
  } else if (spec.chassis === "gift-thief") {
    enemy.age = Math.max(enemy.age, 105);
  } else if (spec.chassis === "censor-frame") {
    fireCensorFrame(state, enemy, speed, spec.damage, "censor_bar_fast");
  }
};

export const damagePlayer = (state: ShooterMutableState, amount: number): void => {
  if (amount <= 0 || state.health <= 0 || state.invulnerableTicks > 0) return;
  const absorbed = Math.min(state.shield, amount);
  state.shield -= absorbed;
  amount -= absorbed;
  state.health = Math.max(0, state.health - amount);
  state.invulnerableTicks = 60;
  state.combo = 0;
  state.comboClock = 0;
};

const dropSupportNote = (state: ShooterMutableState, x: number, y: number, value: number): void => {
  if (state.pickups.length >= state.config.limits.pickups) return;
  state.nextPickupID += 1;
  state.pickups.push({ id: state.nextPickupID, x, y, value: Math.max(1, value) });
};

export const removeDefeatedEnemies = (state: ShooterMutableState): void => {
  const alive: ShooterEnemyEntity[] = [];
  for (const enemy of state.enemies) {
    if (
      enemy.health > 0 &&
      enemy.y > -ENEMY_RADIUS &&
      enemy.y < SHOOTER_HEIGHT + ENEMY_RADIUS
    ) {
      alive.push(enemy);
      continue;
    }
    if (enemy.health > 0) continue;
    state.kills += 1;
    state.combo += 1;
    state.comboClock = 90 + state.runtime.comboExtend;
    let score = 100;
    if (enemy.boss && state.config.boss) {
      score = Math.max(1_000, state.config.boss.score);
    } else if (enemy.specIndex >= 0 && enemy.specIndex < state.config.enemies.length) {
      const spec = state.config.enemies[enemy.specIndex]!;
      score = Math.max(50, spec.score);
      if (hasTrait(spec, "split") && alive.length < state.config.limits.enemies - 1) {
        for (const offset of [-160, 160]) {
          state.nextEnemyID += 1;
          const health = Math.max(1, goDivide(enemy.maxHealth, 3));
          alive.push({
            id: state.nextEnemyID,
            specIndex: enemy.specIndex,
            x: clamp(enemy.x + offset, ENEMY_RADIUS, SHOOTER_WIDTH - ENEMY_RADIUS),
            y: enemy.y,
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
        }
      }
    }
    state.score += score * Math.max(1, state.combo);
    earnRescue(state, 10);
    let noteValue = 12;
    if (
      !enemy.boss &&
      enemy.specIndex >= 0 &&
      enemy.specIndex < state.config.enemies.length &&
      state.config.enemies[enemy.specIndex]!.chassis === "gift-thief"
    ) {
      noteValue = 30;
      state.score += 200;
    }
    dropSupportNote(state, enemy.x, enemy.y, noteValue);
    if (state.runtime.recoveryDrop > 0 && state.kills % Math.max(2, 6 - state.runtime.recoveryDrop) === 0) {
      state.health = Math.min(state.runtime.maxHealth, state.health + 1);
    }
  }
  state.enemies = alive;
};

export const updatePickups = (state: ShooterMutableState): void => {
  const kept = [];
  for (const pickup of state.pickups) {
    pickup.y += 70;
    const magnetRange = 220 + state.runtime.pickupMagnet;
    if (pickup.y >= PLAYER_Y - 900 && Math.abs(pickup.x - state.playerX) <= magnetRange) {
      pickup.x += clamp(state.playerX - pickup.x, -90, 90);
    }
    if (squaredDistance(pickup.x, pickup.y, state.playerX, PLAYER_Y) <= (PLAYER_RADIUS + 70) ** 2) {
      state.pickupsCollected += 1;
      state.lastPickupTick = state.tick;
      earnRescue(state, pickup.value);
      state.score += 40 * Math.max(1, state.combo);
    } else if (pickup.y <= SHOOTER_HEIGHT + 70) {
      kept.push(pickup);
    }
  }
  state.pickups = kept;
};

const applyKitOnHit = (state: ShooterMutableState, enemyIndex: number, baseDamage: number): void => {
  const enemy = state.enemies[enemyIndex];
  if (!enemy) return;
  if (state.config.kit.id === "nana7mi") {
    enemy.marks = Math.min(3, enemy.marks + 1);
    addShooterEffect(state, "route_mark", enemy.x, enemy.y, 45, enemy.marks);
  } else if (state.config.kit.id === "nailu") {
    if (state.effects.some((effect) => effect.kind === "memory_plant" && squaredDistance(effect.x, effect.y, enemy.x, enemy.y) <= 180 ** 2)) return;
    addShooterEffect(state, "memory_plant", enemy.x, enemy.y, 450, Math.max(1, baseDamage));
  }
};

const hitBreakableHazard = (
  state: ShooterMutableState,
  shot: ShooterMutableState["playerProjectiles"][number],
): boolean => {
  for (const hazard of state.enemyProjectiles) {
    if (
      hazard.kind !== "black_wall" ||
      hazard.health <= 0 ||
      Math.abs(shot.y - hazard.y) >
        Math.max(hazard.radius, 120) + ENEMY_PROJECTILE_RADIUS ||
      Math.abs(shot.x - hazard.x) >
        goDivide(hazard.width, 2) + ENEMY_PROJECTILE_RADIUS
    ) {
      continue;
    }
    hazard.health -= Math.max(1, shot.damage);
    addShooterEffect(state, "wall_hit", shot.x, shot.y, 8, shot.damage);
    if (hazard.health <= 0) {
      state.score += 120;
      earnRescue(state, 4);
      addShooterEffect(
        state,
        "wall_break",
        hazard.x,
        hazard.y,
        24,
        hazard.width,
      );
    }
    return true;
  }
  return false;
};

const hostileHitsPlayer = (
  bullet: ShooterMutableState["enemyProjectiles"][number],
  playerX: number,
): boolean => {
  const radius = Math.max(ENEMY_PROJECTILE_RADIUS, bullet.radius);
  if (bullet.width > 0) {
    return (
      Math.abs(bullet.y - PLAYER_Y) <= radius + PLAYER_RADIUS &&
      Math.abs(bullet.x - playerX) <= goDivide(bullet.width, 2) + PLAYER_RADIUS
    );
  }
  return (
    squaredDistance(bullet.x, bullet.y, playerX, PLAYER_Y) <=
    (PLAYER_RADIUS + radius) ** 2
  );
};

export const updateProjectiles = (state: ShooterMutableState): void => {
  const playerShots = [];
  let bossDefeated = false;
  for (const shot of state.playerProjectiles) {
    shot.x += shot.vx;
    shot.y += shot.vy;
    if (shot.y < -ENEMY_PROJECTILE_RADIUS || shot.x < -ENEMY_PROJECTILE_RADIUS || shot.x > SHOOTER_WIDTH + ENEMY_PROJECTILE_RADIUS) continue;
    let hit = hitBreakableHazard(state, shot);
    if (hit) continue;
    for (let index = 0; index < state.enemies.length; index += 1) {
      const enemy = state.enemies[index]!;
      if (enemy.health <= 0 || squaredDistance(shot.x, shot.y, enemy.x, enemy.y) > (ENEMY_RADIUS + ENEMY_PROJECTILE_RADIUS) ** 2) continue;
      let damage = shot.damage;
      if (enemy.boss) damage += state.runtime.bossBreak;
      else if (hasTrait(state.config.enemies[enemy.specIndex]!, "armor")) damage = Math.max(1, goDivide(damage * 2, 3));
      enemy.health -= damage;
      if (enemy.boss && enemy.health <= 0) bossDefeated = true;
      applyKitOnHit(state, index, shot.damage);
      hit = true;
      if (shot.pierce > 0) {
        shot.pierce -= 1;
        hit = false;
      }
      break;
    }
    if (!hit) playerShots.push(shot);
  }
  state.playerProjectiles = playerShots;
  if (bossDefeated) {
    state.enemyProjectiles = [];
    addShooterEffect(state, "boss_cut", SHOOTER_WIDTH / 2, PLAYER_Y / 2, 30, 1);
  }

  const hostile = [];
  for (const bullet of state.enemyProjectiles) {
    if (bullet.kind === "black_wall" && bullet.health <= 0) continue;
    bullet.x += bullet.vx;
    bullet.y += bullet.vy;
    const radius = Math.max(ENEMY_PROJECTILE_RADIUS, bullet.radius);
    if (
      bullet.y > SHOOTER_HEIGHT + radius ||
      bullet.y < -radius ||
      bullet.x < -radius - goDivide(bullet.width, 2) ||
      bullet.x > SHOOTER_WIDTH + radius + goDivide(bullet.width, 2)
    ) continue;
    const distance = squaredDistance(bullet.x, bullet.y, state.playerX, PLAYER_Y);
    if (hostileHitsPlayer(bullet, state.playerX)) {
      damagePlayer(state, bullet.damage);
      continue;
    }
    if (!bullet.grazed && bullet.width === 0 && distance <= PLAYER_GRAZE_RADIUS ** 2) {
      bullet.grazed = true;
      state.grazeCount += 1;
      state.combo += 1;
      state.comboClock = 75 + state.runtime.comboExtend;
      earnRescue(state, state.runtime.grazeCharge);
      state.score += 25 * Math.max(1, state.combo);
    }
    hostile.push(bullet);
  }
  state.enemyProjectiles = hostile;
};

export const updateKitPassives = (state: ShooterMutableState): void => {
  if (state.config.kit.id === "lulu") {
    if (state.tick % 12 !== 0 || state.playerProjectiles.length >= state.config.limits.player_projectiles) return;
    let bestIndex = -1;
    let bestDistance = 520 ** 2 + 1;
    state.enemyProjectiles.forEach((bullet, index) => {
      const distance = squaredDistance(bullet.x, bullet.y, state.playerX, PLAYER_Y);
      if (distance < bestDistance) {
        bestIndex = index;
        bestDistance = distance;
      }
    });
    if (bestIndex < 0) return;
    const [bullet] = state.enemyProjectiles.splice(bestIndex, 1);
    if (!bullet) return;
    addPlayerProjectile(state, { x: bullet.x, y: bullet.y, vy: -175, damage: Math.max(1, goDivide(state.runtime.damage, 2)), pierce: 1 });
    addShooterEffect(state, "subtitle_rewrite", bullet.x, bullet.y, 18, 1);
  } else if (state.config.kit.id === "xingtong") {
    let target = -1;
    for (let index = 0; index < state.enemies.length; index += 1) {
      const enemy = state.enemies[index]!;
      if (enemy.health <= 0 || Math.abs(enemy.x - state.playerX) > 135) continue;
      if (target < 0 || enemy.y > state.enemies[target]!.y) target = index;
    }
    if (target < 0) {
      state.alignmentTicks = 0;
      return;
    }
    state.alignmentTicks += 1;
    if (state.alignmentTicks < 12 || state.alignmentTicks % 6 !== 0) return;
    const damage = Math.max(1, goDivide(state.runtime.damage, 3));
    state.enemies[target]!.health -= damage;
    addShooterEffect(state, "alignment_beam", state.playerX, state.enemies[target]!.y, 7, damage);
  }
};

export const updateEffects = (state: ShooterMutableState): void => {
  state.effects = state.effects.filter((effect) => {
    effect.ticks -= 1;
    return effect.ticks > 0;
  });
};

export const enemyIntent = (
  enemy: ShooterEnemyEntity,
  spec: ShooterEnemySpec,
  encoreLevel: number,
): "fire" | "charge" | "" => {
  if (enemy.warning > 0) return "charge";
  return encoreInterval(spec.fire_interval, encoreLevel, 12) - enemy.fireClock <= 15
    ? "fire"
    : "";
};

const defaultBossPattern = (bossID: string, phase: number): string => {
  const patterns: Record<string, readonly [string, string, string]> = {
    "optimal-nana": ["aimed", "fan", "ring"],
    "always-on-idol": ["applause", "lanes", "ring"],
    "perfect-highlight": ["highlight", "echo", "fan"],
    "perfect-captain": ["lanes", "fan", "ring"],
    "approved-translation": ["translation", "echo", "lanes"],
    "physical-original": ["aimed", "spiral", "echo"],
    "reality-auditor": ["audit", "lanes", "ring"],
    "auto-archive-system": ["fan", "spiral", "finale"],
  };
  return (patterns[bossID] ?? ["aimed", "fan", "ring"])[
    clamp(phase - 1, 0, 2)
  ];
};

const storyChoiceThreat = (
  state: ShooterMutableState,
  enemy: ShooterEnemyEntity,
  remaining: number,
): ShooterThreatSnapshot | null => {
  const warning: ShooterThreatSnapshot = {
    source_id: enemy.id,
    kind: "aimed_line",
    ticks_remaining: remaining,
    origin: { x: enemy.x, y: enemy.y },
    target: { x: state.playerX, y: PLAYER_Y },
  };
  const mode = storyChoiceMode(state.config.story_choice_id);
  if (mode === 1) return { ...warning, width: 150 };
  if (mode === 2 && state.config.boss) {
    return {
      ...warning,
      kind: "censor_gap",
      width: 260,
      target: {
        x:
          360 +
          ((enemy.volley +
            (shooterSeedFromString(state.config.boss.id) % 5) +
            4) %
            5) *
            720,
        y: PLAYER_Y,
      },
    };
  }
  return null;
};

const bossRemixThreat = (
  state: ShooterMutableState,
  enemy: ShooterEnemyEntity,
  remaining: number,
): ShooterThreatSnapshot => {
  const bossID = state.config.boss!.id;
  const warning: ShooterThreatSnapshot = {
    source_id: enemy.id,
    kind: "aimed_line",
    ticks_remaining: remaining,
    origin: { x: enemy.x, y: enemy.y },
    target: { x: state.playerX, y: PLAYER_Y },
  };
  if (bossID === "optimal-nana" || bossID === "perfect-highlight") {
    return {
      ...warning,
      kind: "censor_gap",
      width: 260,
      target: {
        x:
          360 +
          ((enemy.volley + (shooterSeedFromString(bossID) % 5) + 3) % 5) *
            720,
        y: PLAYER_Y,
      },
    };
  }
  if (bossID === "always-on-idol" || bossID === "approved-translation") {
    return {
      ...warning,
      kind: "horizontal_cut",
      width: 1_450,
      target: { x: SHOOTER_WIDTH - enemy.x, y: PLAYER_Y },
    };
  }
  if (bossID === "perfect-captain" || bossID === "reality-auditor") {
    return { ...warning, kind: "radial_burst", radius: 520 };
  }
  return {
    ...warning,
    kind: "black_wall",
    width: 1_050,
    radius: 125,
    target: {
      x: clamp(SHOOTER_WIDTH - state.playerX, 650, SHOOTER_WIDTH - 650),
      y: PLAYER_Y,
    },
  };
};

const bossSpecialThreat = (
  state: ShooterMutableState,
  enemy: ShooterEnemyEntity,
  special: string,
  remaining: number,
): ShooterThreatSnapshot | null => {
  const warning: ShooterThreatSnapshot = {
    source_id: enemy.id,
    kind: "aimed_line",
    ticks_remaining: remaining,
    origin: { x: enemy.x, y: enemy.y },
    target: { x: state.playerX, y: PLAYER_Y },
  };
  if (["tidy-intro", "word-by-word", "prove-the-address", "helpful-rewrite", "erase-the-flowers", "overwrite-drafts"].includes(special)) {
    return { ...warning, kind: "caption_block", width: 720, radius: 170 };
  }
  if (["empty-horizon", "delete-loss", "overtime-wall", "nothing-happened"].includes(special)) {
    return { ...warning, kind: "black_wall", width: 1_200, radius: 135 };
  }
  if (["reply-now", "crop-the-miss", "assign-everything", "remove-duplicates"].includes(special)) {
    return {
      ...warning,
      kind: "censor_gap",
      width: 260,
      target: { x: 360 + ((enemy.volley + 2) % 5) * 720, y: PLAYER_Y },
    };
  }
  if (["endless-encore", "approved-only", "split-stage", "archive-everyone"].includes(special)) {
    return { ...warning, kind: "radial_burst", radius: 520 };
  }
  if (["applause-loop", "carry-the-room", "copied-laugh", "bad-take-echo", "tone-correction", "double-exposure", "copy-position"].includes(special)) {
    return { ...warning, width: 150 };
  }
  return null;
};

export const threatSnapshots = (state: ShooterMutableState): ShooterThreatSnapshot[] => {
  const result: ShooterThreatSnapshot[] = [];
  for (const enemy of state.enemies) {
    if (enemy.health <= 0) continue;
    if (enemy.warning > 0) {
      result.push({ source_id: enemy.id, kind: "charge_lane", ticks_remaining: enemy.warning, origin: { x: enemy.x, y: enemy.y }, target: { x: enemy.x, y: PLAYER_Y }, width: ENEMY_RADIUS * 2 });
      continue;
    }
    let pattern = "";
    let special = "";
    let telegraph = 0;
    let interval = 0;
    if (enemy.boss && state.config.boss) {
      const stage = state.config.boss.stages[clamp(enemy.phase - 1, 0, state.config.boss.stages.length - 1)]!;
      pattern = stage.shot_pattern || defaultBossPattern(state.config.boss.id, enemy.phase);
      special = stage.special ?? "";
      telegraph = stage.telegraph_ticks;
      interval = encoreInterval(stage.fire_interval, state.config.encore_level, 10);
    } else {
      const spec = state.config.enemies[enemy.specIndex]!;
      pattern = spec.shot_pattern;
      telegraph = spec.telegraph_ticks;
      interval = encoreInterval(spec.fire_interval, state.config.encore_level, 12);
    }
    const remaining = interval - enemy.fireClock;
    if (telegraph <= 0 || remaining <= 0 || remaining > telegraph) continue;
    if (enemy.boss) {
      const specialWarning = bossSpecialThreat(state, enemy, special, remaining);
      if (specialWarning) result.push(specialWarning);
      const choiceWarning = storyChoiceThreat(state, enemy, remaining);
      if (choiceWarning) result.push(choiceWarning);
      if (state.config.encore_level >= 3) {
        result.push(bossRemixThreat(state, enemy, remaining));
      }
    }
    if (!enemy.boss) {
      const spec = state.config.enemies[enemy.specIndex]!;
      if (spec.chassis === "clip-cutter") {
        result.push({ source_id: enemy.id, kind: "horizontal_cut", ticks_remaining: remaining, origin: { x: enemy.x, y: enemy.y }, target: { x: enemy.x, y: PLAYER_Y }, width: 1_700 });
        continue;
      }
      if (spec.chassis === "caption-blob") {
        const x = clamp(state.playerX + (enemy.id % 3 - 1) * 520, 420, SHOOTER_WIDTH - 420);
        result.push({ source_id: enemy.id, kind: "caption_block", ticks_remaining: remaining, origin: { x: enemy.x, y: enemy.y }, target: { x, y: PLAYER_Y }, width: 600, radius: 150 });
        continue;
      }
      if (spec.chassis === "black-screen-ghost") {
        result.push({ source_id: enemy.id, kind: "black_wall", ticks_remaining: remaining, origin: { x: enemy.x, y: enemy.y }, target: { x: enemy.x, y: PLAYER_Y }, width: 900, radius: 125 });
        continue;
      }
      if (spec.chassis === "gift-thief") continue;
      if (spec.chassis === "censor-frame") {
        const gap = goDivide(state.tick + remaining, 150) % 5;
        result.push({ source_id: enemy.id, kind: "censor_gap", ticks_remaining: remaining, origin: { x: enemy.x, y: enemy.y }, target: { x: 360 + gap * 720, y: PLAYER_Y }, width: 260 });
        continue;
      }
    }
    let kind: ShooterThreatSnapshot["kind"] = "aimed_line";
    let width = 120;
    let radius = 0;
    if (["beam", "lane", "lanes", "highlight", "audit"].includes(pattern)) { kind = "danger_lane"; width = 260; }
    else if (["fan", "applause", "translation"].includes(pattern)) { kind = "fan_cone"; width = 900; }
    else if (["ring", "spiral", "finale"].includes(pattern)) { kind = "radial_burst"; radius = 520; width = 0; }
    else if (["delayed", "echo"].includes(pattern)) { kind = "delayed_echo"; radius = 180; width = 0; }
    result.push({ source_id: enemy.id, kind, ticks_remaining: remaining, origin: { x: enemy.x, y: enemy.y }, target: { x: state.playerX, y: PLAYER_Y }, ...(radius ? { radius } : {}), ...(width ? { width } : {}) });
  }
  return result;
};
