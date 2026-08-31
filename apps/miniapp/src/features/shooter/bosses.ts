import { ENEMY_RADIUS, PLAYER_Y, SHOOTER_WIDTH, clamp, goDivide, integerSqrt } from "@/features/shooter/constants";
import { addEnemyBullet, addEnemyHazard, encoreInterval } from "@/features/shooter/enemies";
import { shooterSeedFromString } from "@/features/shooter/random";
import { storyChoiceMode } from "@/features/shooter/story";
import type { ShooterEnemyEntity, ShooterMutableState } from "@/features/shooter/types";
import type { ShooterBossStage } from "@/lib/api/types";

export const spawnBoss = (state: ShooterMutableState): void => {
  const boss = state.config.boss;
  if (!boss || state.spawnedBoss || state.enemies.length >= state.config.limits.enemies) return;
  state.spawnedBoss = true;
  state.nextEnemyID += 1;
  state.enemies.push({ id: state.nextEnemyID, specIndex: 0, x: SHOOTER_WIDTH / 2, y: 900, health: boss.health, maxHealth: boss.health, fireClock: 0, age: 0, phase: 1, warning: 0, volley: 0, marks: 0, boss: true });
};

const bossStageIndex = (health: number, maxHealth: number, stages: readonly ShooterBossStage[]): number => {
  const percent = goDivide(health * 100, Math.max(1, maxHealth));
  let index = 0;
  stages.forEach((stage, candidate) => { if (percent <= stage.health_threshold) index = candidate; });
  return clamp(index, 0, stages.length - 1);
};

export const moveBoss = (enemy: ShooterEnemyEntity, bossID: string, pattern: string, tick: number, playerX: number): void => {
  const direction = goDivide(tick, 90) & 1 ? -1 : 1;
  let speed = 7;
  if (bossID === "perfect-captain") speed = 5;
  else if (bossID === "physical-original") speed = 10;
  else if (bossID === "auto-archive-system") speed = 12;
  if (pattern === "anchor") return;
  if (pattern === "mirror") enemy.x += clamp(SHOOTER_WIDTH - playerX - enemy.x, -speed, speed);
  else if (pattern === "orbit") { enemy.x += direction * speed; enemy.y = 900 + (goDivide(tick, 20) % 9 - 4) * 18; }
  else if (pattern === "dive") { enemy.x += direction * goDivide(speed, 2); enemy.y = 900 + (tick % 120 - 60) * 4; }
  else if (pattern === "sweep") enemy.x += direction * speed * 2;
  else enemy.x += direction * speed;
  enemy.x = clamp(enemy.x, ENEMY_RADIUS, SHOOTER_WIDTH - ENEMY_RADIUS);
  enemy.y = clamp(enemy.y, 500, 1_800);
};

export const bossDefaultPattern = (bossID: string, phase: number): string => {
  const patterns: Record<string, readonly [string, string, string]> = {
    "optimal-nana": ["aimed", "fan", "ring"], "always-on-idol": ["applause", "lanes", "ring"],
    "perfect-highlight": ["highlight", "echo", "fan"], "perfect-captain": ["lanes", "fan", "ring"],
    "approved-translation": ["translation", "echo", "lanes"], "physical-original": ["aimed", "spiral", "echo"],
    "reality-auditor": ["audit", "lanes", "ring"], "auto-archive-system": ["fan", "spiral", "finale"],
  };
  return (patterns[bossID] ?? ["aimed", "fan", "ring"])[clamp(phase - 1, 0, 2)];
};

const aimedVelocity = (fromX: number, fromY: number, toX: number, toY: number, speed: number): readonly [number, number] => {
  const dx = toX - fromX, dy = toY - fromY;
  const distance = Math.max(1, integerSqrt(dx * dx + dy * dy));
  return [goDivide(dx * speed, distance), goDivide(dy * speed, distance)];
};

const fireRadial = (state: ShooterMutableState, enemy: ShooterEnemyEntity, speed: number, damage: number, offset: number, kind: string): void => {
  const xs = [0, 5, 9, 11, 9, 5, 0, -5, -9, -11, -9, -5];
  const ys = [11, 9, 5, 0, -5, -9, -11, -9, -5, 0, 5, 9];
  for (let index = 0; index < 12; index += 1) {
    const angle = (index + offset) % 12;
    addEnemyHazard(state, kind, enemy.x, enemy.y, goDivide(xs[angle]! * speed, 11), goDivide(ys[angle]! * speed, 11), damage, 50, 0, 0);
  }
};

const fireBossFrame = (state: ShooterMutableState, enemy: ShooterEnemyEntity, speed: number, damage: number, kind: string, gapOffset: number): void => {
  const bossID = state.config.boss?.id ?? "auto-archive-system";
  const gap = (enemy.volley + shooterSeedFromString(bossID) % 5 + gapOffset) % 5;
  for (let lane = 0; lane < 5; lane += 1) if (lane !== gap) addEnemyHazard(state, kind, 360 + lane * 720, enemy.y, 0, speed, damage, 105, 470, 0);
};

