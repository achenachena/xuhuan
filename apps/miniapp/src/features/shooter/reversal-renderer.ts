import type { ShooterEnemyImpact, ShooterVisualSources, ShooterVisuals } from "@/features/shooter/renderer";
import type { ReversalFanSnapshot, ShooterEnemySnapshot, ShooterSnapshot, ShooterPosition, ShooterProjectileSnapshot } from "@/features/shooter/types";
import { indexShooterPositions, interpolateShooterPosition, type PositionIndex } from "@/features/shooter/render-positions";

type Frame = { x: number; y: number; width: number; height: number };
const frames = new WeakMap<HTMLImageElement, readonly Frame[]>();
const ink = "#0b1827";
const cream = "#fff2ce";
const gold = "#ffc66b";
const teal = "#77e2d3";
const danger = "#ef6a88";
const emptyEntities = [] as const;

/** Read alpha once at load time, keeping animated feet on a shared baseline. */
const prepareFrames = (image: HTMLImageElement | undefined, rows: number): void => {
  if (!image || frames.has(image)) return;
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const result: Frame[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const left = Math.floor(col * canvas.width / 4), right = Math.floor((col + 1) * canvas.width / 4);
      const top = Math.floor(row * canvas.height / rows), bottom = Math.floor((row + 1) * canvas.height / rows);
      let minX = right, maxX = left, minY = bottom, maxY = top;
      for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
        if (pixels[(y * canvas.width + x) * 4 + 3]! < 40) continue;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      result.push(maxX > minX && maxY > minY
        ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
        : { x: left, y: top, width: right - left, height: bottom - top });
    }
  }
  frames.set(image, result);
};

export const preloadReversalFrames = (visuals: ShooterVisuals, sources: ShooterVisualSources): void => {
  prepareFrames(visuals.get(sources.player), 2);
  prepareFrames(visuals.get(sources.enemies.equipment ?? ""), 3);
  prepareFrames(visuals.get(sources.boss ?? ""), 2);
};

const sprite = (ctx: CanvasRenderingContext2D, image: HTMLImageElement | undefined, frame: number,
  x: number, y: number, height: number, baseline = false, baseFrame = 0): void => {
  if (!image) return;
  const list = frames.get(image), crop = list?.[frame], base = list?.[baseFrame];
  if (!crop || !base) return;
  const scale = height / base.height;
  const w = Math.round(crop.width * scale), h = Math.round(crop.height * scale);
  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height,
    Math.round(x - w / 2), Math.round(baseline ? y - h : y - h / 2), w, h);
};

const star = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void => {
  ctx.fillStyle = ink;
  ctx.fillRect(x - size - 1, y - 2, size * 2 + 2, 4);
  ctx.fillRect(x - 2, y - size - 1, 4, size * 2 + 2);
  ctx.fillStyle = color;
  ctx.fillRect(x - size, y - 1, size * 2, 2);
  ctx.fillRect(x - 1, y - size, 2, size * 2);
  ctx.fillRect(x - 2, y - 2, 4, 4);
  ctx.fillStyle = cream; ctx.fillRect(x - 1, y - 2, 2, 2);
};

const baton = (ctx: CanvasRenderingContext2D, x: number, y: number, tick: number): void => {
  const lift = tick % 24 < 12 ? 0 : -1;
  ctx.fillStyle = ink; ctx.fillRect(x - 4, y - 7 + lift, 8, 17);
  ctx.fillStyle = "#c58b50"; ctx.fillRect(x - 2, y + 1 + lift, 4, 8);
  ctx.fillStyle = teal; ctx.fillRect(x - 2, y - 5 + lift, 4, 8);
  star(ctx, x, y - 4 + lift, 6, gold);
  ctx.fillStyle = "rgba(119,226,211,.25)";
  ctx.fillRect(x - 7, y + 12, 14, 2);
};

const position = (entity: { id: number; position: ShooterPosition }, previous: PositionIndex, alpha: number) => {
  const point = interpolateShooterPosition(entity, previous, alpha);
  return { x: Math.round(point.x / 10), y: Math.round(point.y / 10) };
};

