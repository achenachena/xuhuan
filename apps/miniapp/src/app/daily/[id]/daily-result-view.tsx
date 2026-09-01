"use client";

import Link from "next/link";

import LanguageToggle from "@/components/language-toggle";
import useLocale from "@/components/providers/use-locale";
import { gameText, type GameCopyKey } from "@/features/game/game-copy";
import type { APIDailyResult } from "@/lib/api/client";

type DailyResultViewProps = {
  readonly result: APIDailyResult;
  readonly labels: Record<
    "en" | "zh-CN",
    {
      readonly characters: Record<string, string>;
      readonly effects: Record<string, string>;
      readonly companions: Record<string, string>;
    }
  >;
};

const DailyResultView = ({ result, labels }: DailyResultViewProps) => {
  const { language } = useLocale();
  const text = (key: GameCopyKey) => gameText(language, key);
  const localized = labels[language];

  return (
    <main className="grid min-h-screen place-items-center bg-[#050914] p-5 pt-[var(--xuhuan-host-safe-top)] text-slate-50">
      <LanguageToggle />
      <article
        data-testid="daily-share-result"
        className="w-full max-w-lg border-2 border-cyan-300/35 bg-[#091426] p-5 shadow-[8px_8px_0_rgba(91,33,182,.6)]"
      >
        <p className="font-mono text-[10px] tracking-[.25em] text-cyan-200">
          {text("dailyShareEyebrow")}
          {" // "}
          {result.date}
        </p>
        <h1 className="mt-3 text-3xl font-black">
          {text("dailyShareRecovered")}
        </h1>
        <div className="mt-5 border-y-2 border-cyan-300/20 py-5 text-center">
          <p className="font-mono text-[10px] tracking-[.2em] text-slate-400">
            {text("dailyShareScore")}
          </p>
          <p className="mt-1 font-mono text-6xl font-black text-cyan-200">
            {result.score.toLocaleString(language === "en" ? "en-CA" : "zh-CN")}
          </p>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div className="border border-white/10 bg-white/5 p-3">
            <dt className="font-mono text-[9px] text-slate-500">
              {text("dailySharePilot")}
            </dt>
            <dd className="mt-1 font-bold">
              {localized.characters[result.character_slug] ?? result.character_slug}
            </dd>
          </div>
          <div className="border border-white/10 bg-white/5 p-3">
            <dt className="font-mono text-[9px] text-slate-500">
              {text("dailyShareStreak")}
            </dt>
            <dd className="mt-1 font-bold">{result.streak}</dd>
          </div>
        </dl>
        <div className="mt-5">
          <p className="font-mono text-[9px] tracking-[.18em] text-slate-500">
            {text("dailyShareBuild")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {result.show_effects.map((effect) => (
              <span
                key={effect}
                className="border border-violet-300/30 bg-violet-400/10 px-2 py-1 font-mono text-[10px] text-violet-100"
              >
                {localized.effects[effect] ?? effect}
              </span>
            ))}
            {result.companion_slugs.map((companion) => (
              <span
                key={companion}
                className="border border-amber-300/30 bg-amber-400/10 px-2 py-1 font-mono text-[10px] text-amber-100"
              >
                {localized.companions[companion] ?? companion}
              </span>
            ))}
          </div>
        </div>
        <Link
          href="/"
          className="mt-6 block bg-gradient-to-r from-cyan-300 to-violet-400 px-5 py-4 text-center font-black text-slate-950"
        >
          {text("dailyShareOpen")}
        </Link>
        <p className="mt-4 text-center text-[10px] leading-4 text-slate-600">
          {text("dailyShareAnonymous")}
        </p>
      </article>
    </main>
  );
};

export default DailyResultView;
