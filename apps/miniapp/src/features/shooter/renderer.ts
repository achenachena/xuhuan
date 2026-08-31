import { PLAYER_Y, SHOOTER_HEIGHT, SHOOTER_WIDTH, clamp } from "@/features/shooter/constants";
import type {
  ShooterEffectSnapshot,
  ShooterEnemySnapshot,
  ShooterGateOption,
  ShooterPickupSnapshot,
  ShooterProjectileSnapshot,
  ShooterSnapshot,
  ShooterThreatSnapshot,
} from "@/features/shooter/types";
import type { ShooterContent, ShooterGameRun } from "@/lib/api/types";

const chassisAssets = {
  "spam-bot": "/game/v4/enemies/spam-bot.webp",
  "clip-cutter": "/game/v4/enemies/clip-cutter.webp",
  "caption-blob": "/game/v4/enemies/caption-blob.webp",
  "black-screen-ghost": "/game/v4/enemies/black-screen-ghost.webp",
  "gift-thief": "/game/v4/enemies/gift-thief.webp",
  "censor-frame": "/game/v4/enemies/censor-frame.webp",
} as const;
const pickupAssets = [
  "/game/v4/pickups/support-cyan.webp",
  "/game/v4/pickups/support-pink.webp",
  "/game/v4/pickups/support-gold.webp",
] as const;

export type ShooterVisualSources = {
  readonly background: string;
  readonly player: string;
  readonly enemies: Readonly<Record<string, string>>;
  readonly companions: Readonly<Record<string, string>>;
  readonly boss?: string;
  readonly pickups: readonly string[];
};

export type ShooterVisuals = ReadonlyMap<string, HTMLImageElement>;
const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

const loadImage = (source: string): Promise<HTMLImageElement | null> => {
  const cached = imageCache.get(source);
  if (cached) return cached;
  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    if (typeof Image === "undefined") return resolve(null);
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = source;
  });
  imageCache.set(source, promise);
  return promise;
};

export const resolveShooterVisualSources = (
  content: ShooterContent,
  run: ShooterGameRun,
): ShooterVisualSources => {
  const chapter = content.chapters.find((entry) => entry.id === run.state.chapter_slug);
  const character = content.characters.find((entry) => entry.id === run.state.character_slug);
  const bossID = run.state.segment?.boss_id;
  return {
    background: run.state.segment?.background_url ?? chapter?.background_url ?? `/game/v4/backgrounds/${run.state.chapter_slug}.webp`,
    player: character?.sprite_url ?? `/game/v4/players/${run.state.character_slug}.webp`,
    enemies: chassisAssets,
    companions: Object.fromEntries(content.companions.map((entry) => [entry.id, entry.portrait_url])),
    ...(bossID ? { boss: `/game/v4/bosses/${bossID}.webp` } : {}),
    pickups: pickupAssets,
  };
};

export const preloadShooterVisuals = async (sources: ShooterVisualSources): Promise<ShooterVisuals> => {
  const urls = new Set([sources.background, sources.player, ...Object.values(sources.enemies), ...Object.values(sources.companions), ...sources.pickups, ...(sources.boss ? [sources.boss] : [])]);
  const loaded = await Promise.all(Array.from(urls, async (source) => [source, await loadImage(source)] as const));
  return new Map(loaded.filter((entry): entry is readonly [string, HTMLImageElement] => entry[1] !== null));
};

const prepare = (canvas: HTMLCanvasElement | null): CanvasRenderingContext2D | null => {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.imageSmoothingEnabled = false;
  context.setTransform(width / SHOOTER_WIDTH, 0, 0, height / SHOOTER_HEIGHT, 0, 0);
  context.clearRect(0, 0, SHOOTER_WIDTH, SHOOTER_HEIGHT);
  return context;
};

const drawSprite = (context: CanvasRenderingContext2D, image: HTMLImageElement | undefined, x: number, y: number, size: number, fallback: string): void => {
  context.save();
  if (image) context.drawImage(image, Math.round(x - size / 2), Math.round(y - size / 2), size, size);
  else {
    context.fillStyle = fallback;
    context.shadowColor = fallback;
    context.shadowBlur = 70;
    context.fillRect(x - size / 3, y - size / 3, (size * 2) / 3, (size * 2) / 3);
  }
  context.restore();
};

const entityPosition = <T extends { readonly id: number; readonly position: { readonly x: number; readonly y: number } }>(entity: T, previous: readonly T[], alpha: number) => {
  const prior = previous.find((entry) => entry.id === entity.id);
  return prior
    ? { x: Math.round(prior.position.x + (entity.position.x - prior.position.x) * alpha), y: Math.round(prior.position.y + (entity.position.y - prior.position.y) * alpha) }
    : entity.position;
};

