"use client";

import useLocale from "@/components/providers/use-locale";
import { formatGameText, gameText } from "@/features/game/game-copy";
import type { ShooterSnapshot } from "@/features/shooter/types";

type Props = {
  readonly snapshot: ShooterSnapshot | null;
  readonly segmentIndex: number;
  readonly segmentTotal?: number;
  readonly durationTicks?: number;
  readonly boss: boolean;
  readonly busy?: boolean;
  readonly onRescue?: () => void;
  readonly fallbackHealth?: number;
  readonly showMeter?: boolean;
};

export const ShooterHUD = ({
  snapshot,
  segmentIndex,
  segmentTotal = 3,
  durationTicks,
  boss,
  busy = false,
  onRescue,
  fallbackHealth,
  showMeter = true,
}: Props) => {
  const { language } = useLocale();
  const health = Math.max(0, snapshot?.health ?? fallbackHealth ?? 0);
  const hype = Math.max(0, Math.min(100, snapshot?.rescue_charge ?? 0));
  const rescueReady = hype >= 100 && !busy;
  const segmentName = boss
    ? gameText(language, "bossLabel")
    : formatGameText(language, "segmentLabel", {
        current: Math.min(segmentTotal, segmentIndex + 1),
        total: segmentTotal,
      });
  const remaining =
    durationTicks === undefined
      ? null
      : Math.max(0, Math.ceil((durationTicks - (snapshot?.tick ?? 0)) / 30));
  const segment = remaining === null ? segmentName : `${segmentName} · ${remaining}s`;

  return (
    <>
      <header
        data-testid="shooter-hud"
        className="pointer-events-none absolute z-30 h-12"
        style={{
          top: "var(--xuhuan-host-safe-top)",
          left: "var(--xuhuan-host-safe-left)",
          right: "var(--xuhuan-host-safe-right)",
        }}
      >
        <div className="grid h-12 grid-cols-[auto_1fr] items-center gap-2 border border-cyan-200/25 bg-[#020713]/90 px-2 pr-11 shadow-[0_3px_0_rgba(34,211,238,.12)] backdrop-blur-sm">
        <div className="min-w-[65px]" aria-label={`${gameText(language, "onAir")}: ${health}`}>
          <p className="font-mono text-[7px] font-black tracking-[.16em] text-rose-200">
            {gameText(language, "onAir")}
          </p>
          <div className="mt-0.5 flex gap-0.5 text-[13px] leading-none">
            {[0, 1, 2].map((heart) => (
              <span key={heart} className={heart < health ? "text-rose-400" : "text-slate-700"}>
                ♥
              </span>
            ))}
          </div>
        </div>
        <div className="min-w-0">
          <div className="flex justify-between gap-1 font-mono text-[7px] font-bold tracking-wider text-slate-300">
            <span className="truncate">{segment}</span>
            {showMeter ? <span>{hype}%</span> : null}
          </div>
          {showMeter ? <div className="mt-1 h-1.5 overflow-hidden bg-slate-800" aria-label={`${gameText(language, "hype")}: ${hype}%`}>
            <div
              className={`h-full ${rescueReady ? "animate-pulse bg-gradient-to-r from-amber-300 via-pink-300 to-cyan-300" : "bg-cyan-300"}`}
              style={{ width: `${hype}%` }}
            />
          </div> : null}
        </div>
        </div>
      </header>
      {onRescue ? (
        <button
          type="button"
          data-testid="rescue-button"
          disabled={!rescueReady}
          aria-label={rescueReady ? gameText(language, "rescueReady") : gameText(language, "rescueCharging")}
          onClick={onRescue}
          className="absolute bottom-[var(--xuhuan-host-safe-bottom)] right-[var(--xuhuan-host-safe-right)] z-30 grid h-[68px] w-[68px] place-items-center border-2 border-pink-200/35 bg-[#170d2c]/75 font-mono text-[9px] font-black tracking-wide text-pink-100 opacity-35 shadow-none backdrop-blur-sm transition disabled:text-slate-500 enabled:animate-pulse enabled:border-amber-200 enabled:bg-gradient-to-br enabled:from-amber-300 enabled:via-pink-300 enabled:to-cyan-300 enabled:text-slate-950 enabled:opacity-100 enabled:shadow-[0_0_24px_rgba(244,114,182,.7)] enabled:active:scale-95"
        >
          {busy ? "…" : gameText(language, "rescue")}
        </button>
      ) : null}
    </>
  );
};
