import {
  PLAYER_RADIUS,
  PLAYER_Y,
  SHOOTER_WIDTH,
  clamp,
  goDivide,
  integerSqrt,
} from "@/features/shooter/constants";
import { storyChoiceMode } from "@/features/shooter/story";
import type {
  ShooterEffectEntity,
  ShooterMutableState,
  ShooterPickupPower,
  ShooterResolvedRuntime,
  ShooterRuntime,
} from "@/features/shooter/types";
import type { ShooterRuntimeConfig } from "@/lib/api/types";
import { updateReversalWeapons } from "@/features/shooter/reversal";

export const createShooterRuntime = (
  config: ShooterRuntimeConfig,
): ShooterRuntime => {
  const resolved: ShooterResolvedRuntime = {
    damage: config.kit.attack_damage,
    fireInterval: config.kit.fire_interval,
    multishot: 1,
    pierce: 0,
    startingShield: clamp(config.kit.starting_shield, 0, 1),
    maxHealth: 3,
    rescueCharge: config.starting_rescue_charge,
    rescueDamage: config.kit.rescue_damage,
    grazeCharge: 4,
    spread: 0,
    guardOnSpecial: 0,
    pickupMagnet: 0,
    echoVolley: 0,
    bossBreak: 0,
    lowHealthPower: 0,
    comboExtend: 0,
    companionCharge: 0,
    recoveryDrop: 0,
  };
  for (const effect of config.show_effects) {
    switch (effect.kind) {
      case "twin_shot":
        resolved.multishot += effect.amount;
        break;
      case "piercing_shot":
        resolved.pierce += effect.amount;
        break;
      case "spread_shot":
        resolved.spread += effect.amount;
        resolved.multishot += 2;
        break;
      case "graze_charge":
        resolved.grazeCharge += effect.amount;
        break;
      case "guard_on_special":
        resolved.guardOnSpecial += effect.amount;
        break;
      case "pickup_magnet":
        resolved.pickupMagnet += effect.amount;
        break;
      case "echo_volley":
        resolved.echoVolley += effect.amount;
        break;
      case "boss_break":
        resolved.bossBreak += effect.amount;
        break;
      case "low_health_power":
        resolved.lowHealthPower += effect.amount;
        break;
      case "combo_extend":
        resolved.comboExtend += effect.amount;
        break;
      case "companion_charge":
        resolved.companionCharge += effect.amount;
        break;
      case "recovery_drop":
        resolved.recoveryDrop += effect.amount;
        break;
    }
  }
  resolved.fireInterval = Math.max(3, resolved.fireInterval);
  resolved.multishot = clamp(resolved.multishot, 1, 5);

  const dailyVariant = config.daily ? (config.daily_modifier_id ?? "") : "";

  return {
    config,
    resolved,
    dailyVariant,
  };
};

export const grantShooterShield = (state: ShooterMutableState, amount: number): void => {
  state.shield = clamp(state.shield + Math.max(0, amount), 0, 1);
};

export const addPlayerProjectile = (
  state: ShooterMutableState,
  values: {
    x: number;
    y: number;
    vx?: number;
    vy: number;
    damage: number;
    pierce?: number;
    kind?: string;
    radius?: number;
  },
): boolean => {
  if (state.playerProjectiles.length >= state.config.limits.player_projectiles) {
    return false;
  }
  state.nextProjectileID += 1;
  state.playerProjectiles.push({
    id: state.nextProjectileID,
    x: values.x,
    y: values.y,
    vx: values.vx ?? 0,
    vy: values.vy,
    damage: values.damage,
    pierce: values.pierce ?? 0,
    radius: values.radius ?? 0,
    width: 0,
    health: 0,
    kind: values.kind ?? "",
    hostile: false,
    grazed: false,
  });
  return true;
};

export const addShooterEffect = (
  state: ShooterMutableState,
  kind: ShooterEffectEntity["kind"],
  x: number,
  y: number,
  ticks: number,
  power: number,
): void => {
  if (!kind || ticks <= 0 || state.effects.length >= state.config.limits.effects) {
    return;
  }
  state.nextEffectID += 1;
  state.effects.push({ id: state.nextEffectID, kind, x, y, ticks, power });
};