const drawThreat = (context: CanvasRenderingContext2D, threat: ShooterThreatSnapshot): void => {
  const urgency = 1 - clamp(threat.ticks_remaining / 30, 0, 1);
  context.save();
  context.globalAlpha = 0.22 + urgency * 0.48;
  context.strokeStyle = "#fb7185";
  context.fillStyle = "rgba(251,113,133,.12)";
  context.setLineDash([70, 45]);
  if (threat.kind === "censor_gap") {
    const gapWidth = Math.max(260, threat.width ?? 260);
    context.fillRect(0, PLAYER_Y - 320, Math.max(0, threat.target.x - gapWidth / 2), 640);
    context.fillRect(
      threat.target.x + gapWidth / 2,
      PLAYER_Y - 320,
      Math.max(0, SHOOTER_WIDTH - threat.target.x - gapWidth / 2),
      640,
    );
    context.strokeStyle = "#67e8f9";
    context.lineWidth = 18;
    context.strokeRect(threat.target.x - gapWidth / 2, PLAYER_Y - 330, gapWidth, 660);
  } else if (
    ["horizontal_cut", "caption_block", "black_wall"].includes(threat.kind)
  ) {
    const width = Math.max(180, threat.width ?? 180);
    context.lineWidth = 18;
    context.fillRect(threat.target.x - width / 2, threat.origin.y, width, PLAYER_Y - threat.origin.y);
    context.strokeRect(threat.target.x - width / 2, PLAYER_Y - 220, width, 440);
  } else if (threat.radius) {
    context.lineWidth = 18;
    context.beginPath();
    context.arc(threat.origin.x, threat.origin.y, threat.radius, 0, Math.PI * 2);
    context.stroke();
  } else {
    context.lineWidth = Math.max(12, threat.width ?? 20);
    context.beginPath();
    context.moveTo(threat.origin.x, threat.origin.y);
    context.lineTo(threat.target.x, threat.target.y);
    context.stroke();
  }
  context.restore();
};

const drawEnemy = (context: CanvasRenderingContext2D, enemy: ShooterEnemySnapshot, previous: readonly ShooterEnemySnapshot[], alpha: number, sources: ShooterVisualSources, visuals: ShooterVisuals): void => {
  const point = entityPosition(enemy, previous, alpha);
  const source = enemy.boss ? sources.boss : sources.enemies[enemy.chassis];
  drawSprite(context, source ? visuals.get(source) : undefined, point.x, point.y, enemy.boss ? 900 : 460, enemy.boss ? "#f472b6" : "#fb7185");
  if (enemy.marks) {
    context.fillStyle = "#67e8f9";
    context.font = "bold 120px monospace";
    context.textAlign = "center";
    context.fillText("◆".repeat(enemy.marks), point.x, point.y - 270);
  }
  if (enemy.boss) {
    context.fillStyle = "rgba(2,6,23,.85)";
    context.fillRect(850, point.y + 470, 1_900, 74);
    context.fillStyle = "#f472b6";
    context.fillRect(862, point.y + 482, Math.round(1_876 * clamp(enemy.health / Math.max(1, enemy.max_health), 0, 1)), 50);
  }
};

const drawProjectile = (context: CanvasRenderingContext2D, projectile: ShooterProjectileSnapshot, previous: readonly ShooterProjectileSnapshot[], alpha: number): void => {
  const point = entityPosition(projectile, previous, alpha);
  context.save();
  const color = projectile.hostile ? "#fb7185" : "#67e8f9";
  context.fillStyle = color;
  context.shadowColor = color;
  context.shadowBlur = 42;
  const radius = Math.max(42, projectile.radius ?? 0);
  const width = projectile.width ?? 0;
  if (projectile.hostile && width > 0) {
    context.globalAlpha = projectile.kind === "black_wall" ? 0.86 : 0.68;
    context.fillStyle = projectile.kind === "black_wall" ? "#3b164f" : color;
    context.fillRect(point.x - width / 2, point.y - radius, width, radius * 2);
    context.strokeStyle = projectile.kind === "black_wall" ? "#e879f9" : "#fecdd3";
    context.lineWidth = 18;
    context.strokeRect(point.x - width / 2, point.y - radius, width, radius * 2);
    if ((projectile.health ?? 0) > 0) {
      context.fillStyle = "#67e8f9";
      context.fillRect(point.x - width / 2, point.y - radius - 34, width, 18);
    }
  } else if (projectile.hostile) {
    context.translate(point.x, point.y);
    context.rotate(Math.PI / 4);
    context.fillRect(-radius, -radius, radius * 2, radius * 2);
  } else context.fillRect(point.x - 23, point.y - 95, 46, 175);
  context.restore();
};

