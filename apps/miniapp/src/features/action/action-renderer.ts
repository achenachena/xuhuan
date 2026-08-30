import type {
  ActionConfig,
  ActionEnemySnapshot,
  ActionProjectileSnapshot,
  ActionSignalSnapshot,
  ActionSnapshot,
  ActionVec,
  SignalType,
} from "@/features/action/action-types";
import { ACTION_DIRECTIONS, nearTravelPath } from "@/features/action/action-math";
import {
  ACTION_HEIGHT,
  ACTION_TPS,
  ACTION_WIDTH,
} from "@/features/action/action-types";
import type { APIGameContent, APIGameRun } from "@/lib/api/client";

type ImageMap = ReadonlyMap<string, HTMLImageElement>;

export type ActionVisualSources = {
  readonly background: string;
  readonly player: string;
  readonly enemies: Readonly<Record<string, string>>;
  readonly signals: Readonly<Record<SignalType, string>>;
};

export type ActionVisuals = {
  readonly background: HTMLImageElement | null;
  readonly player: HTMLImageElement | null;
  readonly enemies: ImageMap;
  readonly signals: ReadonlyMap<SignalType, HTMLImageElement>;
};

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();
const MAX_CACHED_ACTION_IMAGES = 18;

const cacheImage = (
  source: string,
  image: Promise<HTMLImageElement | null>,
): void => {
  // A complete campaign touches every chapter, but a Telegram WebView should
  // only retain the current encounter and a small warm set. The browser HTTP
  // cache still makes an evicted image cheap to load again.
  imageCache.delete(source);
  imageCache.set(source, image);
  while (imageCache.size > MAX_CACHED_ACTION_IMAGES) {
    const oldest = imageCache.keys().next().value;
    if (typeof oldest !== "string") break;
    imageCache.delete(oldest);
  }
};

const loadImage = (source: string): Promise<HTMLImageElement | null> => {
  const cached = imageCache.get(source);
  if (cached) {
    cacheImage(source, cached);
    return cached;
  }
  const pending = new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => {
      imageCache.delete(source);
      resolve(null);
    };
    image.src = source;
  });
  cacheImage(source, pending);
  return pending;
};

export const resolveActionVisualSources = (
  content: APIGameContent,
  run: APIGameRun,
  config: ActionConfig,
): ActionVisualSources => {
  const chapter = content.chapters.find(
    (candidate) => candidate.slug === run.state.chapter_slug,
  );
  const character = content.characters.find(
    (candidate) => candidate.slug === run.state.character_slug,
  );
  return {
    background:
      chapter?.background_url ?? "/game/v3/backgrounds/seventh-dock.webp",
    player: character?.model_url ?? "/game/v3/players/nana7mi.webp",
    enemies: Object.fromEntries(
      config.enemies.map((enemy) => [enemy.slug, enemy.imageUrl]),
    ),
    signals: {
      surge: "/game/v3/pickups/surge.webp",
      guard: "/game/v3/pickups/guard.webp",
      echo: "/game/v3/pickups/echo.webp",
    },
  };
};

export const preloadActionVisuals = async (
  sources: ActionVisualSources = {
    background: "/game/v3/backgrounds/seventh-dock.webp",
    player: "/game/v3/players/nana7mi.webp",
    enemies: {},
    signals: {
      surge: "/game/v3/pickups/surge.webp",
      guard: "/game/v3/pickups/guard.webp",
      echo: "/game/v3/pickups/echo.webp",
    },
  },
): Promise<ActionVisuals> => {
  const [background, player, enemyEntries, signalEntries] = await Promise.all([
    loadImage(sources.background),
    loadImage(sources.player),
    Promise.all(
      Object.entries(sources.enemies).map(
        async ([slug, source]) => [slug, await loadImage(source)] as const,
      ),
    ),
    Promise.all(
      Object.entries(sources.signals).map(
        async ([kind, source]) =>
          [kind as SignalType, await loadImage(source)] as const,
      ),
    ),
  ]);
  return {
    background,
    player,
    enemies: new Map(
      enemyEntries.filter(
        (entry): entry is readonly [string, HTMLImageElement] =>
          entry[1] !== null,
      ),
    ),
    signals: new Map(
      signalEntries.filter(
        (entry): entry is readonly [SignalType, HTMLImageElement] =>
          entry[1] !== null,
      ),
    ),
  };
};

