"use client";

import type { ReactNode } from "react";

import clsx from "clsx";

import type { BattleOutcome, CombatantState, StatusEffectState } from "@/lib/game-loop";
import useLocale from "@/components/providers/use-locale";

type GameSceneProps = {
  readonly hero: CombatantState;
  readonly enemy: CombatantState;
  readonly turn: number;
  readonly outcome: BattleOutcome;
  readonly overlaySlot?: ReactNode;
};

const clampPercentage = (value: number, max: number): number => {
  if (max <= 0) {
    return 0;
  }
  const ratio = value / max;
  const percentage = Math.round(ratio * 100);
  if (percentage < 0) {
    return 0;
  }
  if (percentage > 100) {
    return 100;
  }
  return percentage;
};

const StatBar = ({
  label,
  current,
  max,
  tone
}: {
  readonly label: string;
  readonly current: number;
  readonly max: number;
  readonly tone: "hero" | "enemy";
}) => {
  const percentage = clampPercentage(current, max);
  const barClassName = clsx("absolute left-0 top-0 h-full rounded-full transition-all duration-300", {
    "bg-sky-500": tone === "hero",
    "bg-rose-500": tone === "enemy"
  });
  const trackClassName = "relative h-2 w-full overflow-hidden rounded-full bg-white/10";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] opacity-80">
        <span>{label}</span>
        <span>
          {current}
          <span className="opacity-60"> / </span>
          {max}
        </span>
      </div>
      <div className={trackClassName} data-tone={tone === "hero" ? "hero" : "enemy"}>
        <div
          className={barClassName}
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={current}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-label={label}
        />
      </div>
    </div>
  );
};

const CombatantPanel = ({
  combatant,
  alignment
}: {
  readonly combatant: CombatantState;
  readonly alignment: "start" | "end";
}) => {
  const { translate } = useLocale();
  const tone: "hero" | "enemy" = combatant.kind;
  const panelClassName = clsx(
    "flex w-full flex-col gap-3 rounded-2xl border px-4 py-4 transition-colors sm:max-w-sm",
    {
      "border-white/10 bg-white/5 text-telegram-text": tone === "hero",
      "border-rose-500/40 bg-rose-500/10 text-telegram-text": tone === "enemy"
    }
  );
  const containerAlignment = alignment === "end" ? "items-end text-right" : "items-start text-left";

  return (
    <article
      className={clsx(panelClassName, containerAlignment)}
      aria-label={translate("gameScene.panel.ariaLabel", { name: combatant.name })}
      tabIndex={0}
    >
      <header className="relative">
        <p className="text-xs uppercase tracking-[0.18em] opacity-70">
          {translate("gameScene.panel.level", { level: combatant.level.toString() })}
        </p>
        <h2 className="text-xl font-semibold tracking-tight">{combatant.name}</h2>

        {/* Combo Counter */}
        {combatant.comboCount > 0 && (
          <div
            className={clsx(
              "mt-2 inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider",
              {
                "animate-pulse border-yellow-500 bg-yellow-500/20 text-yellow-300": combatant.comboCount >= 3,
                "border-orange-500 bg-orange-500/20 text-orange-300": combatant.comboCount < 3
              }
            )}
          >
            <span className="text-base">🔥</span>
            <span>{translate("gameScene.panel.combo", { combo: combatant.comboCount.toString() })}</span>
          </div>
        )}

        {/* Blocking Status */}
        {combatant.isBlocking && (
          <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-blue-500 bg-blue-500/30 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-200">
            <span className="text-base">🛡️</span>
            <span>{translate("gameScene.panel.blocking")}</span>
          </div>
        )}
      </header>

      <div className="flex flex-col gap-2 text-xs uppercase tracking-[0.2em] opacity-80">
        <span>
          {translate("gameScene.stats.attack", { value: combatant.attributes.attack.toString() })}
        </span>
        <span>
          {translate("gameScene.stats.defense", { value: combatant.attributes.defense.toString() })}
        </span>
        <span>
          {translate("gameScene.stats.speed", { value: combatant.attributes.speed.toString() })}
        </span>
      </div>

      <StatBar
        label={translate("gameScene.stats.health")}
        current={combatant.currentHealth}
        max={combatant.attributes.maxHealth}
        tone={tone}
      />

      {/* Special Meter Mini Display */}
      {combatant.kind === "hero" && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] opacity-70">
            <span>{translate("gameScene.stats.specialMeter.title")}</span>
            <span>{translate("gameScene.stats.specialMeter.value", { value: combatant.specialMeter.toString() })}</span>
          </div>
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-black/30">
            <div
              className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
              style={{ width: `${combatant.specialMeter}%` }}
              role="progressbar"
              aria-valuenow={combatant.specialMeter}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={translate("gameScene.stats.specialMeter.ariaLabel")}
            />
          </div>
        </div>
      )}

      {combatant.statusEffects.length > 0 && (
        <ul className="flex flex-wrap justify-end gap-2 text-xs">
          {combatant.statusEffects.map((effect: StatusEffectState) => (
            <li
              key={effect.id}
              className="rounded-full border border-white/20 px-3 py-1 text-[10px] uppercase tracking-[0.2em]"
            >
              {effect.name} · {effect.duration}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
};

const GameScene = ({ hero, enemy, turn, outcome, overlaySlot }: GameSceneProps) => {
  const { translate } = useLocale();
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-3xl">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,_rgba(59,130,246,0.2),_transparent_60%)]" />
      <div className="flex w-full flex-col gap-6 px-4 py-6 md:flex-row md:items-center md:justify-between md:gap-4">
        <CombatantPanel combatant={hero} alignment="start" />
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="text-xs uppercase tracking-[0.3em] opacity-70">
            {translate("gameScene.turnLabel", { turn: turn.toString() })}
          </span>
          <h3 className="text-3xl font-semibold tracking-tight">{translate("gameScene.title")}</h3>
          <p className="max-w-xs text-sm opacity-80">{translate("gameScene.subtitle")}</p>
          {overlaySlot}
          {outcome !== "inProgress" && (
            <p
              className={clsx("rounded-full border px-4 py-2 text-xs uppercase tracking-[0.3em]", {
                "border-emerald-400/50 text-emerald-300": outcome === "victory",
                "border-rose-400/50 text-rose-300": outcome === "defeat"
              })}
              role="status"
            >
              {translate(
                outcome === "victory" ? "gameScene.outcome.victory" : "gameScene.outcome.defeat"
              )}
            </p>
          )}
        </div>
        <CombatantPanel combatant={enemy} alignment="end" />
      </div>
    </div>
  );
};

export default GameScene;