const drawPickup = (context: CanvasRenderingContext2D, pickup: ShooterPickupSnapshot, previous: readonly ShooterPickupSnapshot[], alpha: number, sources: ShooterVisualSources, visuals: ShooterVisuals): void => {
  const point = entityPosition(pickup, previous, alpha);
  const source = sources.pickups[(pickup.id - 1) % sources.pickups.length]!;
  drawSprite(context, visuals.get(source), point.x, point.y, 300, "#fde68a");
  context.strokeStyle = ["#67e8f9", "#f9a8d4", "#fde68a"][(pickup.id - 1) % 3]!;
  context.globalAlpha = 0.55;
  context.lineWidth = 14;
  context.beginPath();
  context.arc(point.x, point.y, 170, 0, Math.PI * 2);
  context.stroke();
  context.globalAlpha = 1;
};

const drawEffect = (context: CanvasRenderingContext2D, effect: ShooterEffectSnapshot): void => {
  context.save();
  context.strokeStyle = effect.kind.includes("memory") ? "#fde68a" : effect.kind.includes("subtitle") ? "#f9a8d4" : "#67e8f9";
  context.globalAlpha = clamp(effect.ticks / 45, 0.12, 0.85);
  context.lineWidth = 16;
  context.beginPath();
  context.arc(effect.position.x, effect.position.y, 80 + Math.max(0, 45 - effect.ticks) * 6, 0, Math.PI * 2);
  context.stroke();
  context.restore();
};

const drawBackground = (context: CanvasRenderingContext2D, source: string, visuals: ShooterVisuals, tick: number): void => {
  const image = visuals.get(source);
  if (image) context.drawImage(image, 0, 0, SHOOTER_WIDTH, SHOOTER_HEIGHT);
  else {
    context.fillStyle = "#030713";
    context.fillRect(0, 0, SHOOTER_WIDTH, SHOOTER_HEIGHT);
    context.strokeStyle = "rgba(34,211,238,.18)";
    context.lineWidth = 12;
    for (let y = -320 + (tick * 8) % 320; y < SHOOTER_HEIGHT; y += 320) {
      context.beginPath(); context.moveTo(0, y); context.lineTo(SHOOTER_WIDTH, y); context.stroke();
    }
  }
  const shade = context.createLinearGradient(0, 0, 0, SHOOTER_HEIGHT);
  shade.addColorStop(0, "rgba(2,6,23,.5)"); shade.addColorStop(0.5, "rgba(2,6,23,.05)"); shade.addColorStop(1, "rgba(2,6,23,.45)");
  context.fillStyle = shade; context.fillRect(0, 0, SHOOTER_WIDTH, SHOOTER_HEIGHT);
};

export const drawShooterArena = (
  canvas: HTMLCanvasElement | null,
  current: ShooterSnapshot,
  previous: ShooterSnapshot | null,
  alpha: number,
  sources: ShooterVisualSources,
  visuals: ShooterVisuals,
  tutorial: string | null,
  presentationX: number,
): void => {
  const context = prepare(canvas);
  if (!context) return;
  drawBackground(context, sources.background, visuals, current.tick);
  for (const threat of current.threats) drawThreat(context, threat);
  for (const pickup of current.pickups) drawPickup(context, pickup, previous?.pickups ?? [], alpha, sources, visuals);
  for (const shot of current.enemy_projectiles) drawProjectile(context, shot, previous?.enemy_projectiles ?? [], alpha);
  for (const shot of current.player_projectiles) drawProjectile(context, shot, previous?.player_projectiles ?? [], alpha);
  for (const enemy of current.enemies) drawEnemy(context, enemy, previous?.enemies ?? [], alpha, sources, visuals);
  for (const effect of current.effects) drawEffect(context, effect);
  const playerX = presentationX || current.player_x;
  if (current.shield > 0) {
    context.strokeStyle = "#93c5fd"; context.lineWidth = 20; context.globalAlpha = 0.65;
    context.beginPath(); context.arc(playerX, PLAYER_Y, 235, 0, Math.PI * 2); context.stroke(); context.globalAlpha = 1;
  }
  context.globalAlpha = current.invulnerable_ticks > 0 && current.tick % 4 < 2 ? 0.35 : 1;
  drawSprite(context, visuals.get(sources.player), playerX, PLAYER_Y, 540, "#67e8f9");
  context.globalAlpha = 1;
  if (tutorial) {
    context.fillStyle = "rgba(2,6,23,.82)";
    context.fillRect(390, 90, 2_820, 230);
    context.strokeStyle = "rgba(103,232,249,.55)";
    context.lineWidth = 12;
    context.strokeRect(390, 90, 2_820, 230);
    context.fillStyle = "#e0f2fe";
    context.font = "bold 82px monospace";
    context.textAlign = "center";
    context.fillText(tutorial, SHOOTER_WIDTH / 2, 238, 2_620);
  }
};

