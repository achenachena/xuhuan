import type {
  ShooterBoss,
  ShooterContent,
  ShooterEnemySpec,
  ShooterGameRun,
  ShooterRuntimeConfig,
} from "@/lib/api/types";

export type ShooterPosition = { readonly x: number; readonly y: number };
export type ShooterEnemySnapshot = {
  readonly id: number;
  readonly spec_id: string;
  readonly chassis: ShooterEnemySpec["chassis"];
  readonly position: ShooterPosition;
  readonly health: number;
  readonly max_health: number;
  readonly boss: boolean;
  readonly stage?: number;
  readonly intent?: string;
  readonly marks?: number;
};
export type ShooterProjectileSnapshot = {
  readonly id: number;
  readonly position: ShooterPosition;
  readonly velocity: ShooterPosition;
  readonly hostile: boolean;
  readonly kind?: string;
  readonly radius?: number;
  readonly width?: number;
  readonly health?: number;
};
export type ShooterPickupSnapshot = {
  readonly id: number;
  readonly kind: "support_note";
  readonly position: ShooterPosition;
  readonly value: number;
};
export type ShooterThreatSnapshot = {
  readonly source_id: number;
  readonly kind: string;
  readonly ticks_remaining: number;
  readonly origin: ShooterPosition;
  readonly target: ShooterPosition;
  readonly radius?: number;
  readonly width?: number;
};
export type ShooterEffectSnapshot = {
  readonly id: number;
  readonly kind: string;
  readonly position: ShooterPosition;
  readonly ticks: number;
  readonly power?: number;
};
export type ShooterSnapshot = {
  readonly tick: number;
  readonly player_x: number;
  readonly health: number;
  readonly max_health: number;
  readonly shield: number;
  readonly invulnerable_ticks: number;
  readonly rescue_charge: number;
  readonly rescues_used: number;
  readonly graze_count: number;
  readonly combo: number;
  readonly score: number;
  readonly daily_variant?: string;
  readonly enemies: readonly ShooterEnemySnapshot[];
  readonly enemy_projectiles: readonly ShooterProjectileSnapshot[];
  readonly player_projectiles: readonly ShooterProjectileSnapshot[];
  readonly pickups: readonly ShooterPickupSnapshot[];
  readonly threats: readonly ShooterThreatSnapshot[];
  readonly effects: readonly ShooterEffectSnapshot[];
};
export type ShooterResult = {
  readonly won: boolean;
  readonly health: number;
  readonly ticks: number;
  readonly kills: number;
  readonly rescues_used: number;
  readonly grazes: number;
  readonly score: number;
  readonly daily_variant?: string;
  readonly final: ShooterSnapshot;
};

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
  readonly enemyHitIDs: readonly number[];
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
  enemyHitIDs: [],
  hit: false,
  shield: false,
  combo: false,
  rescue: false,
  bossWarning: false,
});
