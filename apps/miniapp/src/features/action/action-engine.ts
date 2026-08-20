import type { APIGameContent, APIGameRun } from "@/lib/api/client";

export const ACTION_WIDTH = 3600;
export const ACTION_HEIGHT = 6400;
export const ACTION_TPS = 30;

export type ActionInput = {
  readonly direction: number;
  readonly magnitude: number;
  readonly skill: boolean;
};
export type ActionTrace = {
  readonly encoding: "rle8-v1";
  readonly ticks: number;
  readonly data: string;
  readonly client_digest: string;
};

type Vec = { x: number; y: number };
type EnemySpec = {
  slug: string;
  pattern: string;
  maxHealth: number;
  speed: number;
  contactDamage: number;
  fireInterval: number;
  projectileSpeed: number;
  projectileDamage: number;
};
type Buffs = {
  attackDamage: number;
  attackInterval: number;
  moveSpeed: number;
  dashCooldown: number;
  dashDamage: number;
  startingShield: number;
  overloadBonus: number;
  distortionGain: number;
  routeHeal: number;
  reflectDamage: number;
};
export type ActionConfig = {
  seed: string;
  kind: string;
  durationTicks: number;
  maxTicks: number;
  spawnInterval: number;
  maxAlive: number;
  playerHealth: number;
  playerMaxHealth: number;
  noiseLevel: number;
  emergencyReconnectAvailable: boolean;
  enemies: EnemySpec[];
  buffs: Buffs;
};

export type ActionEnemySnapshot = {
  id: number;
  slug: string;
  position: Vec;
  health: number;
  maxHealth: number;
  boss: boolean;
  bossPhase: number;
  bossMimic: string;
  intentTicks: number;
  intentTarget: Vec;
};
export type ActionProjectileSnapshot = {
  id: number;
  position: Vec;
  velocity: Vec;
  grazed: boolean;
};
export type ActionSnapshot = {
  tick: number;
  player: Vec;
  health: number;
  maxHealth: number;
  shield: number;
  distortion: number;
  dashCooldown: number;
  invulnerable: number;
  reconnectFX: number;
  dashFX: number;
  anchorPulse: number;
  routeStep: number;
  routeReady: boolean;
  activeBeacon: Vec;
  enemies: ActionEnemySnapshot[];
  projectiles: ActionProjectileSnapshot[];
};
export type ActionResult = {
  won: boolean;
  health: number;
  ticks: number;
  kills: number;
  routesCompleted: number;
  distortion: number;
  emergencyReconnectUsed: boolean;
  digest: string;
  final: ActionSnapshot;
};

type EnemyEntity = {
  id: number;
  specIndex: number;
  x: number;
  y: number;
  health: number;
  fireClock: number;
};
type ProjectileEntity = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  grazed: boolean;
};

const directions: readonly Vec[] = [
  { x: 1000, y: 0 },
  { x: 924, y: 383 },
  { x: 707, y: 707 },
  { x: 383, y: 924 },
  { x: 0, y: 1000 },
  { x: -383, y: 924 },
  { x: -707, y: 707 },
  { x: -924, y: 383 },
  { x: -1000, y: 0 },
  { x: -924, y: -383 },
  { x: -707, y: -707 },
  { x: -383, y: -924 },
  { x: 0, y: -1000 },
  { x: 383, y: -924 },
  { x: 707, y: -707 },
  { x: 924, y: -383 },
];
const routePatterns: readonly (readonly Vec[])[] = [
  [
    { x: 760, y: 4300 },
    { x: 2840, y: 3000 },
    { x: 1800, y: 1280 },
  ],
  [
    { x: 2840, y: 4300 },
    { x: 760, y: 3000 },
    { x: 1800, y: 1280 },
  ],
  [
    { x: 1800, y: 4100 },
    { x: 760, y: 2550 },
    { x: 2840, y: 1450 },
  ],
];

class RandomStream {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  int(limit: number): number {
    if (limit <= 1) return 0;
    if (this.state === 0) this.state = 0x9e3779b9;
    let value = this.state;
    value = (value ^ (value << 13)) >>> 0;
    value = (value ^ (value >>> 17)) >>> 0;
    value = (value ^ (value << 5)) >>> 0;
    this.state = value;
    return value % limit;
  }
}