const fireStoryChoiceBeat = (state: ShooterMutableState, enemy: ShooterEnemyEntity, speed: number, damage: number): void => {
  if (enemy.volley % 3 !== 0) return;
  const mode = storyChoiceMode(state.config.story_choice_id);
  if (mode === 1) {
    const x = SHOOTER_WIDTH - enemy.x;
    const [vx, vy] = aimedVelocity(x, enemy.y, state.playerX, PLAYER_Y, speed);
    addEnemyHazard(state, "choice_echo", x, enemy.y, vx, vy, damage, 54, 0, 0);
  } else if (mode === 2) fireBossFrame(state, enemy, speed, damage, "choice_frame", 4);
};

const fireBossSpecial = (state: ShooterMutableState, enemy: ShooterEnemyEntity, special: string, speed: number, damage: number): void => {
  if (["tidy-intro", "smile-check", "word-by-word", "prove-the-address"].includes(special)) {
    const x = clamp(state.playerX, 520, SHOOTER_WIDTH - 520);
    addEnemyHazard(state, "caption_block", x, enemy.y - 180, 0, Math.max(14, goDivide(speed, 3)), damage, 170, 720, 0);
  } else if (["copied-laugh", "bad-take-echo", "tone-correction", "double-exposure"].includes(special)) {
    const x = SHOOTER_WIDTH - state.playerX, [vx, vy] = aimedVelocity(x, enemy.y, state.playerX, PLAYER_Y, speed);
    addEnemyHazard(state, "echo_shot", x, enemy.y, vx, vy, damage, 58, 0, 0);
  } else if (["empty-horizon", "delete-loss", "overtime-wall", "nothing-happened"].includes(special)) {
    const x = clamp(enemy.x + (enemy.volley % 3 - 1) * 650, 700, SHOOTER_WIDTH - 700);
    addEnemyHazard(state, "black_wall", x, enemy.y - 220, 0, Math.max(12, goDivide(speed, 4)), damage, 135, 1_200, 28);
  } else if (["applause-loop", "carry-the-room"].includes(special)) {
    for (const origin of [220, SHOOTER_WIDTH - 220]) { const [vx, vy] = aimedVelocity(origin, enemy.y, state.playerX, PLAYER_Y, speed); addEnemyHazard(state, "applause", origin, enemy.y, vx, vy, damage, 58, 0, 0); }
  } else if (["reply-now", "crop-the-miss", "assign-everything", "remove-duplicates"].includes(special)) fireBossFrame(state, enemy, speed, damage, "special_frame", 2);
  else if (["endless-encore", "approved-only", "split-stage", "archive-everyone"].includes(special)) fireRadial(state, enemy, Math.max(18, goDivide(speed * 3, 4)), damage, enemy.volley * 2 % 12, "special_spiral");
  else if (["helpful-rewrite", "erase-the-flowers", "overwrite-drafts"].includes(special)) for (const x of [900, 2_700]) addEnemyHazard(state, "caption_block", x, enemy.y - 180, 0, Math.max(14, goDivide(speed, 3)), damage, 155, 580, 0);
  else if (special === "first-take" || special === "copy-position") { const x = SHOOTER_WIDTH - state.playerX, [vx, vy] = aimedVelocity(x, enemy.y, state.playerX, PLAYER_Y, speed); addEnemyHazard(state, "mirror_aim", x, enemy.y, vx, vy, damage, 60, 0, 0); }
  else if (special === "second-original") fireRadial(state, enemy, speed, damage, 6, "double_exposure");
  else if (special === "both-live") { addEnemyHazard(state, "boss_beam", 760, enemy.y, 0, Math.max(18, goDivide(speed, 2)), damage, 100, 280, 0); addEnemyHazard(state, "boss_beam", SHOOTER_WIDTH - 760, enemy.y, 0, Math.max(18, goDivide(speed, 2)), damage, 100, 280, 0); }
};

const fireBossRemix = (state: ShooterMutableState, enemy: ShooterEnemyEntity, bossID: string, speed: number, damage: number): void => {
  if (bossID === "optimal-nana" || bossID === "perfect-highlight") fireBossFrame(state, enemy, Math.max(18, goDivide(speed * 3, 4)), damage, "encore_frame", 3);
  else if (bossID === "always-on-idol" || bossID === "approved-translation") addEnemyHazard(state, "horizontal_cut", SHOOTER_WIDTH - enemy.x, enemy.y - 260, 0, Math.max(18, goDivide(speed, 2)), damage, 65, 1_450, 0);
  else if (bossID === "perfect-captain" || bossID === "reality-auditor") fireRadial(state, enemy, Math.max(18, goDivide(speed * 2, 3)), damage, enemy.volley * 3 % 12, "encore_spiral");
  else { const x = clamp(SHOOTER_WIDTH - state.playerX, 650, SHOOTER_WIDTH - 650); addEnemyHazard(state, "black_wall", x, enemy.y - 240, 0, Math.max(12, goDivide(speed, 4)), damage, 125, 1_050, 24); }
};