export const drawActionArena = (
  canvas: HTMLCanvasElement | null,
  snapshot: ActionSnapshot,
  previous: ActionSnapshot | null,
  alpha: number,
  config: ActionConfig,
  visuals: ActionVisuals | null,
  warpAimDirection: number | null = null,
): void => {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = "#02050e";
  context.fillRect(0, 0, width, height);
  const scale = Math.min(width / ACTION_WIDTH, height / ACTION_HEIGHT);
  context.setTransform(
    scale,
    0,
    0,
    scale,
    (width - ACTION_WIDTH * scale) / 2,
    (height - ACTION_HEIGHT * scale) / 2,
  );
  context.imageSmoothingEnabled = false;

  drawBackground(context, snapshot, config, visuals?.background ?? null);
  drawObjectiveZone(context, snapshot);
  drawSignalGuide(context, snapshot);
  for (const signal of snapshot.signals) {
    drawSignal(context, signal, snapshot, visuals?.signals.get(signal.type));
  }
  drawKitState(context, snapshot);

  const previousEnemies = new Map(
    (previous?.enemies ?? []).map((enemy) => [enemy.id, enemy]),
  );
  const previousProjectiles = new Map(
    (previous?.projectiles ?? []).map((projectile) => [projectile.id, projectile]),
  );
  const previousFriendlyShots = new Map(
    (previous?.friendlyShots ?? []).map((shot) => [shot.id, shot]),
  );
  for (const enemy of snapshot.enemies) {
    drawEnemy(
      context,
      enemy,
      interpolate(previousEnemies.get(enemy.id)?.position, enemy.position, alpha),
      snapshot.tick,
      visuals?.enemies.get(enemy.slug),
    );
  }
  drawCombatFeedback(context, snapshot, previous, previousEnemies);
  drawAutoAttack(context, snapshot, previousEnemies, alpha, config);
  for (const projectile of snapshot.projectiles) {
    drawProjectile(
      context,
      projectile,
      interpolate(
        previousProjectiles.get(projectile.id)?.position,
        projectile.position,
        alpha,
      ),
    );
  }
  for (const shot of snapshot.friendlyShots) {
    drawFriendlyShot(
      context,
      interpolate(
        previousFriendlyShots.get(shot.id)?.position,
        shot.position,
        alpha,
      ),
      snapshot.tick,
    );
  }
  drawWarpTrail(context, previous?.player, snapshot.player, snapshot);
  drawWarpAim(context, snapshot, warpAimDirection);
  drawPlayer(
    context,
    snapshot.player,
    snapshot,
    visuals?.player ?? null,
  );
  drawScreenEffects(context, snapshot, config);
};

const drawBackground = (
  context: CanvasRenderingContext2D,
  snapshot: ActionSnapshot,
  config: ActionConfig,
  background: HTMLImageElement | null,
): void => {
  if (background) {
    context.drawImage(background, 0, 0, ACTION_WIDTH, ACTION_HEIGHT);
  } else {
    const fallback = context.createLinearGradient(0, 0, 0, ACTION_HEIGHT);
    fallback.addColorStop(0, "#102652");
    fallback.addColorStop(0.55, "#080f25");
    fallback.addColorStop(1, "#02050e");
    context.fillStyle = fallback;
    context.fillRect(0, 0, ACTION_WIDTH, ACTION_HEIGHT);
  }
  context.fillStyle = "rgba(2,6,23,.24)";
  context.fillRect(0, 0, ACTION_WIDTH, ACTION_HEIGHT);
  const vignette = context.createLinearGradient(0, 0, ACTION_WIDTH, 0);
  vignette.addColorStop(0, "rgba(2,6,23,.76)");
  vignette.addColorStop(0.2, "rgba(2,6,23,.03)");
  vignette.addColorStop(0.8, "rgba(2,6,23,.03)");
  vignette.addColorStop(1, "rgba(2,6,23,.76)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, ACTION_WIDTH, ACTION_HEIGHT);
  context.fillStyle = config.hazards.includes("distortion_rain")
    ? "rgba(217,70,239,.07)"
    : "rgba(103,232,249,.035)";
  const scanOffset = (snapshot.tick * 7) % 160;
  for (let y = scanOffset; y < ACTION_HEIGHT; y += 160) {
    context.fillRect(0, y, ACTION_WIDTH, 9);
  }
  if (config.hazards.includes("narrow_arena")) {
    context.fillStyle = "rgba(251,113,133,.11)";
    context.fillRect(0, 0, 620, ACTION_HEIGHT);
    context.fillRect(ACTION_WIDTH - 620, 0, 620, ACTION_HEIGHT);
    context.strokeStyle = "rgba(251,113,133,.44)";
    context.lineWidth = 18;
    context.setLineDash([48, 32]);
    for (const x of [620, ACTION_WIDTH - 620]) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, ACTION_HEIGHT);
      context.stroke();
    }
    context.setLineDash([]);
  }
};

