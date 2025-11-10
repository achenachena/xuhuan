"use client";

import { useEffect, useRef } from "react";

import clsx from "clsx";

import type { BattleLogEntry } from "@/lib/game-loop";

type CombatLogProps = {
  readonly entries: readonly BattleLogEntry[];
  readonly ariaLabel?: string;
};

const CombatLog = ({ entries, ariaLabel = "Combat log" }: CombatLogProps) => {
  const logRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    if (!logRef.current) {
      return;
    }
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div className="flex h-full flex-col justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm opacity-80">
        <p>No combat actions yet.</p>
        <p className="text-xs uppercase tracking-[0.2em] opacity-70">Awaiting your command</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <p className="text-xs uppercase tracking-[0.2em] opacity-70">{ariaLabel}</p>
      <ul
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label={ariaLabel}
        className="flex flex-1 flex-col gap-2 overflow-y-auto rounded-2xl border border-white/10 bg-black/10 px-4 py-3"
        tabIndex={0}
      >
        {entries.map((entry) => (
          <li
            key={entry.id}
            className={clsx(
              "rounded-2xl px-3 py-2 text-sm leading-snug",
              entry.actor === "hero"
                ? "bg-sky-500/10 text-sky-100"
                : "bg-rose-500/10 text-rose-100"
            )}
          >
            <span className="block text-xs uppercase tracking-[0.18em] opacity-70">
              Turn {entry.turn} · {entry.actor === "hero" ? "Hero" : "Enemy"}
            </span>
            <span className="block">
              {entry.description}
              {entry.damage && (
                <span className="ml-2 text-xs opacity-80">
                  ({entry.damage.amount} damage{entry.damage.isCritical ? ", critical" : ""})
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default CombatLog;

