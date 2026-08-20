import {
  ACTION_HEIGHT,
  ACTION_TPS,
  ACTION_WIDTH,
  type ActionConfig,
  type ActionEnemySnapshot,
  type ActionProjectileSnapshot,
  type ActionSnapshot,
} from "@/features/action/action-engine";

type Point = { readonly x: number; readonly y: number };

export type ActionVisuals = {
  readonly background: HTMLImageElement;
  readonly player: HTMLImageElement;
  readonly normalEnemy: HTMLImageElement;
  readonly eliteEnemy: HTMLImageElement;
  readonly boss: HTMLImageElement;
};

const visualSources = {
  background: "/game/v2/seventh-dock.webp",
  player: "/game/v2/nana-player.webp",
  normalEnemy: "/game/v2/retention-drone.webp",
  eliteEnemy: "/game/v2/moderation-hound.webp",
  boss: "/game/v2/optimal-nana.webp",
} as const;

const eliteSlugs = new Set(["cache-hunter", "moderation-hound"]);
let visualsPromise: Promise<ActionVisuals> | null = null;

const loadImage = (source: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load action art: ${source}`));
    image.src = source;
  });

export const preloadActionVisuals = (): Promise<ActionVisuals> => {
  visualsPromise ??= Promise.all(
    Object.entries(visualSources).map(async ([key, source]) => [key, await loadImage(source)] as const),
  ).then((entries) => Object.fromEntries(entries) as ActionVisuals);
  return visualsPromise;
};

export const drawActionArena = (
  canvas: HTMLCanvasElement | null,
  snapshot: ActionSnapshot,
  previous: ActionSnapshot | null,
  alpha: number,
  config: ActionConfig,
  visuals: ActionVisuals | null,
) => {
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
  const offsetX = (width - ACTION_WIDTH * scale) / 2;
  const offsetY = (height - ACTION_HEIGHT * scale) / 2;
  context.setTransform(scale, 0, 0, scale, offsetX, offsetY);
  context.imageSmoothingEnabled = false;

  drawBackground(context, snapshot, visuals?.background);
  const player = interpolate(previous?.player, snapshot.player, alpha);
  const previousEnemies = new Map((previous?.enemies ?? []).map((enemy) => [enemy.id, enemy]));
  const previousProjectiles = new Map(
    (previous?.projectiles ?? []).map((projectile) => [projectile.id, projectile]),
  );

  drawRouteGuide(context, player, snapshot);
  drawBeacon(context, snapshot);
  for (const enemy of snapshot.enemies) {
    drawEnemy(
      context,
      enemy,
      interpolate(previousEnemies.get(enemy.id)?.position, enemy.position, alpha),
      snapshot.tick,
      visuals,
    );
  }
  drawAutoAttack(context, player, snapshot, previousEnemies, alpha, config);
  for (const projectile of snapshot.projectiles) {
    drawProjectile(
      context,
      projectile,
      interpolate(previousProjectiles.get(projectile.id)?.position, projectile.position, alpha),
    );
  }
  const moving = previous
    ? previous.player.x !== snapshot.player.x ||
      previous.player.y !== snapshot.player.y
    : false;
  drawPlayer(context, player, snapshot, moving, visuals?.player);
  drawScreenEffects(context, snapshot, config);
};

const drawBackground = (
  context: CanvasRenderingContext2D,
  snapshot: ActionSnapshot,
  background?: HTMLImageElement,
) => {
  if (background) {
    context.drawImage(background, 0, 0, ACTION_WIDTH, ACTION_HEIGHT);
  } else {
    const fallback = context.createLinearGradient(0, 0, 0, ACTION_HEIGHT);
    fallback.addColorStop(0, "#102652");
    fallback.addColorStop(0.5, "#080f25");
    fallback.addColorStop(1, "#02050e");
    context.fillStyle = fallback;
    context.fillRect(0, 0, ACTION_WIDTH, ACTION_HEIGHT);
  }

  context.fillStyle = "rgba(2,6,23,.18)";
  context.fillRect(0, 0, ACTION_WIDTH, ACTION_HEIGHT);
  const edge = context.createLinearGradient(0, 0, ACTION_WIDTH, 0);
  edge.addColorStop(0, "rgba(2,6,23,.72)");
  edge.addColorStop(0.16, "rgba(2,6,23,.04)");
  edge.addColorStop(0.84, "rgba(2,6,23,.04)");
  edge.addColorStop(1, "rgba(2,6,23,.72)");
  context.fillStyle = edge;
  context.fillRect(0, 0, ACTION_WIDTH, ACTION_HEIGHT);

  context.fillStyle = "rgba(103,232,249,.035)";
  const scanOffset = (snapshot.tick * 7) % 160;
  for (let y = scanOffset; y < ACTION_HEIGHT; y += 160) context.fillRect(0, y, ACTION_WIDTH, 9);
};

const drawRouteGuide = (
  context: CanvasRenderingContext2D,
  player: Point,
  snapshot: ActionSnapshot,
) => {
  context.save();
  context.setLineDash([32, 38]);
  context.lineWidth = 10;
  context.strokeStyle = snapshot.routeReady ? "rgba(253,224,71,.55)" : "rgba(103,232,249,.18)";
  context.beginPath();
  context.moveTo(player.x, player.y);
  context.lineTo(snapshot.activeBeacon.x, snapshot.activeBeacon.y);
  context.stroke();
  context.restore();
};

const drawBeacon = (context: CanvasRenderingContext2D, snapshot: ActionSnapshot) => {
  const beacon = snapshot.activeBeacon;
  const pulse = Math.round(Math.sin(snapshot.tick / 7) * 18);
  context.save();
  context.translate(beacon.x, beacon.y);
  context.fillStyle = "rgba(34,211,238,.1)";
  context.fillRect(-300 - pulse, -300 - pulse, 600 + pulse * 2, 600 + pulse * 2);

  // Pixel navigation relay: antenna, signal lamp, screen, chassis and base.
  context.fillStyle = "#164e63";
  context.fillRect(-22, -300, 44, 118);
  context.fillStyle = snapshot.routeReady ? "#fef08a" : "#67e8f9";
  context.fillRect(-52, -344, 104, 58);
  context.fillStyle = "#facc15";
  context.fillRect(-26, -330, 52, 30);
  context.fillStyle = "#0f172a";
  context.fillRect(-212, -188, 424, 330);
  context.fillStyle = "#facc15";
  context.fillRect(-212, -188, 424, 32);
  context.fillRect(-212, 110, 424, 32);
  context.fillRect(-212, -188, 32, 330);
  context.fillRect(180, -188, 32, 330);
  context.fillStyle = "#082f49";
  context.fillRect(-160, -130, 320, 212);
  context.fillStyle = "#22d3ee";
  context.fillRect(-126, -94, 252, 20);
  context.fillRect(-126, 46, 252, 16);

  context.fillStyle = "#e0f2fe";
  context.font = "bold 132px ui-monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(snapshot.routeStep + 1), 0, -10);

  context.fillStyle = "#155e75";
  context.fillRect(-132, 142, 264, 74);
  context.fillStyle = "#22d3ee";
  context.fillRect(-240, 216, 480, 54);
  context.fillStyle = "#0e7490";
  context.fillRect(-300, 270, 600, 72);
  context.fillStyle = "#facc15";
  context.fillRect(-300, 270, 86, 24);
  context.fillRect(214, 270, 86, 24);

  context.font = "bold 58px ui-monospace";
  context.fillStyle = "#cffafe";
  context.textBaseline = "top";
  context.fillText(`NAV-${snapshot.routeStep + 1}`, 0, 352);
  context.restore();
};

const drawEnemy = (
  context: CanvasRenderingContext2D,
  enemy: ActionEnemySnapshot,
  position: Point,
  tick: number,
  visuals: ActionVisuals | null,
) => {
  drawIntent(context, enemy, position);
  const bob = Math.round(Math.sin((tick + enemy.id * 9) / 9) * 18);
  const sprite = enemy.boss
    ? visuals?.boss
    : eliteSlugs.has(enemy.slug)
      ? visuals?.eliteEnemy
      : visuals?.normalEnemy;
  const spriteWidth = enemy.boss ? 900 : eliteSlugs.has(enemy.slug) ? 560 : 500;
  const spriteHeight = enemy.boss ? 1140 : spriteWidth;

  context.fillStyle = enemy.boss ? "rgba(244,114,182,.2)" : "rgba(34,211,238,.14)";
  context.fillRect(position.x - spriteWidth * 0.36, position.y + spriteHeight * 0.24, spriteWidth * 0.72, 55);
  if (sprite) {
    context.drawImage(
      sprite,
      Math.round(position.x - spriteWidth / 2),
      Math.round(position.y - spriteHeight / 2 + bob),
      spriteWidth,
      spriteHeight,
    );
  } else {
    context.fillStyle = enemy.boss ? "#be185d" : "#6d28d9";
    context.fillRect(position.x - 150, position.y - 150, 300, 300);
  }
  drawEnemyHealth(context, enemy, position, spriteWidth, spriteHeight, bob);
};

const drawIntent = (
  context: CanvasRenderingContext2D,
  enemy: ActionEnemySnapshot,
  position: Point,
) => {
  if (enemy.intentTicks <= 0) return;
  context.save();
  context.setLineDash([56, 34]);
  context.lineWidth = 24;
  context.strokeStyle = `rgba(251,113,133,${0.34 + (12 - Math.min(12, enemy.intentTicks)) / 18})`;
  context.beginPath();
  context.moveTo(position.x, position.y);
  context.lineTo(enemy.intentTarget.x, enemy.intentTarget.y);
  context.stroke();
  context.restore();
  if (enemy.bossPhase === 3) {
    context.strokeStyle = "rgba(251,113,133,.6)";
    context.lineWidth = 26;
    context.strokeRect(position.x - 420, position.y - 420, 840, 840);
  }
};

const drawEnemyHealth = (
  context: CanvasRenderingContext2D,
  enemy: ActionEnemySnapshot,
  position: Point,
  spriteWidth: number,
  spriteHeight: number,
  bob: number,
) => {
  const width = enemy.boss ? 780 : Math.min(480, spriteWidth);
  const y = position.y - spriteHeight / 2 + bob - 76;
  context.fillStyle = "rgba(2,6,23,.88)";
  context.fillRect(position.x - width / 2 - 10, y - 10, width + 20, 50);
  context.fillStyle = enemy.boss ? "#fb7185" : "#a78bfa";
  context.fillRect(
    position.x - width / 2,
    y,
    width * Math.min(1, Math.max(0, enemy.health / enemy.maxHealth)),
    30,
  );
  if (!enemy.boss) return;
  context.font = "bold 76px ui-monospace";
  context.fillStyle = "#fbcfe8";
  context.textAlign = "center";
  context.textBaseline = "top";
  context.fillText(`P${enemy.bossPhase} // ${enemy.bossMimic.toUpperCase()}`, position.x, y + 64);
};

