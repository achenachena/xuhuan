"use client";

import { useState } from "react";

import { gameText, type GameLocale } from "@/features/game/game-copy";
import { SignalPanel } from "@/features/game/screens/signal-panel";
import type { APIGameRun } from "@/lib/api/client";

type RunResultScreenProps = {
  readonly run: APIGameRun;
  readonly characterName: string;
  readonly locale: GameLocale;
  readonly busy: boolean;
  readonly onContinue: () => void;
};

const openShare = async (
  runID: string,
  score: number,
  characterName: string,
  locale: GameLocale,
): Promise<void> => {
  if (typeof window === "undefined") return;
  const resultURL = `${window.location.origin}/daily/${runID}`;
  const text = gameText(locale, "dailyShareMessage")
    .replace("{character}", characterName)
    .replace("{score}", String(score));
  try {
    const { default: WebApp } = await import("@twa-dev/sdk");
    if (WebApp.platform !== "unknown") {
      WebApp.openTelegramLink(
        `https://t.me/share/url?url=${encodeURIComponent(resultURL)}&text=${encodeURIComponent(text)}`,
      );
      return;
    }
  } catch {
    // Clipboard fallback below works in regular browser previews.
  }
  await navigator.clipboard.writeText(resultURL);
};

export const RunResultScreen = ({
  run,
  characterName,
  locale,
  busy,
  onContinue,
}: RunResultScreenProps) => {
  const [shareStatus, setShareStatus] = useState<"idle" | "ready" | "failed">(
    "idle",
  );
  const copyKey =
    run.outcome === "cleared"
      ? "victory"
      : run.outcome === "abandoned"
        ? "abandoned"
        : "defeat";
  const cleared = run.outcome === "cleared";
  const share = async () => {
    try {
      await openShare(run.id, run.state.score, characterName, locale);
      setShareStatus("ready");
    } catch {
      setShareStatus("failed");
    }
  };

  return (
    <SignalPanel
      title={gameText(locale, copyKey)}
      subtitle={cleared ? gameText(locale, "noiseUnlocked") : undefined}
      eyebrow={run.mode === "daily" ? gameText(locale, "daily") : gameText(locale, "campaign")}
    >
      <div className="my-6 border-2 border-cyan-300/25 bg-[#071225] p-5 text-center shadow-[5px_5px_0_rgba(8,145,178,.25)]">
        <div className="font-mono text-[10px] tracking-[.2em] text-slate-400">
          {gameText(locale, "score")}
        </div>
        <div className="mt-2 font-mono text-5xl font-black text-cyan-200 drop-shadow-[0_0_20px_rgba(34,211,238,.5)]">
          {run.state.score.toLocaleString(locale === "en" ? "en-CA" : "zh-CN")}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-left text-xs">
          <span className="border border-white/10 bg-white/5 p-2 text-slate-400">
            {gameText(locale, "modules")} <b className="float-right text-white">{run.state.modules.length}/6</b>
          </span>
          <span className="border border-white/10 bg-white/5 p-2 text-slate-400">
            {gameText(locale, "plugins")} <b className="float-right text-white">{run.state.plugins.length}</b>
          </span>
        </div>
      </div>

      {run.mode === "daily" && cleared ? (
        <button
          data-testid="share-daily-result"
          type="button"
          disabled={busy}
          onClick={() => void share()}
          className="mb-3 w-full border-2 border-violet-300/40 bg-violet-400/15 px-5 py-4 font-bold text-violet-50 disabled:opacity-50"
        >
          {shareStatus === "ready"
            ? gameText(locale, "shareReady")
            : shareStatus === "failed"
              ? gameText(locale, "shareFailed")
              : gameText(locale, "shareResult")}
        </button>
      ) : null}

      <button
        data-testid="continue-from-result"
        type="button"
        disabled={busy}
        onClick={onContinue}
        className="w-full bg-gradient-to-r from-cyan-300 to-violet-400 px-5 py-4 font-black text-slate-950 shadow-[4px_4px_0_rgba(14,116,144,.45)] active:translate-x-1 active:translate-y-1 active:shadow-none disabled:opacity-50"
      >
        {gameText(locale, "continue")}
      </button>
    </SignalPanel>
  );
};