export class ActionSimulation {
  private readonly random: RandomStream;
  private tickValue = 0;
  private playerX = ACTION_WIDTH / 2;
  private playerY = 5200;
  private health: number;
  private shield: number;
  private distortion = 0;
  private dashClock = 0;
  private invulnerable = 0;
  private attackClock = 0;
  private routeStep = 0;
  private routeReady = false;
  private routeWarpUsed = false;
  private lastGraze = -1000;
  private nextEnemyId = 0;
  private nextBulletId = 0;
  private spawnIndex = 0;
  private kills = 0;
  private routes = 0;
  private emergencyUsed = false;
  private reconnectFX = 0;
  private dashFX = 0;
  private anchorPulse = 0;
  private readonly routePattern: number;
  private enemies: EnemyEntity[] = [];
  private projectiles: ProjectileEntity[] = [];
  private finished = false;
  private won = false;

  constructor(
    readonly config: ActionConfig,
    seed: number,
  ) {
    this.random = new RandomStream(seed);
    this.routePattern = seed % routePatterns.length;
    this.health = config.playerHealth;
    this.shield = config.buffs.startingShield;
  }

  step(input: ActionInput): ActionResult | null {
    if (this.finished) return this.result();
    this.tickValue += 1;
    if (this.dashClock > 0) this.dashClock -= 1;
    if (this.invulnerable > 0) this.invulnerable -= 1;
    if (this.reconnectFX > 0) this.reconnectFX -= 1;
    if (this.dashFX > 0) this.dashFX -= 1;
    if (this.anchorPulse > 0) this.anchorPulse -= 1;
    this.movePlayer(input);
    this.collectBeacon();
    this.spawnEnemies();
    this.updateEnemies();
    this.autoAttack();
    this.updateProjectiles();
    const decayInterval = 15 + this.config.noiseLevel * 3;
    if (
      this.distortion > 0 &&
      this.tickValue - this.lastGraze > 60 &&
      this.tickValue % decayInterval === 0
    )
      this.distortion -= 1;
    if (this.health <= 0) {
      if (this.config.emergencyReconnectAvailable && !this.emergencyUsed) {
        this.emergencyUsed = true;
        this.health = Math.max(
          1,
          Math.trunc((this.config.playerMaxHealth * 40) / 100),
        );
        this.projectiles = [];
        this.invulnerable = 45;
        this.reconnectFX = 90;
      } else {
        this.finished = true;
      }
    }
    if (!this.finished && this.config.kind === "boss") {
      const bossAlive = this.enemies.some(
        (enemy) =>
          this.config.enemies[enemy.specIndex]?.pattern === "boss" &&
          enemy.health > 0,
      );
      if (!bossAlive) {
        this.finished = true;
        this.won = true;
      } else if (this.tickValue >= this.config.maxTicks) this.finished = true;
    } else if (
      !this.finished &&
      this.config.kind === "tutorial" &&
      this.routeWarpUsed
    ) {
      this.finished = true;
      this.won = true;
    } else if (
      !this.finished &&
      this.config.kind !== "boss" &&
      this.tickValue >= this.config.durationTicks
    ) {
      this.finished = true;
      this.won = true;
    }
    return this.finished ? this.result() : null;
  }