const drawPixelHeart = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
): void => {
  const unit = size / 5;
  context.fillStyle = color;
  for (const [column, row] of [
    [1, 0],
    [3, 0],
    [0, 1],
    [1, 1],
    [2, 1],
    [3, 1],
    [4, 1],
    [1, 2],
    [2, 2],
    [3, 2],
    [2, 3],
  ]) {
    context.fillRect(
      x + (column - 2.5) * unit,
      y + (row - 1.5) * unit,
      unit,
      unit,
    );
  }
};

const drawWeaponPreview = (
  context: CanvasRenderingContext2D,
  option: ShooterGateOption,
  x: number,
  y: number,
  tick: number,
): void => {
  const phase = (tick % 42) / 42;
  const travel = phase * 720;
  context.save();
  context.strokeStyle = "rgba(103,232,249,.35)";
  context.fillStyle = "#67e8f9";
  context.shadowColor = "#22d3ee";
  context.shadowBlur = 45;
  context.lineWidth = 28;

  if (option.behavior === "pickup_magnet") {
    for (let index = 0; index < 3; index += 1) {
      const angle = phase * Math.PI * 2 + (index * Math.PI * 2) / 3;
      const radius = 350 * (1 - phase * 0.75);
      context.fillRect(
        x + Math.cos(angle) * radius - 34,
        y + Math.sin(angle) * radius - 34,
        68,
        68,
      );
    }
    context.strokeRect(x - 100, y - 100, 200, 200);
    context.restore();
    return;
  }

  if (option.behavior === "guard_on_special") {
    context.beginPath();
    context.arc(x, y, 250 + Math.sin(phase * Math.PI * 2) * 45, 0, Math.PI * 2);
    context.stroke();
    drawPixelHeart(context, x, y, 310, "#fde68a");
    context.restore();
    return;
  }

  if (option.behavior === "recovery_drop") {
    drawPixelHeart(context, x, y - 320 + phase * 500, 260, "#fb7185");
    context.strokeRect(x - 190, y + 280, 380, 80);
    context.fillRect(x - 175, y + 295, 180 + phase * 160, 50);
    context.restore();
    return;
  }

  if (option.behavior === "low_health_power") {
    drawPixelHeart(context, x - 250, y + 170, 210, "#fb7185");
    const radius = 180 + phase * 300;
    context.beginPath();
    context.arc(x + 130, y - 80, radius, -0.75, 0.75);
    context.stroke();
    context.restore();
    return;
  }

  const lanes =
    option.behavior === "twin_shot"
      ? [-115, 115]
      : option.behavior === "spread_shot"
        ? [-1, 0, 1]
        : [0];
  for (const lane of lanes) {
    const spread = option.behavior === "spread_shot" ? lane * travel * 0.32 : lane;
    const shotX = x + spread;
    const shotY = y + 330 - travel;
    context.fillRect(shotX - 30, shotY - 100, 60, option.behavior === "piercing_shot" ? 260 : 170);
  }
  if (option.behavior === "echo_volley") {
    context.globalAlpha = 0.35;
    context.fillRect(x - 35, y + 560 - travel, 70, 170);
  }
  if (option.behavior === "boss_break") {
    context.strokeStyle = "#f9a8d4";
    context.beginPath();
    context.arc(x, y - 260, 260, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = "#fde68a";
    context.beginPath();
    context.moveTo(x - 30, y - 520);
    context.lineTo(x + 75, y - 300);
    context.lineTo(x - 55, y - 120);
    context.stroke();
  }
  context.fillStyle = "#f8fafc";
  context.fillRect(x - 115, y + 360, 230, 95);
  context.fillStyle = "#67e8f9";
  context.fillRect(x - 52, y + 285, 104, 110);
  context.restore();
};

const drawCompanionPreview = (
  context: CanvasRenderingContext2D,
  option: ShooterGateOption,
  image: HTMLImageElement | undefined,
  x: number,
  y: number,
  tick: number,
): void => {
  const phase = (tick % 54) / 54;
  drawSprite(context, image, x - 120, y + 60, 590, "#f9a8d4");
  context.save();
  context.strokeStyle = "rgba(249,168,212,.65)";
  context.lineWidth = 24;
  context.beginPath();
  context.arc(x - 120, y + 60, 360 + Math.sin(phase * Math.PI * 2) * 35, 0, Math.PI * 2);
  context.stroke();
  context.fillStyle = "#67e8f9";
  context.shadowColor = "#67e8f9";
  context.shadowBlur = 45;
  const shotY = y + 250 - phase * 760;
  context.fillRect(x + 290, shotY, 55, 180);
  context.fillRect(x + 410, shotY - 120, 55, 180);
  context.restore();
};

const drawGatePortal = (
  context: CanvasRenderingContext2D,
  option: ShooterGateOption,
  index: number,
  active: boolean,
  dwellProgress: number,
  tick: number,
  visuals: ShooterVisuals,
): void => {
  const x = index === 0 ? 990 : 2_610;
  const left = x - 650;
  const right = x + 650;
  const top = 900;
  const bottom = 4_650;
  const pulse = 0.18 + (Math.sin((tick + index * 12) / 7) + 1) * 0.04;

  context.save();
  context.beginPath();
  context.moveTo(left, bottom);
  context.lineTo(left, top + 420);
  context.lineTo(left + 300, top);
  context.lineTo(right - 300, top);
  context.lineTo(right, top + 420);
  context.lineTo(right, bottom);
  context.closePath();
  context.fillStyle = active ? "rgba(8,47,73,.78)" : "rgba(2,13,29,.82)";
  context.fill();
  context.strokeStyle = active ? "#fde68a" : "#67e8f9";
  context.lineWidth = active ? 34 : 18;
  context.shadowColor = active ? "#fde68a" : "#22d3ee";
  context.shadowBlur = active ? 85 : 36;
  context.stroke();

  context.globalAlpha = pulse;
  context.fillStyle = active ? "#fde68a" : "#67e8f9";
  for (let row = 0; row < 7; row += 1) {
    context.fillRect(left + 85, top + 620 + row * 430, 1_130, 80);
  }
  context.globalAlpha = 1;

  const portrait = option.portraitURL ? visuals.get(option.portraitURL) : undefined;
  if (option.kind === "companion") {
    drawCompanionPreview(context, option, portrait, x, 2_120, tick);
  } else {
    drawWeaponPreview(context, option, x, 2_170, tick);
  }

  context.shadowBlur = 0;
  context.fillStyle = "rgba(15,23,42,.9)";
  context.fillRect(x - 500, 4_190, 1_000, 54);
  context.fillStyle = active ? "#fde68a" : "rgba(103,232,249,.35)";
  context.fillRect(
    x - 500,
    4_190,
    1_000 * (active ? clamp(dwellProgress, 0, 1) : 0.08),
    54,
  );
  context.restore();
};

export const drawShooterGates = (
  canvas: HTMLCanvasElement | null,
  sources: ShooterVisualSources,
  visuals: ShooterVisuals,
  options: readonly ShooterGateOption[],
  selectedIndex: number | null,
  dwellProgress: number,
  instruction: string,
  animationTick: number,
  playerX: number,
): void => {
  const context = prepare(canvas);
  if (!context) return;
  drawBackground(context, sources.background, visuals, animationTick);
  context.fillStyle = "rgba(2,6,23,.48)";
  context.fillRect(0, 0, SHOOTER_WIDTH, SHOOTER_HEIGHT);
  options
    .slice(0, 2)
    .forEach((option, index) =>
      drawGatePortal(
        context,
        option,
        index,
        selectedIndex === index,
        dwellProgress,
        animationTick,
        visuals,
      ),
    );

  context.fillStyle = "rgba(2,6,23,.82)";
  context.fillRect(520, 120, 2_560, 230);
  context.strokeStyle = "rgba(103,232,249,.5)";
  context.lineWidth = 12;
  context.strokeRect(520, 120, 2_560, 230);
  context.fillStyle = "#e0f2fe";
  context.font = "bold 88px monospace";
  context.textAlign = "center";
  context.fillText(instruction, SHOOTER_WIDTH / 2, 268, 2_320);

  context.globalAlpha = 0.9;
  drawSprite(context, visuals.get(sources.player), playerX, PLAYER_Y, 510, "#67e8f9");
  context.globalAlpha = 1;
};