const drawObjectiveZone = (
  context: CanvasRenderingContext2D,
  snapshot: ActionSnapshot,
): void => {
  if (snapshot.objective.kind !== "stabilize") return;
  const pulse = Math.sin(snapshot.tick / 10) * 35;
  context.save();
  context.strokeStyle = "rgba(110,231,183,.7)";
  context.fillStyle = "rgba(16,185,129,.08)";
  context.lineWidth = 22;
  context.setLineDash([42, 28]);
  context.beginPath();
  context.arc(ACTION_WIDTH / 2, ACTION_HEIGHT / 2, 820 + pulse, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.restore();
};

const signalColor: Readonly<Record<SignalType, string>> = {
  surge: "#67e8f9",
  guard: "#86efac",
  echo: "#c4b5fd",
};

const drawSignalGuide = (
  context: CanvasRenderingContext2D,
  snapshot: ActionSnapshot,
): void => {
  if (snapshot.signals.length === 0) return;
  const nearest = [...snapshot.signals].sort(
    (left, right) =>
      distanceSquared(snapshot.player, left.position) -
      distanceSquared(snapshot.player, right.position),
  )[0]!;
  context.save();
  context.strokeStyle = `${signalColor[nearest.type]}55`;
  context.lineWidth = 10;
  context.setLineDash([30, 40]);
  context.beginPath();
  context.moveTo(snapshot.player.x, snapshot.player.y);
  context.lineTo(nearest.position.x, nearest.position.y);
  context.stroke();
  context.restore();
};

const drawSignal = (
  context: CanvasRenderingContext2D,
  signal: ActionSignalSnapshot,
  snapshot: ActionSnapshot,
  sprite?: HTMLImageElement,
): void => {
  const pulse = Math.round(Math.sin((snapshot.tick + signal.id * 11) / 7) * 20);
  const color = signalColor[signal.type];
  context.save();
  context.translate(signal.position.x, signal.position.y);
  context.shadowColor = color;
  context.shadowBlur = 55;
  context.fillStyle = `${color}24`;
  context.beginPath();
  context.arc(0, 0, 245 + pulse, 0, Math.PI * 2);
  context.fill();
  context.shadowBlur = 0;
  context.strokeStyle = `${color}aa`;
  context.lineWidth = 14;
  context.setLineDash([38, 25]);
  context.beginPath();
  context.arc(0, 0, 215 + pulse, 0, Math.PI * 2);
  context.stroke();
  context.setLineDash([]);
  if (sprite) {
    const size = 330 + pulse;
    context.drawImage(sprite, -size / 2, -size / 2, size, size);
  } else {
    context.fillStyle = color;
    context.rotate(Math.PI / 4);
    context.fillRect(-82, -82, 164, 164);
  }
  context.restore();
};

const drawKitState = (
  context: CanvasRenderingContext2D,
  snapshot: ActionSnapshot,
): void => {
  context.save();
  for (const zone of snapshot.safeZones) {
    const alpha = Math.min(0.28, zone.ticks / 120);
    context.fillStyle = `rgba(134,239,172,${alpha})`;
    context.strokeStyle = `rgba(167,243,208,${Math.min(0.85, alpha * 3)})`;
    context.lineWidth = 16;
    context.beginPath();
    context.arc(zone.position.x, zone.position.y, zone.radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }
  if (snapshot.signalWaypoints.length > 1) {
    context.strokeStyle = "rgba(103,232,249,.46)";
    context.lineWidth = 22;
    context.setLineDash([42, 28]);
    context.beginPath();
    snapshot.signalWaypoints.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.stroke();
    context.setLineDash([]);
  }
  for (const bloom of snapshot.blooms) {
    context.save();
    context.translate(bloom.x, bloom.y);
    context.fillStyle = "rgba(167,243,208,.34)";
    context.strokeStyle = "#f0abfc";
    context.lineWidth = 18;
    for (let petal = 0; petal < 4; petal += 1) {
      context.rotate(Math.PI / 2);
      context.beginPath();
      context.ellipse(0, -85, 42, 88, 0, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }
    context.fillStyle = "#fef08a";
    context.fillRect(-28, -28, 56, 56);
    context.restore();
  }
  for (const replay of snapshot.warpReplays) {
    context.strokeStyle = `rgba(196,181,253,${Math.max(0.2, 1 - replay.triggerTicks / 24)})`;
    context.lineWidth = 70;
    context.setLineDash([56, 36]);
    context.beginPath();
    context.moveTo(replay.start.x, replay.start.y);
    context.lineTo(replay.end.x, replay.end.y);
    context.stroke();
  }
  context.restore();
};

const drawEnemy = (
  context: CanvasRenderingContext2D,
  enemy: ActionEnemySnapshot,
  position: ActionVec,
  tick: number,
  sprite?: HTMLImageElement,
): void => {
  drawIntent(context, enemy, position);
  const bob = Math.round(Math.sin((tick + enemy.id * 9) / 9) * 14);
  const isElite = enemy.kind === "elite";
  const width = enemy.boss ? 900 : isElite ? 610 : 500;
  const height = enemy.boss ? 1040 : width;
  context.fillStyle = enemy.boss
    ? "rgba(244,63,94,.2)"
    : isElite
      ? "rgba(251,191,36,.16)"
      : "rgba(34,211,238,.13)";
  context.fillRect(
    position.x - width * 0.36,
    position.y + height * 0.25,
    width * 0.72,
    52,
  );
  if (sprite) {
    context.drawImage(
      sprite,
      Math.round(position.x - width / 2),
      Math.round(position.y - height / 2 + bob),
      width,
      height,
    );
  } else {
    context.fillStyle = enemy.boss ? "#be123c" : isElite ? "#d97706" : "#6d28d9";
    context.fillRect(position.x - 150, position.y - 150, 300, 300);
  }
  drawEnemyHealth(context, enemy, position, width, height, bob);
  drawTraitAura(context, enemy, position, tick);
};

const drawIntent = (
  context: CanvasRenderingContext2D,
  enemy: ActionEnemySnapshot,
  position: ActionVec,
): void => {
  if (enemy.intentTicks <= 0) return;
  const urgency = 1 - Math.min(1, enemy.intentTicks / 18);
  context.save();
  const color =
    enemy.attack === "beam"
      ? "103,232,249"
      : enemy.attack === "delayed_echo"
        ? "216,180,254"
        : enemy.attack === "ring" || enemy.attack === "mine"
          ? "251,191,36"
          : "251,113,133";
  context.strokeStyle = `rgba(${color},${0.38 + urgency * 0.5})`;
  context.fillStyle = `rgba(${color},${0.04 + urgency * 0.08})`;
  context.lineWidth = enemy.movement === "charge" ? 105 : 25;
  context.setLineDash(enemy.attack === "beam" ? [90, 24] : [54, 32]);
  if (enemy.attack === "ring" || enemy.attack === "mine") {
    context.beginPath();
    context.arc(position.x, position.y, 440 + urgency * 150, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  } else if (enemy.attack === "fan") {
    const angle = Math.atan2(
      enemy.intentTarget.y - position.y,
      enemy.intentTarget.x - position.x,
    );
    context.beginPath();
    context.moveTo(position.x, position.y);
    context.arc(position.x, position.y, 1900, angle - 0.32, angle + 0.32);
    context.closePath();
    context.fill();
    context.stroke();
  } else {
    context.beginPath();
    context.moveTo(position.x, position.y);
    context.lineTo(enemy.intentTarget.x, enemy.intentTarget.y);
    context.stroke();
  }
  context.restore();
};

const drawEnemyHealth = (
  context: CanvasRenderingContext2D,
  enemy: ActionEnemySnapshot,
  position: ActionVec,
  width: number,
  height: number,
  bob: number,
): void => {
  const barWidth = enemy.boss ? 780 : Math.min(480, width);
  const y = position.y - height / 2 + bob - 70;
  context.fillStyle = "rgba(2,6,23,.9)";
  context.fillRect(position.x - barWidth / 2, y, barWidth, 38);
  context.fillStyle = enemy.boss
    ? "#fb7185"
    : enemy.kind === "elite"
      ? "#fbbf24"
      : "#a78bfa";
  context.fillRect(
    position.x - barWidth / 2 + 6,
    y + 6,
    Math.max(0, (barWidth - 12) * (enemy.health / enemy.maxHealth)),
    26,
  );
};

const drawTraitAura = (
  context: CanvasRenderingContext2D,
  enemy: ActionEnemySnapshot,
  position: ActionVec,
  tick: number,
): void => {
  if (enemy.traits.length === 0) return;
  context.save();
  if (enemy.traits.some((trait) => trait.kind === "linked_shield")) {
    context.strokeStyle = "rgba(125,211,252,.65)";
    context.lineWidth = 18;
    context.beginPath();
    context.arc(position.x, position.y, 275 + Math.sin(tick / 8) * 20, 0, Math.PI * 2);
    context.stroke();
  }
  if (enemy.traits.some((trait) => trait.kind === "distortion_aura")) {
    context.strokeStyle = "rgba(232,121,249,.42)";
    context.lineWidth = 12;
    context.setLineDash([30, 24]);
    context.beginPath();
    context.arc(position.x, position.y, 900, 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();
};

const drawProjectile = (
  context: CanvasRenderingContext2D,
  projectile: ActionProjectileSnapshot,
  position: ActionVec,
): void => {
  const angle = Math.atan2(projectile.velocity.y, projectile.velocity.x);
  context.save();
  context.translate(position.x, position.y);
  context.rotate(angle);
  context.shadowColor = projectile.glitchMarked
    ? "#67e8f9"
    : projectile.grazed
      ? "#e879f9"
      : "#fb7185";
  context.shadowBlur = projectile.grazed ? 20 : 36;
  if (projectile.pattern === "beam") {
    context.fillStyle = "#fecdd3";
    context.fillRect(-70, -18, 140, 36);
  } else if (projectile.pattern === "mine") {
    context.strokeStyle = "#fdba74";
    context.lineWidth = 18;
    context.strokeRect(-56, -56, 112, 112);
    context.fillStyle = "#fb7185";
    context.fillRect(-24, -24, 48, 48);
  } else {
    context.fillStyle = projectile.glitchMarked
      ? "#67e8f9"
      : projectile.grazed
        ? "#f0abfc"
        : "#fb7185";
    context.beginPath();
    context.moveTo(72, 0);
    context.lineTo(-42, 48);
    context.lineTo(-24, 0);
    context.lineTo(-42, -48);
    context.closePath();
    context.fill();
  }
  context.restore();
};

const drawFriendlyShot = (
  context: CanvasRenderingContext2D,
  position: ActionVec,
  tick: number,
): void => {
  context.save();
  context.translate(position.x, position.y);
  context.rotate((tick % 16) * (Math.PI / 8));
  context.shadowColor = "#67e8f9";
  context.shadowBlur = 34;
  context.fillStyle = "#a7f3d0";
  context.fillRect(-42, -42, 84, 84);
  context.fillStyle = "#c4b5fd";
  context.fillRect(-18, -70, 36, 140);
  context.fillRect(-70, -18, 140, 36);
  context.restore();
};

const drawAutoAttack = (
  context: CanvasRenderingContext2D,
  snapshot: ActionSnapshot,
  previousEnemies: ReadonlyMap<number, ActionEnemySnapshot>,
  alpha: number,
  config: ActionConfig,
): void => {
  if (snapshot.enemies.length === 0) return;
  const phase = snapshot.tick % Math.max(1, config.runtime.attackInterval);
  if (phase > 3) return;
  const target = [...snapshot.enemies].sort(
    (left, right) =>
      distanceSquared(snapshot.player, left.position) -
      distanceSquared(snapshot.player, right.position),
  )[0]!;
  const position = interpolate(
    previousEnemies.get(target.id)?.position,
    target.position,
    alpha,
  );
  context.save();
  context.strokeStyle = snapshot.distortion >= 60 ? "#f0abfc" : "#67e8f9";
  context.lineWidth = 24 + config.runtime.projectileCount * 8;
  context.shadowColor = context.strokeStyle;
  context.shadowBlur = 35;
  context.beginPath();
  context.moveTo(snapshot.player.x, snapshot.player.y - 35);
  context.lineTo(position.x, position.y);
  context.stroke();
  context.restore();
};

const drawCombatFeedback = (
  context: CanvasRenderingContext2D,
  snapshot: ActionSnapshot,
  previous: ActionSnapshot | null,
  previousEnemies: ReadonlyMap<number, ActionEnemySnapshot>,
): void => {
  if (!previous) return;
  for (const enemy of snapshot.enemies) {
    const before = previousEnemies.get(enemy.id);
    if (!before || enemy.health >= before.health) continue;
    context.save();
    context.strokeStyle = "rgba(224,242,254,.92)";
    context.lineWidth = 24;
    context.strokeRect(
      enemy.position.x - 185,
      enemy.position.y - 185,
      370,
      370,
    );
    context.fillStyle = "#f0abfc";
    for (let shard = 0; shard < 4; shard += 1) {
      const x = enemy.position.x + (shard - 1.5) * 82;
      const y = enemy.position.y + (shard % 2 === 0 ? -210 : 190);
      context.fillRect(x - 18, y - 18, 36, 36);
    }
    context.restore();
  }
  const alive = new Set(snapshot.enemies.map((enemy) => enemy.id));
  for (const enemy of previous.enemies) {
    if (alive.has(enemy.id)) continue;
    context.save();
    context.translate(enemy.position.x, enemy.position.y);
    context.strokeStyle = "rgba(103,232,249,.9)";
    context.lineWidth = 28;
    for (let ray = 0; ray < 8; ray += 1) {
      context.rotate(Math.PI / 4);
      context.beginPath();
      context.moveTo(170, 0);
      context.lineTo(350, 0);
      context.stroke();
    }
    context.fillStyle = "rgba(244,114,182,.85)";
    context.fillRect(-95, -95, 190, 190);
    context.fillStyle = "rgba(224,242,254,.95)";
    context.fillRect(-42, -42, 84, 84);
    context.restore();
  }
};

const drawWarpTrail = (
  context: CanvasRenderingContext2D,
  previousPlayer: ActionVec | undefined,
  player: ActionVec,
  snapshot: ActionSnapshot,
): void => {
  if (!previousPlayer || snapshot.warpFX <= 0) return;
  const empowered = snapshot.protocol !== "" || snapshot.weave.length === 3;
  context.save();
  context.strokeStyle = empowered
    ? "rgba(244,114,182,.5)"
    : "rgba(34,211,238,.42)";
  context.lineWidth = 170 + snapshot.warpFX * 8;
  context.beginPath();
  context.moveTo(previousPlayer.x, previousPlayer.y);
  context.lineTo(player.x, player.y);
  context.stroke();
  context.strokeStyle = "rgba(224,242,254,.88)";
  context.lineWidth = 30;
  context.stroke();
  context.restore();
};

const drawWarpAim = (
  context: CanvasRenderingContext2D,
  snapshot: ActionSnapshot,
  direction: number | null,
): void => {
  if (direction === null || snapshot.warpCooldown > 0) return;
  const vector = ACTION_DIRECTIONS[direction & 15]!;
  const end = {
    x: snapshot.player.x + Math.round((vector.x * 620) / 1000),
    y: snapshot.player.y + Math.round((vector.y * 620) / 1000),
  };
  const midpoint = {
    x: Math.round((snapshot.player.x + end.x) / 2),
    y: Math.round((snapshot.player.y + end.y) / 2),
  };
  const radius = snapshot.protocol ? 700 : 330;
  const targets = snapshot.enemies.filter((enemy) =>
    nearTravelPath(
      enemy.position.x,
      enemy.position.y,
      snapshot.player.x,
      snapshot.player.y,
      midpoint.x,
      midpoint.y,
      end.x,
      end.y,
      radius,
    ),
  );

  context.save();
  context.strokeStyle = snapshot.protocol
    ? "rgba(244,114,182,.9)"
    : "rgba(103,232,249,.78)";
  context.lineWidth = snapshot.protocol ? 42 : 24;
  context.setLineDash([42, 24]);
  context.beginPath();
  context.moveTo(snapshot.player.x, snapshot.player.y);
  context.lineTo(end.x, end.y);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = context.strokeStyle;
  context.beginPath();
  context.moveTo(end.x, end.y);
  context.lineTo(
    end.x - vector.x / 8 + vector.y / 10,
    end.y - vector.y / 8 - vector.x / 10,
  );
  context.lineTo(
    end.x - vector.x / 8 - vector.y / 10,
    end.y - vector.y / 8 + vector.x / 10,
  );
  context.closePath();
  context.fill();
  for (const target of targets) {
    context.strokeStyle = "rgba(254,240,138,.95)";
    context.lineWidth = 18;
    context.strokeRect(
      target.position.x - 210,
      target.position.y - 210,
      420,
      420,
    );
  }
  context.restore();
};

const drawPlayer = (
  context: CanvasRenderingContext2D,
  player: ActionVec,
  snapshot: ActionSnapshot,
  sprite: HTMLImageElement | null,
): void => {
  context.save();
  context.translate(player.x, player.y);
  // The combat sprite stays grounded. Position interpolation and walk bobbing
  // both made direct touch movement read as delayed or inertial in Telegram.
  context.fillStyle = "rgba(34,211,238,.2)";
  context.fillRect(-190, 180, 380, 52);
  if (sprite) {
    context.drawImage(sprite, -275, -360, 550, 550);
  } else {
    context.fillStyle = "#67e8f9";
    context.fillRect(-115, -115, 230, 230);
  }
  if (snapshot.invulnerable > 0 || snapshot.shield > 0) {
    context.strokeStyle = snapshot.invulnerable > 0 ? "#f0abfc" : "#7dd3fc";
    context.globalAlpha = snapshot.invulnerable > 0 ? 0.88 : 0.52;
    context.lineWidth = 22;
    context.beginPath();
    context.arc(0, -45, 255, 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();
};

const drawScreenEffects = (
  context: CanvasRenderingContext2D,
  snapshot: ActionSnapshot,
  config: ActionConfig,
): void => {
  if (snapshot.distortion >= 60) {
    context.fillStyle = `rgba(217,70,239,${0.025 + snapshot.distortion / 2600})`;
    context.fillRect(0, 0, ACTION_WIDTH, ACTION_HEIGHT);
  }
  if (snapshot.reconnectFX > 0) {
    context.strokeStyle = `rgba(103,232,249,${snapshot.reconnectFX / 120})`;
    context.lineWidth = 38;
    const inset = (90 - snapshot.reconnectFX) * 10;
    context.strokeRect(inset, inset, ACTION_WIDTH - inset * 2, ACTION_HEIGHT - inset * 2);
  }
  if (snapshot.signalPulse > 0) {
    context.strokeStyle = `rgba(167,243,208,${snapshot.signalPulse / 24})`;
    context.lineWidth = 24;
    context.beginPath();
    context.arc(
      snapshot.player.x,
      snapshot.player.y,
      (18 - snapshot.signalPulse) * 45 + 210,
      0,
      Math.PI * 2,
    );
    context.stroke();
  }
  if (config.hazards.includes("crossfire") && snapshot.tick % 90 < 24) {
    context.fillStyle = "rgba(251,113,133,.04)";
    context.fillRect(0, 0, ACTION_WIDTH, ACTION_HEIGHT);
  }
};

const interpolate = (
  previous: ActionVec | undefined,
  current: ActionVec,
  alpha: number,
): ActionVec =>
  previous
    ? {
        x: Math.round(previous.x + (current.x - previous.x) * alpha),
        y: Math.round(previous.y + (current.y - previous.y) * alpha),
      }
    : current;

const distanceSquared = (left: ActionVec, right: ActionVec): number =>
  (left.x - right.x) ** 2 + (left.y - right.y) ** 2;

export const remainingWarpSeconds = (snapshot: ActionSnapshot): number =>
  Math.max(0, Math.ceil(snapshot.warpCooldown / ACTION_TPS));
