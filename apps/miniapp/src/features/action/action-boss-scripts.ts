import type {
  ActionAttackSpec,
  ActionConfig,
  ActionEnemySpec,
  ActionRuntimeConfig,
} from "@/features/action/action-types";

const AUTHENTIC_BOSS_TELEGRAPH = 20;
const RETAINED_BOSS_TELEGRAPH = 16;
const BALANCED_BOSS_TELEGRAPH = 12;

export const enemyBossPhase = (health: number, maxHealth: number): number =>
  health * 3 > maxHealth * 2 ? 1 : health * 3 > maxHealth ? 2 : 3;

export const bossVariantAttack = ({
  spec,
  attackIndex,
  health,
  maxHealth,
  variant,
}: {
  readonly spec: ActionEnemySpec;
  readonly attackIndex: number;
  readonly health: number;
  readonly maxHealth: number;
  readonly variant: ActionConfig["bossVariant"];
}): ActionAttackSpec => {
  const phase = enemyBossPhase(health, maxHealth);
  const index = bossVariantAttackIndex(
    phase,
    attackIndex,
    spec.attacks.length,
    variant,
  );
  const authored = spec.attacks[index]!;
  const attack = { ...authored };
  const minimumTelegraph =
    attack.damage >= 8 ? BALANCED_BOSS_TELEGRAPH : 0;

  if (variant === "authentic") {
    attack.interval += 6;
    attack.telegraphTicks = Math.max(
      attack.telegraphTicks,
      AUTHENTIC_BOSS_TELEGRAPH,
    );
    if (attack.kind === "ring" || attack.kind === "spiral") {
      attack.count = Math.max(4, attack.count - 2);
    } else if (attack.kind === "fan") {
      attack.spread = Math.max(2, attack.spread - 1);
    }
  } else if (variant === "retained") {
    attack.interval = Math.max(20, attack.interval - 3);
    attack.telegraphTicks = Math.max(
      attack.telegraphTicks,
      RETAINED_BOSS_TELEGRAPH,
    );
    if (attack.kind === "ring" || attack.kind === "spiral") {
      attack.count = Math.min(16, Math.max(8, attack.count * 2));
    } else if (attack.kind === "fan") {
      attack.spread = Math.max(6, attack.spread + 2);
    } else if (attack.kind === "aimed") {
      attack.kind = "delayed_echo";
      attack.telegraphTicks = Math.max(
        attack.telegraphTicks,
        AUTHENTIC_BOSS_TELEGRAPH,
      );
    }
  } else {
    attack.telegraphTicks = Math.max(
      attack.telegraphTicks,
      minimumTelegraph,
    );
  }
  return attack;
};

export const bossVariantAttackIndex = (
  phase: number,
  attackIndex: number,
  attackCount: number,
  variant: ActionConfig["bossVariant"],
): number => {
  if (attackCount <= 1) return 0;
  if (variant === "authentic") {
    if (phase === 1) return 0;
    if (phase === 2) return attackIndex % Math.min(2, attackCount);
    return attackIndex % attackCount;
  }
  if (variant === "retained") {
    if (phase === 1) return attackCount - 1;
    if (phase === 2) return 1 + (attackIndex % (attackCount - 1));
    return attackCount - 1 - (attackIndex % attackCount);
  }
  if (phase === 3 && attackCount > 3) {
    return 2 + (attackIndex % (attackCount - 2));
  }
  return Math.min(phase - 1, attackCount - 1);
};

export const bossMimic = (runtime: ActionRuntimeConfig): string => {
  const route =
    Math.max(0, runtime.warpDamage - 14) * 2 +
    runtime.healOnProtocol * 5 +
    Math.trunc(Math.max(0, 240 - runtime.warpCooldown) / 5);
  const distortion =
    runtime.overloadBonus + Math.max(0, runtime.distortionGain - 4) * 8;
  const echo = runtime.startingShield * 3 + runtime.reflectDamage * 6;
  if (distortion > route && distortion >= echo) return "distortion";
  if (echo > route && echo > distortion) return "echo";
  return "route";
};