  snapshot(): ActionSnapshot {
    return {
      tick: this.tickValue,
      player: { x: this.playerX, y: this.playerY },
      health: Math.max(0, this.health),
      maxHealth: this.config.playerMaxHealth,
      shield: this.shield,
      distortion: this.distortion,
      dashCooldown: this.dashClock,
      invulnerable: this.invulnerable,
      reconnectFX: this.reconnectFX,
      dashFX: this.dashFX,
      anchorPulse: this.anchorPulse,
      routeStep: this.routeStep,
      routeReady: this.routeReady,
      activeBeacon: this.activeBeacon(),
      enemies: this.enemies.map((enemy) => {
        const spec = this.config.enemies[enemy.specIndex]!;
        const phase =
          spec.pattern === "boss" ? bossPhase(enemy.health, spec.maxHealth) : 0;
        const intent = this.enemyIntent(enemy, spec, phase);
        return {
          id: enemy.id,
          slug: spec.slug,
          position: { x: enemy.x, y: enemy.y },
          health: enemy.health,
          maxHealth: spec.maxHealth,
          boss: spec.pattern === "boss",
          bossPhase: phase,
          bossMimic: phase > 0 ? this.bossMimic() : "",
          intentTicks: intent.ticks,
          intentTarget: intent.target,
        };
      }),
      projectiles: this.projectiles.map((bullet) => ({
        id: bullet.id,
        position: { x: bullet.x, y: bullet.y },
        velocity: { x: bullet.vx, y: bullet.vy },
        grazed: bullet.grazed,
      })),
    };
  }

  private movePlayer(input: ActionInput): void {
    const vector = directions[input.direction & 15] ?? directions[0];
    if (input.magnitude > 0) {
      const speed = Math.trunc(
        (this.config.buffs.moveSpeed * input.magnitude) / 3,
      );
      this.playerX += Math.trunc((vector.x * speed) / 1000);
      this.playerY += Math.trunc((vector.y * speed) / 1000);
    }
    if (input.skill && this.dashClock === 0) {
      const startX = this.playerX;
      const startY = this.playerY;
      const dashVector = input.magnitude === 0 ? directions[12] : vector;
      this.playerX += Math.trunc(((dashVector?.x ?? 0) * 620) / 1000);
      this.playerY += Math.trunc(((dashVector?.y ?? -1000) * 620) / 1000);
      this.invulnerable = 12;
      this.dashFX = 10;
      this.dashClock = this.config.buffs.dashCooldown;
      const empowered = this.routeReady;
      const radius = empowered ? 700 : 330;
      const damage = empowered
        ? Math.max(12, this.config.buffs.dashDamage)
        : Math.max(4, Math.trunc(this.config.buffs.dashDamage / 2));
      const midpointX = Math.trunc((startX + this.playerX) / 2);
      const midpointY = Math.trunc((startY + this.playerY) / 2);
      for (const enemy of this.enemies)
        if (
          nearTravelPath(
            enemy.x,
            enemy.y,
            startX,
            startY,
            midpointX,
            midpointY,
            this.playerX,
            this.playerY,
            radius,
          )
        )
          enemy.health -= damage;
      this.projectiles = this.projectiles.filter(
        (bullet) =>
          !nearTravelPath(
            bullet.x,
            bullet.y,
            startX,
            startY,
            midpointX,
            midpointY,
            this.playerX,
            this.playerY,
            radius,
          ),
      );
      if (empowered) {
        this.routeReady = false;
        this.routeWarpUsed = true;
      }
    }
    this.playerX = clamp(this.playerX, 120, ACTION_WIDTH - 120);
    this.playerY = clamp(this.playerY, 700, ACTION_HEIGHT - 120);
  }

  private collectBeacon(): void {
    const beacon = this.activeBeacon();
    if (
      distanceSquared(this.playerX, this.playerY, beacon.x, beacon.y) >
      370 ** 2
    )
      return;
    this.anchorPulse = 18;
    this.projectiles = this.projectiles.filter(
      (bullet) =>
        distanceSquared(this.playerX, this.playerY, bullet.x, bullet.y) >
        720 ** 2,
    );
    const pulseDamage = Math.max(
      2,
      Math.trunc(this.config.buffs.attackDamage / 2),
    );
    for (const enemy of this.enemies)
      if (
        distanceSquared(this.playerX, this.playerY, enemy.x, enemy.y) <=
        620 ** 2
      )
        enemy.health -= pulseDamage;
    this.routeStep += 1;
    if (this.routeStep === 3) {
      this.routeStep = 0;
      this.routeReady = true;
      this.routes += 1;
      this.dashClock = 0;
      if (this.config.buffs.routeHeal > 0)
        this.health = Math.min(
          this.config.playerMaxHealth,
          this.health + this.config.buffs.routeHeal,
        );
    }
  }

