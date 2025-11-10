import type {
  BattleLogEntry,
  BattleOutcomeState,
  BattleSnapshot,
  CombatantAttributes,
  CombatantSnapshot,
  DamageSnapshot,
  HeroAction,
  HeroActionKind,
  RewardBundle,
  RewardDrop,
  RewardDropRarity,
  StatusEffectSnapshot
} from "@xuhuan/game-types";
import type { TelegramThemeParams } from "@/lib/telegram-theme";

export type {
  BattleLogEntry,
  HeroAction,
  HeroActionKind,
  RewardBundle,
  RewardDrop,
  RewardDropRarity
} from "@xuhuan/game-types";

export type AttributeSet = CombatantAttributes;
export type StatusEffectState = StatusEffectSnapshot;
export type CombatantState = CombatantSnapshot;
export type BattleOutcome = BattleOutcomeState;

export type BattleState = BattleSnapshot & {
  readonly seed: string;
};

export type SeededRandom = {
  readonly getFloat: () => number;
};

export type BattleContext = {
  readonly state: BattleState;
  readonly rng: SeededRandom;
};

export type TurnResolutionResult = {
  readonly state: BattleState;
  readonly events: readonly BattleLogEntry[];
};

export const updateBattleContext = (
  context: { readonly state: BattleState; readonly rng: SeededRandom },
  state: BattleState
): { readonly state: BattleState; readonly rng: SeededRandom } => {
  return {
    state,
    rng: context.rng
  };
};

export type CreateBattleOptions = {
  readonly hero: CombatantState;
  readonly enemy: CombatantState;
  readonly seed?: string;
};

const DAMAGE_VARIATION_MIN = 0.85;
const DAMAGE_VARIATION_SPAN = 0.3;
const DEFENSE_WEIGHT = 0.6;
const CRIT_MULTIPLIER_BASE = 1.5;
const BASE_EXPERIENCE_PER_LEVEL = 18;
const BASE_CREDITS_PER_LEVEL = 12;
const DROP_BASE_CHANCE = 0.15;
const DROP_LEVEL_SCALING = 0.02;
const MIN_DAMAGE = 1;

const hashSeed = (seed: string): number => {
  if (seed.length === 0) {
    return 0x6d2b79f5;
  }
  let hash = 0x811c9dc5 ^ seed.length;
  for (let index = 0; index < seed.length; index += 1) {
    const charCode = seed.charCodeAt(index);
    hash ^= charCode;
    hash = Math.imul(hash, 0x01000193);
    hash = (hash << 13) | (hash >>> 19);
  }
  return hash >>> 0;
};

export const createSeededRandom = (seed: string): SeededRandom => {
  let state = hashSeed(seed);
  const getFloat = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    const result = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return result;
  };
  return { getFloat };
};

const createBattleId = (turn: number, suffix: string): string => {
  return `turn-${turn}-${suffix}`;
};

const applyStatusModifiers = (attributes: AttributeSet, effects: readonly StatusEffectState[]): AttributeSet => {
  if (effects.length === 0) {
    return attributes;
  }
  const attackModifier = effects.reduce((total, effect) => total + effect.attackModifier, 0);
  const defenseModifier = effects.reduce((total, effect) => total + effect.defenseModifier, 0);
  const speedModifier = effects.reduce((total, effect) => total + effect.speedModifier, 0);
  return {
    maxHealth: attributes.maxHealth,
    attack: attributes.attack + attackModifier,
    defense: attributes.defense + defenseModifier,
    speed: attributes.speed + speedModifier,
    critRate: attributes.critRate,
    critDamage: attributes.critDamage
  };
};

const clampHealth = (value: number, maxHealth: number): number => {
  if (value <= 0) {
    return 0;
  }
  if (value >= maxHealth) {
    return maxHealth;
  }
  return value;
};