const drawFan = (ctx: CanvasRenderingContext2D, fan: ReversalFanSnapshot,
  point: { x: number; y: number }, image: HTMLImageElement | undefined): void => {
  const { x } = point;
  const y = point.y + (Math.floor(fan.age / 6) % 2);
  const waving = fan.phase === "leaving";
  const excited = fan.attack_ticks > 0;
  const height = fan.phase === "joining" ? Math.round(52 - Math.min(1, fan.age / 24) * 16) : 36;
  ctx.save();
  ctx.globalAlpha = fan.age > 171 ? (180 - fan.age) / 9 : 1;
  // The same controller now uses its display as a face and its arms as penlights.
  sprite(ctx, image, 0, x, y, height);
  const faceY = y + 1;
  ctx.fillStyle = "#243844"; ctx.fillRect(x - 8, faceY - 4, 16, 12);
  ctx.fillStyle = ink; ctx.fillRect(x - 7, faceY - 3, 14, 10);
  if (fan.age < 8) {
    ctx.fillStyle = danger;
    ctx.fillRect(x - 5, faceY - 1, 4, 2); ctx.fillRect(x + 2, faceY - 1, 4, 2);
  } else {
    star(ctx, x - 4, faceY, 2, gold); star(ctx, x + 4, faceY, 2, gold);
    ctx.fillStyle = teal; ctx.fillRect(x - 2, faceY + 4, 4, 1);
  }
  if (fan.age >= 8) {
    for (const side of [-1, 1]) {
      const raised = excited || (Math.floor(fan.age / (waving ? 3 : 6)) + side) % 2 === 0;
      const handX = x + side * 20, handY = y - (raised ? 13 : 5);
      ctx.fillStyle = ink; ctx.fillRect(handX - 3, handY - 6, 6, 18);
      ctx.fillStyle = side < 0 ? teal : gold; ctx.fillRect(handX - 2, handY - 5, 4, 10);
      ctx.fillStyle = cream; ctx.fillRect(handX - 1, handY - 4, 1, 8);
      ctx.fillStyle = "#758b91"; ctx.fillRect(handX - 2, handY + 6, 4, 4);
      ctx.fillStyle = "#b5c6bc"; ctx.fillRect(handX - 3, handY + 9, 6, 3);
      if (excited) star(ctx, handX, handY - 9, 3, gold);
    }
  }
  ctx.restore();
};

export const reversalPlayerFrame = (tick: number, dx: number, hit: boolean): number => {
  if (hit) return 7;
  if (Math.abs(dx) > 0.5) return (dx < 0 ? 2 : 4) + (Math.floor(tick / 5) % 2);
  if (tick % 12 < 3) return 6;
  return Math.floor(tick / 15) % 2;
};

const backdrop = (ctx: CanvasRenderingContext2D, image: HTMLImageElement | undefined, tick: number, breaks: number): void => {
  ctx.fillStyle = "#102532"; ctx.fillRect(0, 0, 360, 640);
  if (image) ctx.drawImage(image, 0, 0, 360, 640);
  // Keep the broadcast visualization inside the studio screen's pixel bezel.
  ctx.fillStyle = breaks ? "#10202d" : "#0a111c";
  ctx.fillRect(81, 38, 198, 112);
  const bars = Math.min(12, 2 + breaks * 2);
  for (let n = 0; n < bars; n += 1) {
    const height = breaks ? 8 + ((n * 7 + Math.floor(tick / 7)) % 26) : 2;
    ctx.fillStyle = n % 3 ? "#428b9a" : "#a36b9e";
    ctx.fillRect(99 + n * 14, 115 - height, 8, height);
  }
  for (let side = 0; side < 2; side += 1) {
    const x = side ? 277 : 63;
    for (let n = 0; n < 3; n += 1) {
      ctx.fillStyle = breaks > n ? (side ? "#d591ce" : teal) : "#28424d";
      ctx.fillRect(x - 1, 12 + n * 7, 2, 5);
    }
  }
};