  private activeBeacon(): Vec {
    const pattern =
      routePatterns[(this.routePattern + this.routes) % routePatterns.length] ??
      routePatterns[0]!;
    return pattern[this.routeStep] ?? pattern[0]!;
  }

  private spawnEnemies(): void {
    if (this.enemies.length >= this.config.maxAlive) return;
    const shouldSpawn =
      this.tickValue === 1 ||
      (this.config.kind !== "boss" &&
        this.tickValue % this.config.spawnInterval === 0 &&
        this.tickValue < this.config.durationTicks - 90);
    if (!shouldSpawn) return;
    const specIndex = this.spawnIndex % this.config.enemies.length;
    const spec = this.config.enemies[specIndex]!;
    this.spawnIndex += 1;
    const edge = this.random.int(3);
    let x = 300 + this.random.int(ACTION_WIDTH - 600),
      y = 850;
    if (edge === 1) {
      x = 280;
      y = 900 + this.random.int(2800);
    }
    if (edge === 2) {
      x = ACTION_WIDTH - 280;
      y = 900 + this.random.int(2800);
    }
    if (spec.pattern === "boss") {
      x = ACTION_WIDTH / 2;
      y = 1200;
    }
    this.nextEnemyId += 1;
    this.enemies.push({
      id: this.nextEnemyId,
      specIndex,
      x,
      y,
      health:
        spec.maxHealth +
        Math.trunc((spec.maxHealth * this.config.noiseLevel) / 10),
      fireClock: 0,
    });
  }

  private updateEnemies(): void {
    for (const enemy of this.enemies) {
      if (enemy.health <= 0) continue;
      const spec = this.config.enemies[enemy.specIndex]!;
      const dx = this.playerX - enemy.x,
        dy = this.playerY - enemy.y;
      const distance = Math.max(1, Math.floor(Math.sqrt(dx * dx + dy * dy)));
      if (
        spec.pattern === "chaser" ||
        spec.pattern === "swarm" ||
        spec.pattern === "boss"
      ) {
        enemy.x += Math.trunc((dx * spec.speed) / distance);
        enemy.y += Math.trunc((dy * spec.speed) / distance);
      }
      if (distance < 270 && this.invulnerable === 0) {
        this.damagePlayer(Math.max(1, spec.contactDamage));
        this.invulnerable = 18;
      }
      enemy.fireClock += 1;
      const interval = Math.max(
        20,
        spec.fireInterval - this.config.noiseLevel * 3,
      );
      if (
        spec.fireInterval > 0 &&
        enemy.fireClock >= interval &&
        this.projectiles.length < 256
      ) {
        enemy.fireClock = 0;
        if (spec.pattern === "boss")
          this.fireBossVolley(enemy, spec, dx, dy, distance, interval);
        else this.fireProjectile(enemy, spec, dx, dy, distance);
      }
    }
    const alive: EnemyEntity[] = [];
    for (const enemy of this.enemies) {
      if (enemy.health > 0) alive.push(enemy);
      else this.kills += 1;
    }
    this.enemies = alive;
  }

  private fireProjectile(
    enemy: EnemyEntity,
    spec: EnemySpec,
    dx: number,
    dy: number,
    distance: number,
  ): void {
    const speed = Math.max(12, spec.projectileSpeed);
    this.fireProjectileVelocity(
      enemy,
      spec,
      Math.trunc((dx * speed) / distance),
      Math.trunc((dy * speed) / distance),
    );
  }

  private fireProjectileVelocity(
    enemy: EnemyEntity,
    spec: EnemySpec,
    vx: number,
    vy: number,
  ): void {
    if (this.projectiles.length >= 256) return;
    this.nextBulletId += 1;
    this.projectiles.push({
      id: this.nextBulletId,
      x: enemy.x,
      y: enemy.y,
      vx,
      vy,
      damage: Math.max(1, spec.projectileDamage),
      grazed: false,
    });
  }

