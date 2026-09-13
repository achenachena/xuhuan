import useLocale from "@/components/providers/use-locale";
import { gameText } from "@/features/game/game-copy";

import styles from "./pixel-rescue-button.module.css";

type Props = {
  readonly charge: number;
  readonly busy?: boolean;
  readonly onRescue: () => void;
};

const blastIcon = (
  <svg viewBox="0 0 32 32" width="34" height="34" aria-hidden="true" focusable="false" shapeRendering="crispEdges">
    <path fill="currentColor" d="m16 1 4 9 9-5-5 10 7 4-10 2-2 10-5-8-10 5 5-11-8-4 11-2z" />
    <path fill="#102433" d="m17 9-7 9h5l-1 6 8-10h-6z" />
  </svg>
);

export const PixelRescueButton = ({ charge, busy = false, onRescue }: Props) => {
  const { language } = useLocale();
  const progress = Number.isFinite(charge) ? Math.max(0, Math.min(100, charge)) : 0;
  const ready = progress >= 100 && !busy;

  return (
    <button
      type="button"
      data-testid="rescue-button"
      data-state={busy ? "busy" : ready ? "ready" : "charging"}
      disabled={!ready}
      aria-disabled={!ready}
      aria-label={ready ? gameText(language, "rescueReady") : `${gameText(language, "rescueCharging")} (${Math.round(progress)}%)`}
      title={ready ? gameText(language, "rescueReady") : `${gameText(language, "hype")}: ${Math.round(progress)}%`}
      onClick={onRescue}
      className={styles.button}
    >
      <span className={styles.face} aria-hidden="true">
        <span className={styles.icon}>
          {blastIcon}
          <span className={styles.charge} style={{ clipPath: `inset(${100 - progress}% 0 0)` }}>
            {blastIcon}
          </span>
        </span>
        <span className={styles.label}>{busy ? "…" : gameText(language, "rescue")}</span>
      </span>
    </button>
  );
};
