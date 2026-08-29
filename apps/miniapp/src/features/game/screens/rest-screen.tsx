"use client";

import { useState } from "react";

import { gameText, type GameLocale } from "@/features/game/game-copy";
import { SignalPanel } from "@/features/game/screens/signal-panel";
import type { APIGameContent, APIGameRun } from "@/lib/api/client";

type RestScreenProps = {
  readonly content: APIGameContent;
  readonly run: APIGameRun;
  readonly locale: GameLocale;
  readonly busy: boolean;
  readonly onRest: (operation: "repair" | "tune", moduleSlug?: string) => void;
};

export const RestScreen = ({
  content,
  run,
  locale,
  busy,
  onRest,
}: RestScreenProps) => {
  const [tuning, setTuning] = useState(false);
  return (
    <SignalPanel
      title={gameText(locale, "rest")}
      subtitle={tuning ? gameText(locale, "tuneHint") : undefined}
    >
      {tuning ? (
        <>
          <div className="max-h-[52dvh] space-y-2 overflow-y-auto pr-1">
            {run.state.modules.map((owned) => {
              const definition = content.modules.find(
                (item) => item.slug === owned.slug,
              );
              return (
                <button
                  key={owned.slug}
                  data-testid={`tune-module-${owned.slug}`}
                  type="button"
                  disabled={busy || owned.level >= 3}
                  onClick={() => onRest("tune", owned.slug)}
                  className="flex w-full items-center justify-between border-2 border-cyan-300/25 bg-[#071827] px-4 py-3 text-left shadow-[3px_3px_0_rgba(8,145,178,.28)] disabled:opacity-30"
                >
                  <span>
                    <strong className="block text-sm text-white">
                      {definition?.name ?? owned.slug}
                    </strong>
                    <small className="font-mono text-cyan-200">
                      {gameText(locale, "levelShort")} {owned.level} →{" "}
                      {Math.min(3, owned.level + 1)}
                    </small>
                  </span>
                  <span className="text-xl text-cyan-300">＋</span>
                </button>
              );
            })}
          </div>
          <button
            data-testid="rest-back"
            type="button"
            onClick={() => setTuning(false)}
            className="mt-4 w-full border border-white/15 bg-slate-950 py-3 text-sm text-slate-300"
          >
            {gameText(locale, "back")}
          </button>
        </>
      ) : (
        <div className="grid gap-3">
          <button
            data-testid="rest-repair"
            type="button"
            disabled={busy}
            onClick={() => onRest("repair")}
            className="border-2 border-emerald-300/35 bg-emerald-400/10 p-5 text-left text-emerald-50 shadow-[4px_4px_0_rgba(5,150,105,.3)] disabled:opacity-50"
          >
            <span className="mr-3 text-2xl">＋</span>
            <strong>{gameText(locale, "repair")}</strong>
          </button>
          <button
            data-testid="rest-tune"
            type="button"
            disabled={
              busy ||
              run.state.modules.length === 0 ||
              run.state.modules.every((item) => item.level >= 3)
            }
            onClick={() => setTuning(true)}
            className="border-2 border-cyan-300/35 bg-cyan-400/10 p-5 text-left text-cyan-50 shadow-[4px_4px_0_rgba(8,145,178,.3)] disabled:opacity-30"
          >
            <span className="mr-3 text-2xl">⌁</span>
            <strong>{gameText(locale, "tune")}</strong>
          </button>
        </div>
      )}
    </SignalPanel>
  );
};