  private fireBossVolley(
    enemy: EnemyEntity,
    spec: EnemySpec,
    dx: number,
    dy: number,
    distance: number,
    interval: number,
  ): void {
    const speed = Math.max(12, spec.projectileSpeed);
    const phase = bossPhase(enemy.health, spec.maxHealth);
    if (phase === 1) {
      const vector =
        directions[(Math.trunc(this.tickValue / interval) * 2) & 15]!;
      this.fireProjectileVelocity(
        enemy,
        spec,
        Math.trunc((vector.x * speed) / 1000),
        Math.trunc((vector.y * speed) / 1000),
      );
      return;
    }
    if (phase === 2) {
      const mimic = this.bossMimic();
      if (mimic === "distortion") {
        const vx = Math.trunc((dx * speed) / distance),
          vy = Math.trunc((dy * speed) / distance);
        this.fireProjectileVelocity(enemy, spec, vx, vy);
        this.fireProjectileVelocity(
          enemy,
          spec,
          Math.trunc((vx * 9 - vy * 4) / 10),
          Math.trunc((vy * 9 + vx * 4) / 10),
        );
        this.fireProjectileVelocity(
          enemy,
          spec,
          Math.trunc((vx * 9 + vy * 4) / 10),
          Math.trunc((vy * 9 - vx * 4) / 10),
        );
      } else if (mimic === "echo") {
        this.fireProjectile(enemy, spec, dx, dy, distance);
        enemy.health = Math.min(
          spec.maxHealth,
          enemy.health + Math.max(1, Math.trunc(spec.maxHealth / 200)),
        );
      } else {
        enemy.x = clamp(
          enemy.x + Math.trunc((dx * 280) / distance),
          150,
          ACTION_WIDTH - 150,
        );
        enemy.y = clamp(
          enemy.y + Math.trunc((dy * 280) / distance),
          700,
          ACTION_HEIGHT - 150,
        );
        this.fireProjectile(enemy, spec, dx, dy, distance);
      }
      return;
    }
    for (let index = 0; index < 16; index += 2) {
      const vector = directions[index]!;
      this.fireProjectileVelocity(
        enemy,
        spec,
        Math.trunc((vector.x * speed) / 1000),
        Math.trunc((vector.y * speed) / 1000),
      );
    }
  }

  private bossMimic(): string {
    const route =
      Math.max(0, this.config.buffs.dashDamage - 14) * 2 +
      this.config.buffs.routeHeal * 5 +
      Math.trunc(Math.max(0, 240 - this.config.buffs.dashCooldown) / 5);
    const distortion =
      this.config.buffs.overloadBonus +
      Math.max(0, this.config.buffs.distortionGain - 4) * 8;
    const echo =
      this.config.buffs.startingShield * 3 +
      this.config.buffs.reflectDamage * 6;
    if (distortion > route && distortion >= echo) return "distortion";
    if (echo > route && echo > distortion) return "echo";
    return "route";
  }

  private enemyIntent(
    enemy: EnemyEntity,
    spec: EnemySpec,
    phase: number,
  ): { ticks: number; target: Vec } {
    if (spec.fireInterval <= 0) return { ticks: 0, target: { x: 0, y: 0 } };
    const interval = Math.max(
      20,
      spec.fireInterval - this.config.noiseLevel * 3,
    );
    const remaining = interval - enemy.fireClock;
    const window = Math.max(6, 12 - this.config.noiseLevel * 2);
    if (remaining <= 0 || remaining > window)
      return { ticks: 0, target: { x: 0, y: 0 } };
    if (phase === 1) {
      const vector =
        directions[
          (Math.trunc((this.tickValue + remaining) / interval) * 2) & 15
        ]!;
      return {
        ticks: remaining,
        target: { x: enemy.x + vector.x * 3, y: enemy.y + vector.y * 3 },
      };
    }
    return { ticks: remaining, target: { x: this.playerX, y: this.playerY } };
  }

  private autoAttack(): void {
    this.attackClock += 1;
    if (this.attackClock < this.config.buffs.attackInterval) return;
    this.attackClock = 0;
    let nearest: EnemyEntity | null = null,
      nearestDistance = Number.MAX_SAFE_INTEGER;
    for (const enemy of this.enemies) {
      const distance = distanceSquared(
        this.playerX,
        this.playerY,
        enemy.x,
        enemy.y,
      );
      if (enemy.health > 0 && distance < nearestDistance) {
        nearest = enemy;
        nearestDistance = distance;
      }
    }
    if (!nearest) return;
    let damage = this.config.buffs.attackDamage;
    if (this.distortion >= 60)
      damage += Math.trunc(
        (damage * Math.max(25, this.config.buffs.overloadBonus)) / 100,
      );
    nearest.health -= damage;
  }

