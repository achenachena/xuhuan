export type CombatantKind = "hero" | "enemy";

export type CombatantAttributes = {
  readonly maxHealth: number;
  readonly attack: number;
  readonly defense: number;
  readonly speed: number;
  readonly critRate: number;
  readonly critDamage: number;
};

export type StatusEffectSnapshot = {
  readonly id: string;
  readonly name: string;
  readonly duration: number;
  readonly attackModifier: number;
  readonly defenseModifier: number;
  readonly speedModifier: number;
};

export type CombatantSnapshot = {
  readonly id: string;
  readonly name: string;
  readonly level: number;
  readonly kind: CombatantKind;
  readonly attributes: CombatantAttributes;
  readonly currentHealth: number;
  readonly statusEffects: readonly StatusEffectSnapshot[];
};

export type DamageSnapshot = {
  readonly amount: number;
  readonly isCritical: boolean;
};

export type BattleLogEntry = {
  readonly id: string;
  readonly turn: number;
  readonly actor: CombatantKind;
  readonly description: string;
  readonly damage?: DamageSnapshot;
};

export type RewardDropRarity = "common" | "rare" | "epic";

export type RewardDrop = {
  readonly id: string;
  readonly name: string;
  readonly rarity: RewardDropRarity;
  readonly quantity: number;
};

export type RewardBundle = {
  readonly experience: number;
  readonly credits: number;
  readonly drops: readonly RewardDrop[];
};

export type BattleOutcomeState = "inProgress" | "victory" | "defeat";

export type FightingMoveKind = "lightAttack" | "heavyAttack" | "specialMove" | "block" | "counter";

// Character Model (from database)
export type Character = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly vtuberArchetype: string;
  readonly bio: string;
  readonly portraitUrl: string;
  readonly spriteUrl: string;
  readonly baseHealth: number;
  readonly baseAttack: number;
  readonly baseDefense: number;
  readonly baseSpeed: number;
  readonly baseCritRate: number;
  readonly baseCritDamage: number;
  readonly specialMoveName: string;
  readonly specialMoveDesc: string;
  readonly specialMoveType: string;
  readonly rarity: string;
  readonly colorTheme: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
};

export type GamePhase = "select" | "battle" | "reward";
