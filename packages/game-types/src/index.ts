export type RewardBundle = {
  readonly experience: number;
  readonly credits: number;
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
  readonly specialMoveName: string;
  readonly specialMoveDesc: string;
  readonly rarity: string;
  readonly colorTheme: string;
};

export type GamePhase = "select" | "battle" | "reward";