  private updateProjectiles(): void {
    const kept: ProjectileEntity[] = [];
    for (const current of this.projectiles) {
      const bullet = {
        ...current,
        x: current.x + current.vx,
        y: current.y + current.vy,
      };
      if (
        bullet.x < -100 ||
        bullet.x > ACTION_WIDTH + 100 ||
        bullet.y < 500 ||
        bullet.y > ACTION_HEIGHT + 100
      )
        continue;
      const distance = distanceSquared(
        this.playerX,
        this.playerY,
        bullet.x,
        bullet.y,
      );
      if (distance <= 175 ** 2) {
        if (this.invulnerable === 0) {
          this.damagePlayer(bullet.damage);
          this.invulnerable = 10;
        }
        continue;
      }
      if (!bullet.grazed && distance <= 310 ** 2) {
        bullet.grazed = true;
        this.lastGraze = this.tickValue;
        this.distortion +=
          this.config.buffs.distortionGain + this.config.noiseLevel;
        if (this.distortion >= 100) {
          this.damagePlayer(12);
          this.distortion = Math.min(55, 40 + this.config.noiseLevel * 5);
          this.projectiles = [];
          return;
        }
      }
      kept.push(bullet);
    }
    this.projectiles = kept;
  }

  private damagePlayer(amount: number): void {
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, amount);
      this.shield -= absorbed;
      amount -= absorbed;
      if (absorbed > 0 && this.config.buffs.reflectDamage > 0)
        for (const enemy of this.enemies)
          if (
            distanceSquared(this.playerX, this.playerY, enemy.x, enemy.y) <
            800 ** 2
          )
            enemy.health -= this.config.buffs.reflectDamage;
    }
    if (amount > 0) this.health -= amount;
  }

  private result(): ActionResult {
    const digest = fnvDigest([
      this.tickValue,
      Math.max(0, this.health),
      this.kills,
      this.routes,
      this.distortion,
      this.emergencyUsed ? 1 : 0,
      this.won ? 1 : 0,
    ]);
    return {
      won: this.won,
      health: Math.max(0, this.health),
      ticks: this.tickValue,
      kills: this.kills,
      routesCompleted: this.routes,
      distortion: this.distortion,
      emergencyReconnectUsed: this.emergencyUsed,
      digest,
      final: this.snapshot(),
    };
  }
}

export const createActionSimulation = async (
  config: ActionConfig,
): Promise<ActionSimulation> => {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(config.seed),
  );
  const seed = new DataView(digest).getUint32(0, true);
  return new ActionSimulation(config, seed);
};

