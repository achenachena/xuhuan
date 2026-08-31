import type {
  APIShooterEffectSnapshot,
  APIShooterEnemySnapshot,
  APIShooterPickupSnapshot,
  APIShooterPosition,
  APIShooterProjectileSnapshot,
  APIShooterResult,
  APIShooterSnapshot,
  APIShooterThreatSnapshot,
  ShooterBoss,
  ShooterContent,
  ShooterEnemySpec,
  ShooterGameRun,
  ShooterRuntimeConfig,
} from "@/lib/api/types";

export type ShooterPosition = APIShooterPosition;
export type ShooterEnemySnapshot = APIShooterEnemySnapshot;
export type ShooterProjectileSnapshot = APIShooterProjectileSnapshot;
export type ShooterPickupSnapshot = APIShooterPickupSnapshot;
export type ShooterThreatSnapshot = APIShooterThreatSnapshot;
export type ShooterEffectSnapshot = APIShooterEffectSnapshot;
export type ShooterSnapshot = APIShooterSnapshot;
export type ShooterResult = APIShooterResult;

export type ShooterResolvedRuntime = {
  damage: number;
  fireInterval: number;
  multishot: number;
  pierce: number;
  startingShield: number;
  maxHealth: number;
  rescueCharge: number;
  rescueDamage: number;
  companionPower: number;
  grazeCharge: number;
  spread: number;
  guardOnSpecial: number;
  pickupMagnet: number;
  echoVolley: number;
  bossBreak: number;
  lowHealthPower: number;
  comboExtend: number;
  companionCharge: number;
  recoveryDrop: number;
};

export type ShooterRuntime = {
  readonly config: ShooterRuntimeConfig;
  readonly enemySpecs: ReadonlyMap<string, ShooterEnemySpec>;
  readonly boss: ShooterBoss | null;
  readonly resolved: ShooterResolvedRuntime;
  readonly dailyVariant: string;
};

export type ShooterEnemyEntity = {
  id: number;
  specIndex: number;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  fireClock: number;
  age: number;
  phase: number;
  warning: number;
  volley: number;
  marks: number;
  boss: boolean;
};

export type ShooterProjectileEntity = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  pierce: number;
  radius: number;
  width: number;
  health: number;
  kind: string;
  hostile: boolean;
  grazed: boolean;
};

export type ShooterPickupEntity = {
  id: number;
  x: number;
  y: number;
  value: number;
};

export type ShooterEffectEntity = {
  id: number;
  x: number;
  y: number;
  ticks: number;
  power: number;
  kind: ShooterEffectSnapshot["kind"];
};

export type ShooterMutableState = {
  readonly config: ShooterRuntimeConfig;
  readonly runtime: ShooterResolvedRuntime;
  readonly random: { integer: (limit: number) => number };
  tick: number;
  playerX: number;
  health: number;
  shield: number;
  invulnerableTicks: number;
  rescueCharge: number;
  rescueHeld: boolean;
  rescuesUsed: number;
  grazeCount: number;
  combo: number;
  comboClock: number;
  kills: number;
  score: number;
  attackClock: number;
  attackSequence: number;
  alignmentTicks: number;
  companionClocks: number[];
  nextEnemyID: number;
  nextProjectileID: number;
  nextPickupID: number;
  nextEffectID: number;
  spawnedBoss: boolean;
  lastRescueTick: number;
  bossPhaseTick: number;
  dailyVariant: string;
  enemies: ShooterEnemyEntity[];
  enemyProjectiles: ShooterProjectileEntity[];
  playerProjectiles: ShooterProjectileEntity[];
  pickups: ShooterPickupEntity[];
  pickupsCollected: number;
  lastPickupTick: number;
  pressureQuietTicks: number;
  effects: ShooterEffectEntity[];
};

export type ShooterStepEvents = {
  readonly pickup: boolean;
  readonly hit: boolean;
  readonly shield: boolean;
  readonly combo: boolean;
  readonly rescue: boolean;
  readonly bossWarning: boolean;
};

export type ShooterGateOption = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly kind: "weapon" | "companion" | "rescue";
  readonly behavior: string;
  readonly portraitURL?: string;
};

const rescueBehaviors = new Set([
  "guard_on_special",
  "low_health_power",
  "recovery_drop",
]);

export const resolveShooterGateOptions = (
  content: ShooterContent,
  run: ShooterGameRun,
): readonly ShooterGateOption[] => {
  const options: ShooterGateOption[] = [];
  for (const id of run.state.pending_show_options.slice(0, 2)) {
    const effect = content.show_effects.find((candidate) => candidate.id === id);
    if (effect) {
      options.push({
        id,
        title: effect.name,
        description: effect.description,
        kind: rescueBehaviors.has(effect.behavior) ? "rescue" : "weapon",
        behavior: effect.behavior,
      });
      continue;
    }
    const companion = content.companions.find((candidate) => candidate.id === id);
    if (companion) {
      options.push({
        id,
        title: companion.name,
        description: companion.description,
        kind: "companion",
        behavior: companion.assist.behavior,
        portraitURL: companion.portrait_url,
      });
    }
  }
  return options;
};

export const emptyStepEvents = (): ShooterStepEvents => ({
  pickup: false,
  hit: false,
  shield: false,
  combo: false,
  rescue: false,
  bossWarning: false,
});