const fireBossPattern = (state: ShooterMutableState, enemy: ShooterEnemyEntity, bossID: string, stage: ShooterBossStage): void => {
  const pattern = stage.shot_pattern || bossDefaultPattern(bossID, enemy.phase), speed = stage.projectile_speed, damage = stage.damage;
  if (pattern === "aimed") { const [vx, vy] = aimedVelocity(enemy.x, enemy.y, state.playerX, PLAYER_Y, speed); addEnemyBullet(state, enemy.x, enemy.y, vx, vy, damage); }
  else if (pattern === "delayed") { const slow = Math.max(1, goDivide(speed, 2)), [vx, vy] = aimedVelocity(enemy.x, enemy.y, state.playerX, PLAYER_Y, slow); addEnemyHazard(state, "delayed_echo", enemy.x, enemy.y, vx, vy, damage, 72, 0, 0); }
  else if (pattern === "echo") { const [vx, vy] = aimedVelocity(enemy.x, enemy.y, state.playerX, PLAYER_Y, speed); addEnemyBullet(state, enemy.x, enemy.y, vx, vy, damage); addEnemyHazard(state, "echo_shot", SHOOTER_WIDTH - enemy.x, enemy.y + 180, -vx, vy, damage, 55, 0, 0); }
  else if (pattern === "fan") for (const vx of [-speed, goDivide(-speed, 2), 0, goDivide(speed, 2), speed]) addEnemyBullet(state, enemy.x, enemy.y, vx, speed, damage);
  else if (pattern === "applause") for (const origin of [260, SHOOTER_WIDTH - 260]) { const [vx, vy] = aimedVelocity(origin, enemy.y, state.playerX, PLAYER_Y, speed); addEnemyHazard(state, "applause", origin, enemy.y, vx, vy, damage, 58, 0, 0); }
  else if (pattern === "translation") { const direction = enemy.volley & 1 ? -1 : 1; for (const vx of [goDivide(-speed, 2), 0, goDivide(speed, 2)]) addEnemyHazard(state, "translation_zigzag", enemy.x, enemy.y, vx + direction * goDivide(speed, 3), speed, damage, 55, 0, 0); }
  else if (pattern === "beam") addEnemyHazard(state, "boss_beam", clamp(state.playerX, 260, SHOOTER_WIDTH - 260), enemy.y, 0, Math.max(18, goDivide(speed, 2)), damage, 100, 300, 0);
  else if (pattern === "lane" || pattern === "lanes") fireBossFrame(state, enemy, speed, damage, "boss_lane", 0);
  else if (pattern === "highlight") addEnemyHazard(state, "highlight_cut", clamp(state.playerX, 850, SHOOTER_WIDTH - 850), enemy.y, 0, Math.max(18, goDivide(speed, 2)), damage, 70, 1_500, 0);
  else if (pattern === "audit") fireBossFrame(state, enemy, speed, damage, "audit_bar", 1);
  else if (pattern === "ring") fireRadial(state, enemy, speed, damage, 0, "boss_ring");
  else if (pattern === "spiral") fireRadial(state, enemy, speed, damage, enemy.volley % 12, "boss_spiral");
  else if (pattern === "finale") { fireRadial(state, enemy, speed, damage, enemy.volley % 12, "finale_ring"); fireBossFrame(state, enemy, Math.max(18, goDivide(speed * 3, 4)), damage, "finale_lane", 2); }
  else addEnemyBullet(state, enemy.x, enemy.y, 0, speed, damage);
  fireBossSpecial(state, enemy, stage.special ?? "", speed, damage);
  fireStoryChoiceBeat(state, enemy, speed, damage);
  if (state.config.encore_level >= 3) fireBossRemix(state, enemy, bossID, speed, damage);
};

export const updateBoss = (state: ShooterMutableState, enemy: ShooterEnemyEntity): void => {
  const boss = state.config.boss;
  if (!boss || enemy.health <= 0) return;
  const previousPhase = enemy.phase, index = bossStageIndex(enemy.health, enemy.maxHealth, boss.stages);
  enemy.phase = index + 1;
  const stage = boss.stages[index]!;
  if (previousPhase !== enemy.phase) state.bossPhaseTick = state.tick;
  moveBoss(enemy, boss.id, stage.move_pattern, state.tick, state.playerX);
  enemy.fireClock += 1;
  if (enemy.fireClock >= encoreInterval(stage.fire_interval, state.config.encore_level, 10)) { enemy.fireClock = 0; fireBossPattern(state, enemy, boss.id, stage); enemy.volley += 1; }
};