const drawAutoAttack = (
  context: CanvasRenderingContext2D,
  player: Point,
  snapshot: ActionSnapshot,
  previousEnemies: Map<number, ActionEnemySnapshot>,
  alpha: number,
  config: ActionConfig,
) => {
  if (snapshot.tick % config.buffs.attackInterval >= 2 || snapshot.enemies.length === 0) return;
  let target = snapshot.enemies[0]!;
  let nearest = Number.MAX_SAFE_INTEGER;
  for (const enemy of snapshot.enemies) {
    const distance = (enemy.position.x - snapshot.player.x) ** 2 + (enemy.position.y - snapshot.player.y) ** 2;
    if (distance < nearest) {
      nearest = distance;
      target = enemy;
    }
  }
  const targetPosition = interpolate(previousEnemies.get(target.id)?.position, target.position, alpha);
  context.strokeStyle = "rgba(34,211,238,.32)";
  context.lineWidth = 54;
  context.beginPath();
  context.moveTo(player.x, player.y - 25);
  context.lineTo(targetPosition.x, targetPosition.y);
  context.stroke();
  context.strokeStyle = "#cffafe";
  context.lineWidth = 16;
  context.stroke();
};

const drawProjectile = (
  context: CanvasRenderingContext2D,
  projectile: ActionProjectileSnapshot,
  position: Point,
) => {
  const color = projectile.grazed ? "#f0abfc" : "#fb7185";
  const length = Math.max(1, Math.hypot(projectile.velocity.x, projectile.velocity.y));
  context.strokeStyle = projectile.grazed ? "rgba(240,171,252,.24)" : "rgba(251,113,133,.26)";
  context.lineWidth = 32;
  context.beginPath();
  context.moveTo(position.x, position.y);
  context.lineTo(
    position.x - (projectile.velocity.x / length) * 110,
    position.y - (projectile.velocity.y / length) * 110,
  );
  context.stroke();
  context.fillStyle = color;
  context.fillRect(position.x - 40, position.y - 40, 80, 80);
  context.fillStyle = "#fff1f2";
  context.fillRect(position.x - 16, position.y - 16, 32, 32);
};