const calculateDamage = (
  attacker: CombatantState,
  defender: CombatantState,
  rng: SeededRandom,
  action: HeroActionKind
): { readonly amount: number; readonly isCritical: boolean } => {
  const attackerAttributes = applyStatusModifiers(attacker.attributes, attacker.statusEffects);
  const defenderAttributes = applyStatusModifiers(defender.attributes, defender.statusEffects);
  const variation = DAMAGE_VARIATION_MIN + rng.getFloat() * DAMAGE_VARIATION_SPAN;
  const actionModifier = action === "chargedStrike" ? 1.35 : 1;
  const defenseMitigation = defenderAttributes.defense * DEFENSE_WEIGHT;
  const rawDamage = Math.max(
    MIN_DAMAGE,
    (attackerAttributes.attack * actionModifier - defenseMitigation) * variation
  );
  const criticalThreshold = attackerAttributes.critRate;
  const isCritical = rng.getFloat() < criticalThreshold;
  const critMultiplier = isCritical ? CRIT_MULTIPLIER_BASE + attackerAttributes.critDamage : 1;
  const finalDamage = Math.max(MIN_DAMAGE, Math.round(rawDamage * critMultiplier));
  return {
    amount: finalDamage,
    isCritical
  };
};

const applyDamageToCombatant = (combatant: CombatantState, damage: { readonly amount: number; readonly isCritical: boolean }): CombatantState => {
  const nextHealth = clampHealth(combatant.currentHealth - damage.amount, combatant.attributes.maxHealth);
  return {
    ...combatant,
    currentHealth: nextHealth,
    statusEffects: combatant.statusEffects
  };
};

const tickStatusEffects = (combatant: CombatantState): CombatantState => {
  if (combatant.statusEffects.length === 0) {
    return combatant;
  }
  const remainingEffects = combatant.statusEffects
    .map((effect) => ({ ...effect, duration: effect.duration - 1 }))
    .filter((effect) => effect.duration > 0);
  return {
    ...combatant,
    statusEffects: remainingEffects
  };
};

const createLogEntry = (params: {
  readonly turn: number;
  readonly actor: "hero" | "enemy";
  readonly description: string;
  readonly damage?: { readonly amount: number; readonly isCritical: boolean };
}): BattleLogEntry => {
  const { turn, actor, description, damage } = params;
  return {
    id: createBattleId(turn, actor),
    turn,
    actor,
    description,
    damage
  };
};

const createRewardDrop = (enemy: CombatantState, rng: SeededRandom): readonly { readonly id: string; readonly name: string; readonly rarity: "common" | "rare" | "epic"; readonly quantity: number }[] => {
  const chance = DROP_BASE_CHANCE + enemy.level * DROP_LEVEL_SCALING;
  if (rng.getFloat() > chance) {
    return [];
  }
  const rarityRoll = rng.getFloat();
  const rarity: "common" | "rare" | "epic" = rarityRoll > 0.85 ? "epic" : rarityRoll > 0.55 ? "rare" : "common";
  const quantity = rarity === "epic" ? 1 : rarity === "rare" ? 2 : 3;
  return [
    {
      id: `${enemy.id}-core`,
      name: `${enemy.name} Core`,
      rarity,
      quantity
    }
  ];
};

const createRewards = (enemy: CombatantState, rng: SeededRandom): RewardBundle => {
  const experience = enemy.level * BASE_EXPERIENCE_PER_LEVEL;
  const credits = enemy.level * BASE_CREDITS_PER_LEVEL;
  const drops = createRewardDrop(enemy, rng);
  return {
    experience,
    credits,
    drops
  };
};

export const createBattleState = (options: CreateBattleOptions): { readonly state: BattleState; readonly rng: SeededRandom } => {
  const { hero, enemy, seed = `${hero.id}-${enemy.id}-${Date.now()}` } = options;
  const initialHero: CombatantState = {
    ...hero,
    currentHealth: clampHealth(hero.currentHealth, hero.attributes.maxHealth),
    statusEffects: hero.statusEffects
  };
  const initialEnemy: CombatantState = {
    ...enemy,
    currentHealth: clampHealth(enemy.currentHealth, enemy.attributes.maxHealth),
    statusEffects: enemy.statusEffects
  };
  const initialState: BattleState = {
    seed,
    turn: 1,
    hero: initialHero,
    enemy: initialEnemy,
    log: [],
    outcome: "inProgress"
  };
  const rng = createSeededRandom(seed);
  return { state: initialState, rng };
};

const resolveHeroAction = (
  context: { readonly state: BattleState; readonly rng: SeededRandom },
  action: HeroAction,
  description: string
): { readonly state: BattleState; readonly entry: BattleLogEntry } => {
  const { state, rng } = context;
  const damage = calculateDamage(state.hero, state.enemy, rng, action.kind);
  const nextEnemy = applyDamageToCombatant(state.enemy, damage);
  const entry = createLogEntry({
    turn: state.turn,
    actor: "hero",
    description,
    damage
  });
  const updatedState: BattleState = {
    ...state,
    enemy: nextEnemy
  };
  return { state: updatedState, entry };
};

