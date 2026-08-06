import type {
  BattleOutcomeState,
  CombatantSnapshot,
  StatusEffectSnapshot
} from "@xuhuan/game-types";

import type { TelegramThemeParams } from "@/lib/telegram-theme";

export type BattleOutcome = BattleOutcomeState;
export type StatusEffectState = StatusEffectSnapshot;

export type CombatantState = CombatantSnapshot & {
  readonly specialMeter: number;
  readonly comboCount: number;
  readonly isBlocking: boolean;
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
