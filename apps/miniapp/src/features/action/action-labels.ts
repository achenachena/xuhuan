import type {
  ActionSnapshot,
  SignalProtocol,
} from "@/features/action/action-types";
import { gameText, type GameLocale } from "@/features/game/game-copy";

export const objectiveStatusLabel = (
  snapshot: ActionSnapshot,
  locale: GameLocale,
): string => {
  const { kind, progress, target } = snapshot.objective;
  const count = `${Math.min(progress, target)}/${target}`;
  switch (kind) {
    case "purge":
      return `${gameText(locale, "objectivePurgeShort")} ${count}`;
    case "stabilize":
      return `${gameText(locale, "objectiveStabilizeShort")} ${count}s`;
    case "recover":
      return `${gameText(locale, "objectiveRecoverShort")} ${count}`;
    case "holdout":
      return `${gameText(locale, "objectiveHoldoutShort")} ${count}`;
    case "elite":
      return gameText(locale, "objectiveEliteShort");
    case "boss":
      return gameText(locale, "objectiveBossShort");
  }
};

export const protocolLabel = (
  protocol: SignalProtocol,
  locale: GameLocale,
): string => {
  switch (protocol) {
    case "surge_break":
      return gameText(locale, "protocolSurge");
    case "guard_aegis":
      return gameText(locale, "protocolGuard");
    case "echo_replay":
      return gameText(locale, "protocolEcho");
    case "resonance":
      return gameText(locale, "protocolResonance");
    default:
      return gameText(locale, "warp");
  }
};