const drawEnemy = (ctx: CanvasRenderingContext2D, enemy: ShooterEnemySnapshot, point: {x: number; y: number},
  tick: number, image: HTMLImageElement | undefined, hit: boolean, charging: boolean): void => {
  const isBoss = enemy.role === "boss", isEscort = enemy.role === "escort";
  const disabled = (enemy.disabled_ticks ?? 0) > 0;
  const row = isBoss ? (enemy.stage === 3 ? 4 : 0) : enemy.role === "arm" ? 8 : isEscort ? 4 : 0;
  const frame = row + (enemy.health <= 0 ? 3 : hit ? 2 : enemy.exposed || charging ? 1 : 0);
  const height = isBoss ? 88 : isEscort ? 33 : enemy.role === "arm" ? 57 : 52;
  const y = point.y + (disabled ? 2 : 0);
  ctx.save();
  if (disabled) ctx.globalAlpha = 0.58;
  sprite(ctx, image, frame, point.x, y, height, false, row);
  ctx.restore();
  if (disabled) {
    ctx.fillStyle = teal;
    ctx.fillRect(point.x - 5, y - height / 2 - 5, 3, 3);
    ctx.fillRect(point.x + 3, y - height / 2 - 5, 3, 3);
  }
  if (enemy.exposed && !disabled) {
    const box = enemy.hitbox;
    const coreY = y + (box?.core_offset_y ?? (isBoss ? 180 : enemy.role === "arm" ? 80 : 0)) / 10;
    const hw = (box?.core_width ?? 180) / 20;
    const hh = (box?.core_height ?? 160) / 20;
    // Brackets surround the exposed physical core, not the entire sprite.
    ctx.strokeStyle = tick % 12 < 6 ? cream : gold; ctx.lineWidth = 1;
    for (const sign of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(point.x + sign * (hw + 2), coreY - hh - 2);
      ctx.lineTo(point.x + sign * (hw + 5), coreY - hh - 2);
      ctx.lineTo(point.x + sign * (hw + 5), coreY + hh + 2);
      ctx.lineTo(point.x + sign * (hw + 2), coreY + hh + 2); ctx.stroke();
    }
  }
  if (enemy.marks) {
    for (let n = 0; n < enemy.marks; n += 1) {
      ctx.fillStyle = teal; ctx.fillRect(point.x - 5 + n * 4, y - height / 2 - 4, 2, 2);
    }
  }
  if ((isBoss || hit) && enemy.health > 0) {
    const w = isBoss ? 52 : 24, hpY = y + height / 2 + 4;
    ctx.fillStyle = ink; ctx.fillRect(point.x - w / 2 - 1, hpY - 1, w + 2, 4);
    ctx.fillStyle = isBoss ? danger : "#dba88a";
    ctx.fillRect(point.x - w / 2, hpY, Math.ceil(w * enemy.health / enemy.max_health), 2);
  }
};

const projectile = (ctx: CanvasRenderingContext2D, shot: ShooterProjectileSnapshot, x: number, y: number): void => {
  const kind = shot.kind ?? "";
  if (!shot.hostile) {
    if (kind === "reversal_fan") {
      star(ctx, x, y, 4, gold);
      ctx.fillStyle = teal; ctx.fillRect(x - 1, y + 7, 2, 3);
      return;
    }
    const piercing = kind.includes("pierce"), wide = kind.endsWith("wide");
    const width = wide ? 14 : piercing ? 7 : 4, length = piercing ? 26 : 13;
    ctx.fillStyle = ink; ctx.fillRect(x - width / 2 - 1, y - length / 2 - 1, width + 2, length + 2);
    ctx.fillStyle = piercing ? gold : teal; ctx.fillRect(x - width / 2, y - length / 2, width, length);
    ctx.fillStyle = cream; ctx.fillRect(x - 1, y - length / 2, 2, length - 3);
    ctx.fillStyle = piercing ? "#bb8748" : "#3c8c99";
    ctx.fillRect(x - width / 2, y + length / 2 + 2, width, 2);
    return;
  }
  if (kind === "reversal_cut") {
    const width = (shot.width ?? 1050) / 10;
    const left = x - width / 2;
    ctx.fillStyle = ink; ctx.fillRect(left - 2, y - 5, width + 4, 10);
    ctx.fillStyle = "#6a3e5a"; ctx.fillRect(left, y - 3, width, 6);
    for (let n = 0; n < width; n += 10) {
      ctx.fillStyle = danger; ctx.fillRect(left + n, y - 4, 7, 7);
      ctx.fillStyle = "#ffd2da"; ctx.fillRect(left + n, y - 4, 7, 1);
      ctx.fillStyle = "#a13262"; ctx.fillRect(left + n + 3, y + 3, 4, 3);
    }
    return;
  }
  // Small mechanical arrowheads, with a contrasting core and directional tail.
  ctx.save(); ctx.translate(x, y);
  ctx.rotate(-Math.atan2(shot.velocity.x, shot.velocity.y));
  ctx.fillStyle = ink; ctx.fillRect(-4, -7, 8, 11); ctx.fillRect(-2, 4, 4, 4);
  ctx.fillStyle = kind === "reversal_echo" ? "#c386c4" : danger;
  ctx.fillRect(-3, -5, 6, 7); ctx.fillRect(-1, 2, 2, 4);
  ctx.fillStyle = "#ffd2da"; ctx.fillRect(-1, -4, 2, 5);
  ctx.fillStyle = "#783559"; ctx.fillRect(-2, -8, 4, 2);
  ctx.restore();
};

