"use client";

import { useEffect, useRef } from "react";
import type { Character } from "@xuhuan/game-types";
import type { BattleOutcome } from "@/lib/game-loop";
import CharacterSprite from "./character-sprite";
import HealthBarTop from "./health-bar-top";
import clsx from "clsx";
import useLocale from "@/components/providers/use-locale";

type AnimationState = "idle" | "attack" | "damage" | "block" | "special" | "victory" | "defeat";

type CombatantData = {
  readonly character: Character;
  readonly currentHealth: number;
  readonly maxHealth: number;
  readonly specialMeter: number;
  readonly comboCount: number;
  readonly isBlocking: boolean;
  readonly animationState: AnimationState;
};

type BattleLogEntry = {
  readonly id: string;
  readonly message: string;
  readonly timestamp: number;
};

type BattleArenaProps = {
  readonly player: CombatantData;
  readonly opponent: CombatantData;
  readonly turn: number;
  readonly outcome: BattleOutcome;
  readonly battleLog: readonly BattleLogEntry[];
};

const BattleArena = ({ player, opponent, turn, outcome, battleLog }: BattleArenaProps) => {
  const { translate } = useLocale();
  const battleLogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (battleLogRef.current) {
      battleLogRef.current.scrollTop = battleLogRef.current.scrollHeight;
    }
  }, [battleLog]);

  return (
    <div className="relative w-full h-full overflow-hidden rounded-3xl bg-gradient-to-b from-gray-900 via-purple-900/20 to-black">
      {/* Background Arena Effect */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(139,92,246,0.15),_transparent_70%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,_transparent_0%,_rgba(0,0,0,0.4)_100%)]" />

      {/* Grid lines effect */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: "50px 50px"
        }}
      />

      {/* Main Content */}
      <div className="relative z-10 h-full flex flex-col">
        {/* Top Health Bars */}
        <div className="p-3 flex items-start justify-between gap-2">
          <div className="w-[42%]">
            <HealthBarTop
              character={player.character}
              currentHealth={player.currentHealth}
              maxHealth={player.maxHealth}
              specialMeter={player.specialMeter}
              comboCount={player.comboCount}
              isBlocking={player.isBlocking}
              alignment="left"
            />
          </div>

          {/* VS Badge and Turn Counter */}
          <div className="flex flex-col items-center gap-1 pt-2 flex-shrink-0">
            <div className="px-3 py-1.5 rounded-full bg-gradient-to-r from-red-600 to-orange-500 border-2 border-white/30 shadow-lg">
              <span className="text-xs font-bold text-white tracking-wider">{translate("battleArena.vsBadge")}</span>
            </div>
            <div className="px-2 py-0.5 rounded-full bg-black/60 border border-white/20">
              <span className="text-[10px] font-semibold text-white/80">
                {translate("battleArena.turnBadge", { turn: turn.toString() })}
              </span>
            </div>
          </div>

          <div className="w-[42%]">
            <HealthBarTop
              character={opponent.character}
              currentHealth={opponent.currentHealth}
              maxHealth={opponent.maxHealth}
              specialMeter={opponent.specialMeter}
              comboCount={opponent.comboCount}
              isBlocking={opponent.isBlocking}
              alignment="right"
            />
          </div>
        </div>

        {/* Battle Stage */}
        <div className="flex-1 flex items-end justify-between px-4 pb-4 relative min-h-0">
          {/* Player Character (Left) */}
          <div className="flex-1 max-w-[35%]">
            <CharacterSprite
              character={player.character}
              animationState={player.animationState}
              scale={1}
              flip={false}
            />
          </div>

          {/* Center Area (Combo Counter, Outcome) */}
          <div className="flex-1 flex flex-col items-center justify-center gap-4 px-2">
            {/* Outcome Display */}
            {outcome !== "inProgress" && (
              <div
                className={clsx(
                  "rounded-2xl px-6 py-3 text-2xl font-bold uppercase tracking-wider animate-bounce",
                  "border-4 shadow-2xl",
                  {
                    "bg-gradient-to-r from-green-600 to-emerald-500 border-green-300 text-white": outcome === "victory",
                    "bg-gradient-to-r from-red-600 to-rose-500 border-red-300 text-white": outcome === "defeat"
                  }
                )}
              >
                {translate(
                  outcome === "victory" ? "battleArena.outcome.victory" : "battleArena.outcome.defeat"
                )}
              </div>
            )}

            {/* Combo Display */}
            {player.comboCount >= 3 && (
              <div className="animate-pulse">
                <div className="text-4xl font-black text-yellow-400 drop-shadow-[0_0_10px_rgba(255,215,0,0.8)]">
                  {translate("battleArena.comboLabel", { combo: player.comboCount.toString() })}
                </div>
              </div>
            )}

            {opponent.comboCount >= 3 && (
              <div className="animate-pulse">
                <div className="text-4xl font-black text-red-400 drop-shadow-[0_0_10px_rgba(255,0,0,0.8)]">
                  {translate("battleArena.comboLabel", { combo: opponent.comboCount.toString() })}
                </div>
              </div>
            )}
          </div>

          {/* Opponent Character (Right) */}
          <div className="flex-1 max-w-[35%]">
            <CharacterSprite
              character={opponent.character}
              animationState={opponent.animationState}
              scale={1}
              flip={true}
            />
          </div>
        </div>

        {/* Stage floor separator */}
        <div className="relative">
          <div className="h-2 bg-gradient-to-r from-purple-500/30 via-pink-500/30 to-purple-500/30" />
          <div className="h-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        </div>

        {/* Battle Log Section */}
        <div ref={battleLogRef} className="flex-1 bg-black/60 backdrop-blur-sm overflow-y-auto px-4 py-2 scrollbar-thin scrollbar-thumb-purple-500/50 scrollbar-track-transparent">
          <div className="space-y-1">
            {battleLog.map((entry) => (
              <div key={entry.id} className="text-xs text-white/80 font-mono leading-relaxed">
                {entry.message}
              </div>
            ))}
            {battleLog.length === 0 && (
              <div className="text-xs text-white/40 italic">{translate("battleArena.logPlaceholder")}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BattleArena;
