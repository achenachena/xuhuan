import type { APIGameContent, APIGameRun } from "@/lib/api/client";

export const ACTION_WIDTH = 3600;
export const ACTION_HEIGHT = 6400;
export const ACTION_TPS = 30;
export const ACTION_MAX_ENEMIES = 18;
export const ACTION_MAX_PROJECTILES = 160;
export const ACTION_MAX_FRIENDLY_PROJECTILES = 64;
export const ACTION_MAX_SIGNALS = 6;

export type ActionVec = { readonly x: number; readonly y: number };

export type ActionInput = {
  readonly direction: number;
  readonly magnitude: number;
  readonly skill: boolean;
};

export type ActionTrace = {
  readonly encoding: "rle8-v1";
  readonly ticks: number;
  readonly data: string;
  readonly prediction_digest: string;
};

export type SignalType = "surge" | "guard" | "echo";
export type SignalProtocol =
  | ""
  | "surge_break"
  | "guard_aegis"
  | "echo_replay"
  | "resonance";

export type ActionMovementSpec = {
  readonly kind: string;
  readonly amount: number;
};

export type ActionAttackSpec = {
  readonly kind: string;
  readonly interval: number;
  readonly projectileSpeed: number;
  readonly damage: number;
  readonly count: number;
  readonly spread: number;
  readonly telegraphTicks: number;
};

export type ActionTraitSpec = {
  readonly kind: string;
  readonly amount: number;
  readonly value: string;
};

export type ActionEnemySpec = {
  readonly slug: string;
  readonly kind: string;
  readonly imageUrl: string;
  readonly maxHealth: number;
  readonly speed: number;
  readonly contactDamage: number;
  readonly movement: ActionMovementSpec;
  readonly attacks: readonly ActionAttackSpec[];
  readonly traits: readonly ActionTraitSpec[];
  readonly pattern: string;
  readonly fireInterval: number;
  readonly projectileSpeed: number;
  readonly projectileDamage: number;
};

export type ActionRuntimeConfig = {
  readonly kit: string;
  readonly passive: string;
  readonly resonance: string;
  readonly attackDamage: number;
  readonly attackInterval: number;
  readonly moveSpeed: number;
  readonly warpCooldown: number;
  readonly warpDamage: number;
  readonly startingShield: number;
  readonly overloadBonus: number;
  readonly distortionGain: number;
  readonly protocolDamage: number;
  readonly protocolShield: number;
  readonly echoPower: number;
  readonly resonancePower: number;
  readonly projectilePierce: number;
  readonly projectileCount: number;
  readonly projectileSpeed: number;
  readonly grazeRadius: number;
  readonly healOnProtocol: number;
  readonly reflectDamage: number;
  readonly behaviors: readonly ActionRuntimeBehavior[];
};

export type ActionRuntimeBehavior = {
  readonly sourceSlug: string;
  readonly level: number;
  readonly kind:
    | "warp_aftershock"
    | "graze_guard"
    | "protocol_echo"
    | "kill_signal";
  readonly amount: number;
  readonly every: number;
};

export type ActionObjectiveConfig = {
  readonly kind:
    | "purge"
    | "stabilize"
    | "recover"
    | "holdout"
    | "elite"
    | "boss";
  readonly target: number;
};

export type ActionConfig = {
  readonly seed: string;
  readonly kind: string;
  readonly durationTicks: number;
  readonly maxTicks: number;
  readonly spawnInterval: number;
  readonly maxAlive: number;
  readonly playerHealth: number;
  readonly playerMaxHealth: number;
  readonly noiseLevel: number;
  readonly emergencyReconnectAvailable: boolean;
  readonly objective: ActionObjectiveConfig;
  readonly hazards: readonly string[];
  readonly bossVariant: "authentic" | "balanced" | "retained";
  readonly enemies: readonly ActionEnemySpec[];
  readonly runtime: ActionRuntimeConfig;
};

export type ActionEnemySnapshot = {
  readonly id: number;
  readonly slug: string;
  readonly kind: string;
  readonly movement: string;
  readonly attack: string;
  readonly traits: readonly ActionTraitSpec[];
  readonly position: ActionVec;
  readonly health: number;
  readonly maxHealth: number;
  readonly boss: boolean;
  readonly bossPhase: number;
  readonly bossMimic: string;
  readonly intentTicks: number;
  readonly intentTarget: ActionVec;
  readonly pattern: string;
};

export type ActionProjectileSnapshot = {
  readonly id: number;
  readonly pattern: string;
  readonly position: ActionVec;
  readonly velocity: ActionVec;
  readonly grazed: boolean;
  readonly glitchMarked: boolean;
};

export type ActionFriendlyProjectileSnapshot = {
  readonly id: number;
  readonly position: ActionVec;
  readonly targetId: number;
};

export type ActionWarpReplaySnapshot = {
  readonly start: ActionVec;
  readonly end: ActionVec;
  readonly triggerTicks: number;
};

export type ActionSafeZoneSnapshot = {
  readonly position: ActionVec;
  readonly radius: number;
  readonly ticks: number;
};

export type ActionSignalSnapshot = {
  readonly id: number;
  readonly type: SignalType;
  readonly position: ActionVec;
};

export type ActionObjectiveSnapshot = ActionObjectiveConfig & {
  readonly progress: number;
};