const resolveEnemyRetaliation = (
  context: { readonly state: BattleState; readonly rng: SeededRandom }
): { readonly state: BattleState; readonly entry: BattleLogEntry } => {
  const { state, rng } = context;
  const damage = calculateDamage(state.enemy, state.hero, rng, "basicAttack");
  const nextHero = applyDamageToCombatant(state.hero, damage);
  const entry = createLogEntry({
    turn: state.turn,
    actor: "enemy",
    description: `${state.enemy.name} retaliates for ${damage.amount} damage.`,
    damage
  });
  const updatedState: BattleState = {
    ...state,
    hero: nextHero
  };
  return { state: updatedState, entry };
};

const advanceTurn = (state: BattleState): BattleState => {
  return {
    ...state,
    turn: state.turn + 1,
    hero: tickStatusEffects(state.hero),
    enemy: tickStatusEffects(state.enemy)
  };
};

const determineOutcome = (
  state: BattleState,
  rng: SeededRandom
): { readonly state: BattleState; readonly completed: boolean } => {
  if (state.enemy.currentHealth <= 0) {
    const rewards = createRewards(state.enemy, rng);
    return {
      state: {
        ...state,
        outcome: "victory",
        rewards
      },
      completed: true
    };
  }
  if (state.hero.currentHealth <= 0) {
    return {
      state: {
        ...state,
        outcome: "defeat"
      },
      completed: true
    };
  }
  return {
    state,
    completed: false
  };
};

const describeHeroAction = (action: HeroActionKind, enemyName: string): string => {
  if (action === "chargedStrike") {
    return `You channel resonance and strike ${enemyName} with amplified force.`;
  }
  if (action === "fortify") {
    return `You brace for impact, restoring a portion of your guard.`;
  }
  return `You attack ${enemyName} with a swift strike.`;
};

const applyFortify = (state: BattleState): BattleState => {
  const restoredHealth = Math.round(state.hero.attributes.maxHealth * 0.08);
  const nextHealth = clampHealth(state.hero.currentHealth + restoredHealth, state.hero.attributes.maxHealth);
  return {
    ...state,
    hero: {
      ...state.hero,
      currentHealth: nextHealth
    }
  };
};

export const resolveTurn = (
  context: { readonly state: BattleState; readonly rng: SeededRandom },
  action: HeroAction
): TurnResolutionResult => {
  let nextState = context.state;
  let rngContext: { readonly state: BattleState; readonly rng: SeededRandom } = { state: nextState, rng: context.rng };
  const description = describeHeroAction(action.kind, context.state.enemy.name);
  const heroResult = action.kind === "fortify"
    ? { state: applyFortify(nextState), entry: createLogEntry({ turn: nextState.turn, actor: "hero", description }) }
    : resolveHeroAction(rngContext, action, description);

  nextState = heroResult.state;
  const events: BattleLogEntry[] = [heroResult.entry];

  const outcomeAfterHero = determineOutcome(nextState, context.rng);
  if (outcomeAfterHero.completed) {
    const completedState = {
      ...outcomeAfterHero.state,
      log: [...nextState.log, ...events]
    };
    return {
      state: completedState,
      events
    };
  }

  rngContext = { state: nextState, rng: context.rng };
  const enemyResult = resolveEnemyRetaliation(rngContext);
  nextState = enemyResult.state;
  events.push(enemyResult.entry);

  const outcomeAfterEnemy = determineOutcome(nextState, context.rng);
  const updatedState = advanceTurn(outcomeAfterEnemy.state);
  const completedState =
    outcomeAfterEnemy.completed === true
      ? { ...updatedState, outcome: outcomeAfterEnemy.state.outcome, rewards: outcomeAfterEnemy.state.rewards }
      : updatedState;

  return {
    state: {
      ...completedState,
      log: [...context.state.log, ...events]
    },
    events
  };
};

export const summarizeBattleTheme = (
  theme: TelegramThemeParams | undefined,
  outcome: BattleOutcome
): string => {
  if (outcome === "victory") {
    return theme?.buttonColor ?? "#16a34a";
  }
  if (outcome === "defeat") {
    return theme?.hintColor ?? "#dc2626";
  }
  return theme?.secondaryBackgroundColor ?? "#334155";
};

