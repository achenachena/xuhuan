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

export type BattleSnapshot = {
  readonly runId?: string;
  readonly turn: number;
  readonly hero: CombatantSnapshot;
  readonly enemy: CombatantSnapshot;
  readonly outcome: BattleOutcomeState;
  readonly log: readonly BattleLogEntry[];
  readonly rewards?: RewardBundle;
};

// Fighting Game Move Types
export type FightingMoveKind = "lightAttack" | "heavyAttack" | "specialMove" | "block" | "counter";

export type FightingMove = {
  readonly kind: FightingMoveKind;
};

// Legacy action types (for backward compatibility during migration)
export type HeroActionKind = "basicAttack" | "chargedStrike" | "fortify";

export type HeroAction = {
  readonly kind: HeroActionKind;
};

export type SeededRandomSnapshot = {
  readonly seed: string;
  readonly cursor: number;
};

// VTuber Character Information
export type VTuberCharacter = {
  readonly id: string;
  readonly vtuberName: string;
  readonly displayName: string;
  readonly imageUrl: string;
  readonly bio?: string;
  readonly specialMoveName: string;
  readonly specialMoveDescription: string;
};

// Fighting Game State Extensions
export type FighterState = CombatantSnapshot & {
  readonly specialMeter: number;  // 0-100, fills with damage dealt/taken
  readonly comboCount: number;     // Consecutive hits without being hit back
  readonly isBlocking: boolean;    // Whether fighter is currently blocking
  readonly vtuberInfo?: VTuberCharacter;
};

// Fighting Game Match State
export type MatchState = {
  readonly matchId?: string;
  readonly round: number;          // Current round (1-3 for best of 3)
  readonly turn: number;
  readonly player1: FighterState;
  readonly player2: FighterState;
  readonly outcome: BattleOutcomeState;
  readonly log: readonly BattleLogEntry[];
  readonly rewards?: RewardBundle;
  readonly player1Wins: number;    // Rounds won by player 1
  readonly player2Wins: number;    // Rounds won by player 2
};

// Move Properties
export type MoveProperties = {
  readonly kind: FightingMoveKind;
  readonly displayName: string;
  readonly damageMultiplier: number;  // Multiplier applied to base attack
  readonly meterCost: number;         // Special meter required (0-100)
  readonly meterGain: number;         // Meter gained on use
  readonly priority: number;          // Higher priority wins simultaneous trades
  readonly description: string;
};