export type ActionSnapshot = {
  readonly tick: number;
  readonly player: ActionVec;
  readonly health: number;
  readonly maxHealth: number;
  readonly shield: number;
  readonly distortion: number;
  readonly warpCooldown: number;
  readonly invulnerable: number;
  readonly reconnectFX: number;
  readonly warpFX: number;
  readonly signalPulse: number;
  readonly signals: readonly ActionSignalSnapshot[];
  readonly weave: readonly SignalType[];
  readonly protocol: SignalProtocol;
  readonly objective: ActionObjectiveSnapshot;
  readonly score: number;
  readonly totalGrazes: number;
  readonly enemies: readonly ActionEnemySnapshot[];
  readonly projectiles: readonly ActionProjectileSnapshot[];
  readonly signalWaypoints: readonly ActionVec[];
  readonly blooms: readonly ActionVec[];
  readonly safeZones: readonly ActionSafeZoneSnapshot[];
  readonly friendlyShots: readonly ActionFriendlyProjectileSnapshot[];
  readonly warpReplays: readonly ActionWarpReplaySnapshot[];
};

export type ActionResult = {
  readonly won: boolean;
  readonly health: number;
  readonly ticks: number;
  readonly kills: number;
  readonly protocolsCompleted: number;
  readonly distortion: number;
  readonly score: number;
  readonly emergencyReconnectUsed: boolean;
  readonly digest: string;
  readonly final: ActionSnapshot;
};

const normalizePattern = (
  kind: string,
  movement: string,
  attack: string,
): string => {
  if (kind === "boss") return "boss";
  if (attack === "mine") return "mine";
  switch (movement) {
    case "orbit":
      return "orbiter";
    case "strafe":
      return "sweeper";
    case "charge":
      return "charger";
    case "flee":
      return "sniper";
    case "stationary":
      return "turret";
    case "wander":
      return "swarm";
    default:
      return "chaser";
  }
};

export const buildActionConfig = (
  content: APIGameContent,
  run: APIGameRun,
): ActionConfig => {
  const state = run.state;
  const stateWithNarrative = state as typeof state & {
    narrative_modifier?: {
      boss_variant?: "authentic" | "balanced" | "retained";
    };
  };
  const encounterState = state.encounter;
  if (!encounterState) throw new Error("Run does not contain an encounter");
  const encounter = content.encounters.find(
    (candidate) => candidate.slug === encounterState.slug,
  );
  if (!encounter) throw new Error(`Unknown encounter ${encounterState.slug}`);

  const enemies = encounter.enemy_slugs.map((slug): ActionEnemySpec => {
    const enemy = content.enemies.find((candidate) => candidate.slug === slug);
    if (!enemy) throw new Error(`Unknown enemy ${slug}`);
    const attacks = enemy.attacks.map((attack) => ({
      kind: attack.kind,
      interval: attack.interval,
      projectileSpeed: attack.projectile_speed,
      damage: attack.damage,
      count: attack.count ?? 0,
      spread: attack.spread ?? 0,
      telegraphTicks: attack.telegraph_ticks ?? 0,
    }));
    const firstAttack = attacks[0];
    return {
      slug: enemy.slug,
      kind: enemy.kind,
      imageUrl: enemy.image_url,
      maxHealth: enemy.max_health,
      speed: enemy.speed,
      contactDamage: enemy.contact_damage,
      movement: {
        kind: enemy.movement.kind,
        amount: enemy.movement.amount ?? 0,
      },
      attacks,
      traits: enemy.traits.map((trait) => ({
        kind: trait.kind,
        amount: trait.amount ?? 0,
        value: trait.value ?? "",
      })),
      pattern: normalizePattern(
        enemy.kind,
        enemy.movement.kind,
        firstAttack?.kind ?? "",
      ),
      fireInterval: firstAttack?.interval ?? 0,
      projectileSpeed: firstAttack?.projectileSpeed ?? 0,
      projectileDamage: firstAttack?.damage ?? 0,
    };
  });
  const runtime = state.runtime_config;
  return {
    seed: encounterState.seed,
    kind: encounterState.kind,
    durationTicks: encounterState.duration_ticks,
    maxTicks: encounterState.max_ticks,
    spawnInterval: encounter.spawn_interval,
    maxAlive: Math.min(ACTION_MAX_ENEMIES, encounter.max_alive),
    playerHealth: state.health,
    playerMaxHealth: state.max_health,
    noiseLevel: state.noise_level,
    emergencyReconnectAvailable: state.emergency_reconnect_available,
    objective: {
      kind: encounterState.objective.kind,
      target: encounterState.objective.target,
    },
    // Older and empty Go slices can arrive as JSON null even though the
    // protocol models hazards as an array. Normalize at the transport edge so
    // the deterministic runtime never has to branch on nullable collections.
    hazards: encounterState.hazards ?? [],
    bossVariant:
      stateWithNarrative.narrative_modifier?.boss_variant ?? "balanced",
    enemies,
    runtime: {
      kit: runtime.kit,
      passive: runtime.passive,
      resonance: runtime.resonance,
      attackDamage: runtime.attack_damage,
      attackInterval: runtime.attack_interval,
      moveSpeed: runtime.move_speed,
      warpCooldown: runtime.warp_cooldown,
      warpDamage: runtime.warp_damage,
      startingShield: runtime.starting_shield,
      overloadBonus: runtime.overload_bonus,
      distortionGain: runtime.distortion_gain,
      protocolDamage: runtime.protocol_damage,
      protocolShield: runtime.protocol_shield,
      echoPower: runtime.echo_power,
      resonancePower: runtime.resonance_power,
      projectilePierce: runtime.projectile_pierce,
      projectileCount: runtime.projectile_count,
      projectileSpeed: runtime.projectile_speed,
      grazeRadius: runtime.graze_radius,
      healOnProtocol: runtime.heal_on_protocol,
      reflectDamage: runtime.reflect_damage,
      behaviors: runtime.behaviors.map((behavior) => ({
        sourceSlug: behavior.source_slug,
        level: behavior.level,
        kind: behavior.kind,
        amount: behavior.amount,
        every: behavior.every ?? 0,
      })),
    },
  };
};