const drawPlayer = (
  context: CanvasRenderingContext2D,
  player: Point,
  snapshot: ActionSnapshot,
  moving: boolean,
  sprite?: HTMLImageElement,
) => {
  const width = 500;
  const height = 665;
  const aura = snapshot.invulnerable > 0 ? "rgba(254,243,199,.48)" : "rgba(103,232,249,.25)";
  context.fillStyle = aura;
  context.fillRect(player.x - 210, player.y + 210, 420, 58);
  if (moving && snapshot.tick % 6 < 3) {
    context.fillStyle = "rgba(103,232,249,.42)";
    context.fillRect(player.x - 210, player.y + 250, 82, 28);
    context.fillRect(player.x + 120, player.y + 250, 58, 28);
  }
  if (snapshot.routeReady) drawRouteWings(context, player, snapshot.tick);
  if (sprite) {
    context.drawImage(sprite, player.x - width / 2, player.y - height / 2, width, height);
  } else {
    context.fillStyle = "#67e8f9";
    context.fillRect(player.x - 120, player.y - 120, 240, 240);
  }
};

const drawRouteWings = (
  context: CanvasRenderingContext2D,
  player: Point,
  tick: number,
) => {
  const pulse = tick % 12 < 6 ? 0 : 22;
  context.fillStyle = "rgba(250,204,21,.22)";
  context.fillRect(player.x - 360 - pulse, player.y - 122, 96, 244);
  context.fillRect(player.x + 264 + pulse, player.y - 122, 96, 244);
  context.fillStyle = "#fde047";
  for (const side of [-1, 1] as const) {
    const edge = player.x + side * (292 + pulse);
    context.fillRect(edge - 22, player.y - 150, 44, 300);
    context.fillRect(edge - side * 72, player.y - 104, 72, 44);
    context.fillRect(edge - side * 118, player.y - 22, 118, 44);
    context.fillRect(edge - side * 72, player.y + 60, 72, 44);
  }
};

