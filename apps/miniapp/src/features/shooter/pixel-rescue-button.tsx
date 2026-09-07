import useLocale from "@/components/providers/use-locale";
import { gameText } from "@/features/game/game-copy";

import styles from "./pixel-rescue-button.module.css";

type Props = {
  readonly charge: number;
  readonly busy?: boolean;
  readonly onRescue: () => void;
};

const penlight = (
  <svg viewBox="0 0 32 32" width="34" height="34" aria-hidden="true" focusable="false" shapeRendering="crispEdges">
    <path fill="currentColor" d="M12 2h8v2h2v14h-2v2h-2v9h-4v-9h-2v-2h-2V4h2z" />
    <path fill="#0d2030" d="M14 5h4v2h-4zm0 5h4v2h-4zm0 5h4v2h-4zm0 7h4v2h-4z" />
    <path fill="currentColor" d="M26 5h2v3h3v2h-3v3h-2v-3h-3V8h3zM4 18h2v2h2v2H6v2H4v-2H2v-2h2z" />
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
      title={`${gameText(language, "hype")}: ${Math.round(progress)}%`}
      onClick={onRescue}
      className={styles.button}
    >
      <span className={styles.face} aria-hidden="true">
        <span className={styles.icon}>
          {penlight}
          <span className={styles.charge} style={{ clipPath: `inset(${100 - progress}% 0 0)` }}>
            {penlight}
          </span>
        </span>
        <span className={styles.label}>{busy ? "…" : gameText(language, "rescue")}</span>
      </span>
    </button>
  );
};