export const drawReversalArena = (ctx: CanvasRenderingContext2D, current: ShooterSnapshot,
  previous: ShooterSnapshot | null, alpha: number, sources: ShooterVisualSources, visuals: ShooterVisuals,
  presentationX: number, tutorial: string | null, impacts: ReadonlyMap<number, ShooterEnemyImpact>): void => {
  ctx.save(); ctx.scale(10, 10); ctx.imageSmoothingEnabled = false;
  const oldPickups = indexShooterPositions(previous?.pickups ?? emptyEntities);
  const oldShots = indexShooterPositions(previous?.enemy_projectiles ?? emptyEntities);
  const oldPlayerShots = indexShooterPositions(previous?.player_projectiles ?? emptyEntities);
  const oldEnemies = indexShooterPositions(previous?.enemies ?? emptyEntities);
  const oldFans = indexShooterPositions(previous?.reversal?.fans ?? emptyEntities);
  const fans = current.reversal?.fans ?? emptyEntities;
  const tick = current.tick;
  backdrop(ctx, visuals.get(sources.background), tick, current.reversal?.breaks ?? 0);
  for (const threat of current.threats) {
    const x = threat.target.x / 10, y = threat.origin.y / 10;
    const width = (threat.width ?? 140) / 10;
    ctx.strokeStyle = "rgba(239,106,136,.6)"; ctx.lineWidth = 1;
    ctx.setLineDash([3, 6]);
    ctx.beginPath(); ctx.moveTo(threat.origin.x / 10, y); ctx.lineTo(x, 532); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(239,106,136,.2)"; ctx.fillRect(x - width / 2, 506, width, 27);
    ctx.fillStyle = danger; ctx.fillRect(x - width / 2, 532, width, 2);
  }
  // Links stay close to the enemy formation, never cross the player area.
  for (const controller of current.enemies.filter((enemy) => enemy.role === "controller" && enemy.health > 0)) {
    for (const escort of current.enemies.filter((enemy) => enemy.role === "escort" && enemy.group_id === controller.group_id && enemy.health > 0)) {
      ctx.strokeStyle = "rgba(193,128,139,.35)"; ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(controller.position.x / 10, controller.position.y / 10 + 22);
      ctx.lineTo(escort.position.x / 10, escort.position.y / 10 - 8); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  for (const pickup of current.pickups) {
    const point = position(pickup, oldPickups, alpha);
    baton(ctx, point.x, point.y, tick + pickup.id);
  }
  for (const shot of current.enemy_projectiles) {
    const point = position(shot, oldShots, alpha);
    projectile(ctx, shot, point.x, point.y);
  }
  for (const shot of current.player_projectiles) {
    const point = position(shot, oldPlayerShots, alpha);
    projectile(ctx, shot, point.x, point.y);
  }
  for (const enemy of current.enemies) {
    if (fans.some((fan) => fan.id === enemy.id)) continue;
    const point = position(enemy, oldEnemies, alpha);
    const charging = current.threats.some((threat) => threat.source_id === enemy.id);
    if (enemy.boss && enemy.stage === 1 && enemy.health > 0) {
      // The alternating cuts originate from attached devices, not empty space.
      ctx.fillStyle = ink; ctx.fillRect(point.x - 53, point.y + 10, 106, 8);
      ctx.fillStyle = "#486071"; ctx.fillRect(point.x - 50, point.y + 12, 100, 3);
      for (const side of [-1, 1]) {
        const x = point.x + side * 50;
        const armed = current.threats.some((threat) => threat.source_id === enemy.id && Math.abs(threat.origin.x / 10 - x) < 2);
        ctx.fillStyle = ink; ctx.fillRect(x - 7, point.y + 8, 14, 14);
        ctx.fillStyle = "#c69b64"; ctx.fillRect(x - 6, point.y + 9, 12, 10);
        ctx.fillStyle = armed ? danger : "#314657"; ctx.fillRect(x - 4, point.y + 13, 8, 6);
        ctx.fillStyle = armed ? cream : "#72848c"; ctx.fillRect(x - 4, point.y + 18, 8, 2);
      }
    }
    drawEnemy(ctx, enemy, point, tick,
      visuals.get(enemy.boss ? sources.boss ?? "" : sources.enemies.equipment ?? ""),
      (impacts.get(enemy.id)?.untilTick ?? -1) >= tick, charging);
  }
  for (const impact of Array.from(impacts.values())) {
    if (!impact.destroyed || impact.untilTick < tick || current.enemies.some((enemy) => enemy.id === impact.enemyID)
      || fans.some((fan) => fan.id === impact.enemyID)) continue;
    const row = impact.boss ? 0 : impact.role === "arm" ? 8 : impact.role === "escort" ? 4 : 0;
    const height = impact.boss ? 88 : impact.role === "escort" ? 33 : impact.role === "arm" ? 57 : 52;
    ctx.globalAlpha = Math.min(1, (impact.untilTick - tick) / 5);
    sprite(ctx, visuals.get(impact.boss ? sources.boss ?? "" : sources.enemies.equipment ?? ""),
      row + 3, impact.x / 10, impact.y / 10, height, false, row);
    ctx.globalAlpha = 1;
  }
  for (const fan of fans) {
    drawFan(ctx, fan, position(fan, oldFans, alpha), visuals.get(sources.enemies.equipment ?? ""));
  }
  for (const effect of current.effects) {
    const x = Math.round(effect.position.x / 10), y = Math.round(effect.position.y / 10);
    if (["route_mark", "support_powerup_support"].includes(effect.kind)) continue;
    const large = effect.kind === "core_break" || effect.kind === "chain_blast";
    // Rescue feedback lives at the targets; no beams tether the player to them.
    if (effect.kind === "chain_launch") continue;
    if (effect.kind === "reversal_flip") {
      star(ctx, x, y, 4 + Math.floor(effect.ticks / 3), gold); continue;
    }
    if (!["core_break", "chain_blast", "core_hit", "reversal_hit"].includes(effect.kind)) continue;
    const age = (large ? 24 : 8) - effect.ticks;
    ctx.globalAlpha = Math.min(1, effect.ticks / 6);
    star(ctx, x, y, large ? 7 : 3, large ? gold : cream);
    for (let n = 0; n < (large ? 8 : 4); n += 1) {
      const angle = n * Math.PI / (large ? 4 : 2);
      const radius = (large ? 10 : 3) + age * (large ? 1.6 : .8);
      ctx.fillStyle = n % 2 ? gold : teal;
      ctx.fillRect(Math.round(x + Math.cos(angle) * radius), Math.round(y + Math.sin(angle) * radius), large ? 3 : 2, large ? 3 : 2);
    }
    ctx.globalAlpha = 1;
  }
  const playerX = Math.round(presentationX / 10);
  const dx = current.player_x - (previous?.player_x ?? current.player_x);
  const hurt = current.invulnerable_ticks > 42;
  const frame = reversalPlayerFrame(tick, dx, hurt);
  ctx.fillStyle = "rgba(3,12,20,.6)"; ctx.fillRect(playerX - 15, 548, 30, 3);
  ctx.globalAlpha = current.invulnerable_ticks > 0 && tick % 6 < 2 ? .45 : 1;
  sprite(ctx, visuals.get(sources.player), frame, playerX, 548, 59, true);
  ctx.globalAlpha = 1;
  if (tutorial) {
    ctx.fillStyle = "rgba(10,25,35,.84)"; ctx.fillRect(34, 573, 292, 21);
    ctx.fillStyle = cream; ctx.font = "10px monospace"; ctx.textAlign = "center";
    ctx.fillText(tutorial, 180, 587, 282);
  }
  ctx.restore();
};
