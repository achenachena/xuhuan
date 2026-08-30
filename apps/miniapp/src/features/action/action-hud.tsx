import {
  objectiveInstruction,
  objectiveStatusLabel,
  protocolLabel,
} from "@/features/action/action-labels";
import { objectiveProgressRatio } from "@/features/action/action-objectives";
import type { ActionSnapshot, SignalType } from "@/features/action/action-types";
import { gameText, type GameLocale } from "@/features/game/game-copy";

type Props = {
  readonly snapshot: ActionSnapshot | null;
  readonly locale: GameLocale;
  readonly fallbackHealth: number;
  readonly fallbackMaxHealth: number;
  readonly tutorial: boolean;
  readonly moved: boolean;
  readonly usedWarp: boolean;
  readonly guidanceOverride?: string;
};

const signalTone: Readonly<Record<SignalType, string>> = {
  surge: "border-cyan-100 bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,.8)]",
  guard: "border-emerald-100 bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,.8)]",
  echo: "border-violet-100 bg-violet-300 shadow-[0_0_8px_rgba(196,181,253,.8)]",
};

export const ActionHUD = ({
  snapshot,
  locale,
  fallbackHealth,
  fallbackMaxHealth,
  tutorial,
  moved,
  usedWarp,
  guidanceOverride,
}: Props) => {
  const health = snapshot?.health ?? fallbackHealth;
  const maxHealth = snapshot?.maxHealth ?? fallbackMaxHealth;
  const healthRatio = Math.max(0, Math.min(1, health / Math.max(1, maxHealth)));
  const objectiveRatio = snapshot
    ? objectiveProgressRatio(snapshot.objective)
    : 0;
  const protocol = snapshot?.protocol ?? "";
  const distortion = snapshot?.distortion ?? 0;
  const tutorialReady = Boolean(snapshot?.protocol);
  const tutorialStatus = !moved
    ? gameText(locale, "tutorialStageMove")
    : !tutorialReady
      ? `${gameText(locale, "tutorialStageSignals")} ${snapshot?.weave.length ?? 0}/3`
      : gameText(locale, "tutorialStageWarp");
  const status = tutorial
    ? tutorialStatus
    : snapshot
      ? objectiveStatusLabel(snapshot, locale)
      : gameText(locale, "connectingShort");
  const guidance =
    guidanceOverride ??
    (tutorial
      ? !moved
        ? gameText(locale, "tutorialMove")
        : tutorialReady && !usedWarp
          ? gameText(locale, "tutorialWarp")
          : gameText(locale, "tutorialSignal")
      : snapshot
        ? objectiveInstruction(snapshot, locale)
        : gameText(locale, "connectingShort"));

  return (
    <header
      data-testid="combat-hud"
      className="pointer-events-none absolute inset-x-0 top-[var(--xuhuan-host-safe-top)] z-30 h-[4.25rem] px-2 pr-12"
    >
      <div className="h-full border-b border-cyan-100/30 bg-[#020611] px-2 py-1.5 font-mono text-[8px] tracking-[.08em] text-slate-300 shadow-[0_4px_0_rgba(2,6,23,.8)]">
        <div className="flex items-center gap-2">
          <span className="text-emerald-200">♥ {health}</span>
          {(snapshot?.shield ?? 0) > 0 ? (
            <span className="text-sky-200">◇ {snapshot?.shield}</span>
          ) : null}
          <strong className="ml-auto truncate text-cyan-50">{status}</strong>
        </div>
        <div className="mt-1 grid grid-cols-[1fr_1fr] gap-1.5">
          <div className="h-1.5 overflow-hidden bg-black/65">
            <div
              className={healthRatio <= 0.3 ? "h-full bg-rose-400" : "h-full bg-emerald-300"}
              style={{ width: `${healthRatio * 100}%` }}
            />
          </div>
          <div className="h-1.5 overflow-hidden bg-black/65">
            <div
              className="h-full bg-gradient-to-r from-cyan-300 to-violet-400"
              style={{ width: `${objectiveRatio * 100}%` }}
            />
          </div>
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          {(snapshot?.weave ?? []).map((signal, index) => (
            <span
              key={`${signal}-${index}`}
              className={`h-2.5 w-2.5 rotate-45 border ${signalTone[signal]}`}
            />
          ))}
          {Array.from({ length: Math.max(0, 3 - (snapshot?.weave.length ?? 0)) }, (_, index) => (
            <span key={`empty-${index}`} className="h-2.5 w-2.5 rotate-45 border border-slate-500/60 bg-slate-950/70" />
          ))}
          {protocol ? (
            <strong className="ml-1 truncate text-fuchsia-200">
              {protocolLabel(protocol, locale)}
            </strong>
          ) : null}
          <span className="ml-auto text-violet-200">
            ◈ {distortion}%
          </span>
          <span className="text-amber-200">
            {snapshot?.score ?? 0}
          </span>
        </div>
        <p className="mt-1 truncate text-[7px] normal-case tracking-normal text-slate-200">
          {guidance}
        </p>
      </div>
    </header>
  );
};