export const resolvePickupWeapon = (
  power: ShooterPickupPower | null,
  runtime: Pick<
    ShooterResolvedRuntime,
    "damage" | "fireInterval" | "multishot" | "pierce" | "spread"
  >,
) => ({
  fireInterval:
    power === "rapid"
      ? Math.max(3, goDivide(runtime.fireInterval * 2, 3))
      : runtime.fireInterval,
  damage:
    power === "pierce"
      ? runtime.damage + Math.max(1, goDivide(runtime.damage, 2))
      : runtime.damage,
  shotCount: clamp(
    power === "rapid"
      ? Math.max(2, runtime.multishot)
      : power === "spread"
        ? Math.max(3, runtime.multishot)
        : runtime.multishot,
    1,
    5,
  ),
  pierce: runtime.pierce + (power === "pierce" ? 2 : 0),
  spread: power === "spread" ? 14 : runtime.spread > 0 ? 5 + runtime.spread * 2 : 0,
  projectileKind: power ?? "",
});

export const updateWeapons = (state: ShooterMutableState): void => {
  if (state.config.reversal) { updateReversalWeapons(state); return; }
  state.attackClock += 1;
  const pickupPower = state.pickupPowerTicks > 0 ? state.pickupPower : null;
  const pickupWeapon = resolvePickupWeapon(pickupPower, state.runtime);
  if (
    state.attackClock < pickupWeapon.fireInterval ||
    state.playerProjectiles.length >= state.config.limits.player_projectiles
  ) {
    return;
  }
  state.attackClock = 0;
  state.attackSequence += 1;
  let damage = pickupWeapon.damage;
  if (state.health === 1) damage += state.runtime.lowHealthPower;
  if (state.config.kit.id === "jiaran" && state.combo >= 6) {
    damage += Math.max(1, goDivide(damage, 4));
  }
  const count = pickupWeapon.shotCount;
  for (let index = 0; index < count; index += 1) {
    const lane = index * 2 - (count - 1);
    if (
      !addPlayerProjectile(state, {
        x: clamp(
          state.playerX + lane * 34,
          PLAYER_RADIUS,
          SHOOTER_WIDTH - PLAYER_RADIUS,
        ),
        y: PLAYER_Y,
        vx:
          pickupWeapon.spread > 0 ? lane * pickupWeapon.spread : 0,
        vy: -390,
        damage,
        pierce: pickupWeapon.pierce,
        ...(pickupWeapon.projectileKind
          ? { kind: pickupWeapon.projectileKind }
          : {}),
      })
    ) break;
  }
  if (state.config.kit.id === "bella" && state.attackSequence % 3 === 0) {
    for (const vx of [-75, 75]) {
      if (!addPlayerProjectile(state, {
        x: state.playerX,
        y: PLAYER_Y,
        vx,
        vy: -175,
        damage: Math.max(1, goDivide(damage * 3, 4)),
        pierce: state.runtime.pierce,
      })) break;
    }
    addShooterEffect(state, "cadence_volley", state.playerX, PLAYER_Y, 12, state.attackSequence);
  }
  if (
    state.runtime.echoVolley > 0 &&
    state.tick % Math.max(1, state.runtime.fireInterval * Math.max(2, 6 - state.runtime.echoVolley)) === 0
  ) {
    addPlayerProjectile(state, {
      x: state.playerX,
      y: PLAYER_Y + 220,
      vy: -155,
      damage: Math.max(1, goDivide(damage, 2)),
      pierce: state.runtime.pierce,
    });
  }
  if (
    state.config.kit.id === "xiangwan" &&
    state.attackClock === 0 &&
    state.tick % Math.max(1, state.runtime.fireInterval * 4) === 0
  ) {
    addPlayerProjectile(state, {
      x: state.playerX,
      y: PLAYER_Y + 180,
      vy: -150,
      damage: Math.max(1, goDivide(damage, 2)),
      pierce: state.runtime.pierce,
    });
  }
};

const companionSignal = (state: ShooterMutableState, trigger: string): number => {
  switch (trigger) {
    case "segment_start": return 1;
    case "graze_streak": return Math.floor(state.grazeCount / 5);
    case "low_health": return state.health === 1 ? 1 : 0;
    case "special_used": return state.rescuesUsed;
    case "boss_stage": return state.enemies.find((enemy) => enemy.boss && enemy.health > 0)?.phase ?? 0;
    case "pickup_chain": return Math.floor(state.pickupsCollected / 3);
    // Saved runs may still use Nana's former trigger. Hold its volley for
    // the next living target, rather than spending it in an empty arena.
    case "wave_clear": return state.enemies.every((enemy) => enemy.health <= 0) ? state.kills : 0;
    default: return 0;
  }
};

