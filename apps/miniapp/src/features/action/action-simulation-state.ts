import type {
  ActionConfig,
  SignalProtocol,
  SignalType,
} from "@/features/action/action-types";
import { ACTION_WIDTH } from "@/features/action/action-types";

export const PLAYER_RADIUS = 120;
export const ENEMY_RADIUS = 150;
export const BULLET_RADIUS = 55;
export const SIGNAL_RADIUS = 250;

export const SIGNAL_TYPES: readonly SignalType[] = ["surge", "guard", "echo"];
export const SIGNAL_PATTERNS = [
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
] as const;

export type EnemyEntity = {
  id: number;
  specIndex: number;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  fireClock: number;
  attackIndex: number;
};

export type ProjectileEntity = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  pattern: string;
  grazed: boolean;
  glitchMarked: boolean;
  delay: number;
};

export type DelayedWarpEntity = {
  start: { x: number; y: number };
  end: { x: number; y: number };
  triggerTick: number;
  damage: number;
  radius: number;
};

export type FriendlyProjectileEntity = {
  id: number;
  x: number;
  y: number;
  targetId: number;
  damage: number;
  life: number;
};

export type SafeZoneEntity = {
  position: { x: number; y: number };
  radius: number;
  expiresTick: number;
};

export class RandomStream {
  private value: number;

  constructor(seed: number) {
    this.value = seed >>> 0;
  }

  get state(): number {
    return this.value >>> 0;
  }

  int(limit: number): number {
    if (limit <= 1) return 0;
    if (this.value === 0) this.value = 0x9e3779b9;
    let next = this.value >>> 0;
    next = (next ^ (next << 13)) >>> 0;
    next = (next ^ (next >>> 17)) >>> 0;
    next = (next ^ (next << 5)) >>> 0;
    this.value = next;
    return next % limit;
  }
}

export type SimulationState = {
  config: ActionConfig;
  random: RandomStream;
  tickValue: number;
  playerX: number;
  playerY: number;
  health: number;
  shield: number;
  distortion: number;
  warpClock: number;
  invulnerable: number;
  attackClock: number;
  routeStep: number;
  routeReady: boolean;
  routeWarpUsed: boolean;
  lastGraze: number;
  totalGrazes: number;
  nextEnemyId: number;
  nextBulletId: number;
  spawnIndex: number;
  eliteSpawned: number;
  kills: number;
  eliteKills: number;
  emergencyUsed: boolean;
  reconnectFX: number;
  warpFX: number;
  signalPulse: number;
  signalPattern: number;
  weave: SignalType[];
  protocol: SignalProtocol;
  signalCooldown: number[];
  protocols: number;
  objectiveProgress: number;
  score: number;
  autoAttacks: number;
  warpReadyTick: number;
  lastSignalTick: number;
  lastSignal: SignalType | "";
  signalWaypoints: Array<{ x: number; y: number }>;
  lastWarpStart: { x: number; y: number };
  lastWarpEnd: { x: number; y: number };
  hasLastWarp: boolean;
  delayedWarps: DelayedWarpEntity[];
  nextFriendlyId: number;
  friendlyShots: FriendlyProjectileEntity[];
  blooms: Array<{ x: number; y: number }>;
  safeZones: SafeZoneEntity[];
  enemies: EnemyEntity[];
  projectiles: ProjectileEntity[];
  finished: boolean;
  won: boolean;
};

const normalizedRuntime = (config: ActionConfig): ActionConfig["runtime"] => ({
  ...config.runtime,
  behaviors: config.runtime.behaviors ?? [],
  attackDamage: config.runtime.attackDamage > 0 ? config.runtime.attackDamage : 8,
  attackInterval:
    config.runtime.attackInterval > 0 ? config.runtime.attackInterval : 12,
  moveSpeed: config.runtime.moveSpeed > 0 ? config.runtime.moveSpeed : 42,
  warpCooldown:
    config.runtime.warpCooldown > 0 ? config.runtime.warpCooldown : 120,
  warpDamage: config.runtime.warpDamage > 0 ? config.runtime.warpDamage : 14,
  distortionGain:
    config.runtime.distortionGain > 0 ? config.runtime.distortionGain : 4,
  grazeRadius:
    config.runtime.grazeRadius > 0 ? config.runtime.grazeRadius : 310,
});

export const normalizeActionConfig = (config: ActionConfig): ActionConfig => ({
  ...config,
  bossVariant:
    config.bossVariant === "authentic" || config.bossVariant === "retained"
      ? config.bossVariant
      : "balanced",
  maxTicks: config.maxTicks > 0 ? config.maxTicks : 1800,
  spawnInterval: config.spawnInterval > 0 ? config.spawnInterval : 180,
  maxAlive:
    config.maxAlive > 0 && config.maxAlive <= 18 ? config.maxAlive : 8,
  objective:
    config.objective.kind === "holdout" && config.objective.target === 0
      ? { kind: "holdout", target: config.durationTicks }
      : config.objective,
  runtime: normalizedRuntime(config),
});

export const createSimulationState = (
  config: ActionConfig,
  seed: number,
): SimulationState => {
  const normalized = normalizeActionConfig(config);
  return {
    config: normalized,
    random: new RandomStream(seed),
    tickValue: 0,
    playerX: ACTION_WIDTH / 2,
    playerY: 5200,
    health: normalized.playerHealth,
    shield: normalized.runtime.startingShield,
    distortion: 0,
    warpClock: 0,
    invulnerable: 0,
    attackClock: 0,
    routeStep: 0,
    routeReady: false,
    routeWarpUsed: false,
    lastGraze: -1000,
    totalGrazes: 0,
    nextEnemyId: 0,
    nextBulletId: 0,
    spawnIndex: 0,
    eliteSpawned: 0,
    kills: 0,
    eliteKills: 0,
    emergencyUsed: false,
    reconnectFX: 0,
    warpFX: 0,
    signalPulse: 0,
    signalPattern: seed % SIGNAL_PATTERNS.length,
    weave: [],
    protocol: "",
    signalCooldown: [0, 0, 0],
    protocols: 0,
    objectiveProgress: 0,
    score: 0,
    autoAttacks: 0,
    warpReadyTick: -1000,
    lastSignalTick: -1000,
    lastSignal: "",
    signalWaypoints: [],
    lastWarpStart: { x: 0, y: 0 },
    lastWarpEnd: { x: 0, y: 0 },
    hasLastWarp: false,
    delayedWarps: [],
    nextFriendlyId: 0,
    friendlyShots: [],
    blooms: [],
    safeZones: [],
    enemies: [],
    projectiles: [],
    finished: false,
    won: false,
  };
};

export const stableStringId = (value: string): number => {
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul((hash ^ value.charCodeAt(index)) >>> 0, 16777619) >>> 0;
  }
  return hash;
};
