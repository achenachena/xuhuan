import type { BattleOutcomeState } from "@xuhuan/game-types";

import type { TelegramThemeParams } from "@/lib/telegram-theme";

export type BattleOutcome = BattleOutcomeState;

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