const activateCompanion = (
  state: ShooterMutableState,
  index: number,
  behavior: string,
  amount: number,
): boolean => {
  if (behavior === "shield") {
    if (state.shield >= 1) return false;
    grantShooterShield(state, amount);
    return true;
  }
  if (behavior === "clear_lane") {
    const before = state.enemyProjectiles.length;
    state.enemyProjectiles = state.enemyProjectiles.filter(
      (bullet) => Math.abs(bullet.x - state.playerX) > 220 + amount * 20,
    );
    return state.enemyProjectiles.length < before;
  }
  if (behavior === "convert_bullet") {
    const before = state.playerProjectiles.length;
    let converted = Math.min(amount, state.enemyProjectiles.length);
    while (converted > 0 && state.playerProjectiles.length < state.config.limits.player_projectiles) {
      const bullet = state.enemyProjectiles.pop();
      if (!bullet) break;
      addPlayerProjectile(state, { x: bullet.x, y: bullet.y, vy: -165, damage: Math.max(1, amount) });
      converted -= 1;
    }
    return state.playerProjectiles.length > before;
  }
  if (behavior === "heal") {
    state.health = Math.min(state.runtime.maxHealth, state.health + amount);
    return true;
  }
  const target = state.enemies.filter((enemy) => enemy.health > 0)
    .sort((left, right) => Math.abs(left.x - state.playerX) - Math.abs(right.x - state.playerX) || right.y - left.y)[0];
  if (!target) return false;
  if (behavior === "focus_beam") {
    target.health -= amount * 2;
    addShooterEffect(state, "alignment_beam", target.x, target.y, 12, amount * 2);
    return true;
  }
  const offset = index & 1 ? 220 : -220;
  const count = behavior === "echo_shot" ? 2 : 1;
  let fired = false;
  for (let shot = 0; shot < count; shot += 1) {
    const x = clamp(state.playerX + offset, PLAYER_RADIUS, SHOOTER_WIDTH - PLAYER_RADIUS);
    const y = PLAYER_Y + 80 + shot * 80;
    const dx = target.x - x, dy = target.y - y;
    const distance = Math.max(1, integerSqrt(dx * dx + dy * dy));
    if (!addPlayerProjectile(state, {
      x, y, vx: goDivide(dx * 260, distance), vy: goDivide(dy * 260, distance),
      damage: amount,
    })) break;
    fired = true;
  }
  return fired;
};

export const updateCompanions = (state: ShooterMutableState): void => {
  for (let index = 0; index < state.config.companions.length; index += 1) {
    const companion = state.config.companions[index]!;
    state.companionClocks[index] = (state.companionClocks[index] ?? 0) + 1;
    const signal = companionSignal(state, companion.trigger);
    if (signal > 0 && signal !== state.companionSignals[index]) state.companionPending[index] = true;
    state.companionSignals[index] = signal;
    if (companion.trigger === "low_health" && signal === 0) state.companionPending[index] = false;
    const mode = storyChoiceMode(state.config.story_choice_id);
    const cooldown =
      mode === 2
        ? goDivide(companion.cooldown_ticks * 3, 4)
        : companion.cooldown_ticks;
    if (
      state.companionClocks[index]! < Math.max(1, cooldown) ||
      !state.companionPending[index]
    ) continue;
    let amount = Math.max(1, companion.amount);
    if (mode === 1) amount += Math.max(1, goDivide(amount, 2));
    if (!activateCompanion(
      state,
      index,
      companion.behavior,
      amount,
    )) continue;
    state.companionClocks[index] = 0;
    state.companionPending[index] = false;
    if (mode !== 0) {
      addShooterEffect(
        state,
        "choice_assist",
        state.playerX,
        PLAYER_Y,
        18,
        mode,
      );
    }
    earnCompanionRescue(state, state.runtime.companionCharge);
  }
};

const earnCompanionRescue = (state: ShooterMutableState, amount: number): void => {
  if (amount <= 0) return;
  const adjusted = Math.max(
    1,
    goDivide(
      amount * (100 - state.config.special_charge_penalty_percent),
      100,
    ),
  );
  state.rescueCharge = Math.min(100, state.rescueCharge + adjusted);
};