export const buildActionConfig = (
  content: APIGameContent,
  run: APIGameRun,
): ActionConfig => {
  const encounterState = run.state.encounter;
  if (!encounterState) throw new Error("Run does not contain an encounter");
  const encounter = content.encounters.find(
    (item) => item.slug === encounterState.slug,
  );
  if (!encounter) throw new Error(`Unknown encounter ${encounterState.slug}`);
  const buffs: Buffs = {
    attackDamage: 8,
    attackInterval: 12,
    moveSpeed: 42,
    dashCooldown: 240,
    dashDamage: 14,
    startingShield: 0,
    overloadBonus: 0,
    distortionGain: 4,
    routeHeal: 0,
    reflectDamage: 0,
  };
  const apply = (effects: readonly { kind: string; amount?: number }[]) => {
    for (const effect of effects) {
      const amount = effect.amount ?? 0;
      if (effect.kind === "attack_damage") buffs.attackDamage += amount;
      else if (effect.kind === "attack_speed")
        buffs.attackInterval = Math.max(5, buffs.attackInterval - amount);
      else if (effect.kind === "move_speed") buffs.moveSpeed += amount;
      else if (effect.kind === "dash_cooldown")
        buffs.dashCooldown = Math.max(90, buffs.dashCooldown - amount);
      else if (effect.kind === "dash_damage") buffs.dashDamage += amount;
      else if (effect.kind === "starting_shield")
        buffs.startingShield += amount;
      else if (effect.kind === "overload_bonus") buffs.overloadBonus += amount;
      else if (effect.kind === "distortion_gain")
        buffs.distortionGain += amount;
      else if (effect.kind === "route_heal") buffs.routeHeal += amount;
      else if (effect.kind === "reflect_damage") buffs.reflectDamage += amount;
    }
  };
  for (const owned of run.state.modules) {
    const moduleDefinition = content.modules.find(
      (item) => item.slug === owned.slug,
    );
    if (!moduleDefinition) throw new Error(`Unknown module ${owned.slug}`);
    for (let level = 0; level < owned.level; level += 1)
      apply(moduleDefinition.effects);
  }
  for (const slug of run.state.plugins) {
    const plugin = content.plugins.find((item) => item.slug === slug);
    if (!plugin) throw new Error(`Unknown plugin ${slug}`);
    apply(plugin.effects);
  }
  return {
    seed: encounterState.seed,
    kind: encounter.kind,
    durationTicks: encounter.duration_ticks,
    maxTicks: encounter.max_ticks,
    spawnInterval: encounter.spawn_interval,
    maxAlive: encounter.max_alive,
    playerHealth: run.state.health,
    playerMaxHealth: run.state.max_health,
    noiseLevel: run.state.noise_level,
    emergencyReconnectAvailable: run.state.emergency_reconnect_available,
    buffs,
    enemies: encounter.enemy_slugs.map((slug) => {
      const enemy = content.enemies.find((item) => item.slug === slug);
      if (!enemy) throw new Error(`Unknown enemy ${slug}`);
      return {
        slug: enemy.slug,
        pattern: enemy.pattern,
        maxHealth: enemy.max_health,
        speed: enemy.speed,
        contactDamage: enemy.contact_damage,
        fireInterval: enemy.fire_interval,
        projectileSpeed: enemy.projectile_speed,
        projectileDamage: enemy.projectile_damage,
      };
    }),
  };
};

export class TraceRecorder {
  private readonly controls: number[] = [];
  push(input: ActionInput): void {
    this.controls.push(
      (input.direction & 15) |
        ((input.magnitude & 3) << 4) |
        (input.skill ? 0x40 : 0),
    );
  }
  encode(digest: string): ActionTrace {
    const bytes: number[] = [];
    for (let index = 0; index < this.controls.length; ) {
      const control = this.controls[index]!;
      let count = 1;
      while (
        index + count < this.controls.length &&
        this.controls[index + count] === control &&
        count < 255
      )
        count += 1;
      bytes.push(control, count);
      index += count;
    }
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return {
      encoding: "rle8-v1",
      ticks: this.controls.length,
      data: btoa(binary).replace(/=+$/, ""),
      client_digest: digest,
    };
  }
}

const distanceSquared = (ax: number, ay: number, bx: number, by: number) =>
  (ax - bx) ** 2 + (ay - by) ** 2;
const nearTravelPath = (
  x: number,
  y: number,
  startX: number,
  startY: number,
  midpointX: number,
  midpointY: number,
  endX: number,
  endY: number,
  radius: number,
) =>
  Math.min(
    distanceSquared(x, y, startX, startY),
    distanceSquared(x, y, midpointX, midpointY),
    distanceSquared(x, y, endX, endY),
  ) <=
  radius ** 2;
const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));
const bossPhase = (health: number, maxHealth: number) =>
  health * 3 > maxHealth * 2 ? 1 : health * 3 > maxHealth ? 2 : 3;
const fnvDigest = (values: readonly number[]): string => {
  let hash = 2166136261 >>> 0;
  for (const raw of values) {
    const value = raw >>> 0;
    for (let shift = 0; shift < 32; shift += 8) {
      hash =
        Math.imul((hash ^ ((value >>> shift) & 0xff)) >>> 0, 16777619) >>> 0;
    }
  }
  return hash.toString(16).padStart(8, "0");
};
