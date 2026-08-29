import { goDivide } from "@/features/action/action-math";
import { bossVariantAttack } from "@/features/action/action-boss-scripts";
import type {
  ActionAttackSpec,
  ActionConfig,
  ActionEnemySpec,
  ActionTraitSpec,
} from "@/features/action/action-types";

export type EnemyMotion = { readonly x: number; readonly y: number };

export const hasEnemyTrait = (
  enemy: ActionEnemySpec,
  kind: string,
): boolean => findEnemyTrait(enemy, kind) !== undefined;

export const findEnemyTrait = (
  enemy: ActionEnemySpec,
  kind: string,
): ActionTraitSpec | undefined =>
  enemy.traits.find((trait) => trait.kind === kind);

export const enemyTraitAmount = (
  enemy: ActionEnemySpec,
  kind: string,
): number => findEnemyTrait(enemy, kind)?.amount ?? 0;

export const currentEnemyAttack = (
  enemy: ActionEnemySpec,
  attackIndex: number,
  health: number,
  maxHealth: number,
  bossVariant: ActionConfig["bossVariant"],
): ActionAttackSpec => {
  const index = attackIndex % enemy.attacks.length;
  if (enemy.kind === "boss" || enemy.pattern === "boss") {
    return bossVariantAttack({
      spec: enemy,
      attackIndex,
      health,
      maxHealth,
      variant: bossVariant,
    });
  }
  return enemy.attacks[index]!;
};

export const enemyMovement = ({
  enemy,
  id,
  tick,
  dx,
  dy,
  distance,
  telegraphing,
}: {
  readonly enemy: ActionEnemySpec;
  readonly id: number;
  readonly tick: number;
  readonly dx: number;
  readonly dy: number;
  readonly distance: number;
  readonly telegraphing: boolean;
}): EnemyMotion => {
  let x = 0;
  let y = 0;
  const behavior = enemy.movement.kind || enemy.pattern;
  switch (behavior) {
    case "chase":
    case "chaser":
    case "swarm":
    case "boss":
      x = goDivide(dx * enemy.speed, distance);
      y = goDivide(dy * enemy.speed, distance);
      break;
    case "strafe":
    case "sweeper":
    case "wander": {
      const direction = (goDivide(tick + id * 37, 105) & 1) === 0 ? 1 : -1;
      x = direction * enemy.speed;
      y = Math.min(
        enemy.speed,
        Math.max(-enemy.speed, goDivide(dy, 90)),
      );
      break;
    }
    case "orbit":
    case "orbiter":
    case "sniper": {
      const orbitDirection = (id & 1) === 0 ? 1 : -1;
      const preferred = enemy.pattern === "sniper" ? 2450 : 1500;
      const radial =
        distance > preferred + 260 ? 1 : distance < preferred - 260 ? -1 : 0;
      x =
        goDivide(dx * enemy.speed * radial, distance) +
        goDivide(-dy * enemy.speed * orbitDirection, distance * 2);
      y =
        goDivide(dy * enemy.speed * radial, distance) +
        goDivide(dx * enemy.speed * orbitDirection, distance * 2);
      break;
    }
    case "flee":
      x = goDivide(-dx * enemy.speed, distance);
      y = goDivide(-dy * enemy.speed, distance);
      break;
    case "charge":
    case "charger":
      if (!telegraphing) {
        x = goDivide(dx * enemy.speed, distance);
        y = goDivide(dy * enemy.speed, distance);
      }
      break;
  }
  return { x, y };
};