const drawScreenEffects = (
  context: CanvasRenderingContext2D,
  snapshot: ActionSnapshot,
  config: ActionConfig,
) => {
  if (snapshot.distortion >= 60) {
    context.fillStyle = `rgba(217,70,239,${0.035 + Math.sin(snapshot.tick) * 0.012})`;
    context.fillRect(0, 0, ACTION_WIDTH, ACTION_HEIGHT);
    for (let index = 0; index < 7; index += 1) {
      const x = (snapshot.tick * 83 + index * 719) % ACTION_WIDTH;
      const y = (snapshot.tick * 47 + index * 997) % ACTION_HEIGHT;
      context.fillStyle = index % 2 === 0 ? "rgba(34,211,238,.16)" : "rgba(244,114,182,.16)";
      context.fillRect(x, y, 180 + index * 34, 22 + (index % 3) * 14);
    }
  }
  if (snapshot.reconnectFX > 0) {
    context.fillStyle = `rgba(103,232,249,${Math.min(0.32, snapshot.reconnectFX / 220)})`;
    context.fillRect(0, 0, ACTION_WIDTH, ACTION_HEIGHT);
  }
  if (snapshot.tick < Math.min(config.durationTicks, ACTION_TPS * 5)) {
    const fade = 1 - snapshot.tick / Math.min(config.durationTicks, ACTION_TPS * 5);
    context.fillStyle = `rgba(103,232,249,${0.05 * fade})`;
    context.fillRect(0, 0, ACTION_WIDTH, ACTION_HEIGHT);
  }
};

const interpolate = (previous: Point | undefined, current: Point, alpha: number): Point =>
  previous
    ? {
        x: previous.x + (current.x - previous.x) * alpha,
        y: previous.y + (current.y - previous.y) * alpha,
      }
    : current;
