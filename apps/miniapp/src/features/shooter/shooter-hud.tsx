"use client";

import useLocale from "@/components/providers/use-locale";
import { formatGameText, gameText } from "@/features/game/game-copy";
import { PixelRescueButton } from "@/features/shooter/pixel-rescue-button";
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
        <div className="min-w-[82px]" aria-label={`${gameText(language, "onAir")}: ${health}/3`}>
          <p className="flex justify-between font-mono text-[9px] font-black tracking-[.08em] text-rose-200">
            <span className="flex items-center gap-1">
              {gameText(language, "onAir")}
              {(snapshot?.shield ?? 0) > 0 ? (
                <svg viewBox="0 0 10 12" width="9" height="11" role="img" aria-label={gameText(language, "shieldReady")} shapeRendering="crispEdges">
                  <path fill="#b3efec" d="M1 0h8v1h1v6H9v2H7v2H6v1H4v-1H3V9H1V7H0V1h1z" />
                  <path fill="#163242" d="M2 2h6v5H7v1H6v2H4V8H3V7H2z" />
                  <path fill="#7eebed" d="M4 3h2v4H4z" />
                </svg>
              ) : null}
            </span>
            <span>{health}/3</span>
          </p>
          <div className="mt-1 grid grid-cols-3 gap-0.5">
            {[0, 1, 2].map((segment) => (
              <span
                key={segment}
                className={`h-1.5 border ${segment < health ? "border-emerald-200 bg-emerald-300" : "border-rose-950 bg-slate-800"}`}
              />
            ))}
          </div>
        </div>
        <div className="min-w-0">
          <div className="flex justify-between gap-1 font-mono text-[9px] font-bold tracking-wide text-slate-300">
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
      {onRescue ? <PixelRescueButton charge={hype} busy={busy} onRescue={onRescue} /> : null}
    </>
  );
};
