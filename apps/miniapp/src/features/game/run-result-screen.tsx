"use client";

import type { GameLocale } from "@/features/game/game-copy";
import { gameText } from "@/features/game/game-copy";
import type { ShooterContent, ShooterGameRun } from "@/lib/api/types";

type Props = {
  readonly content: ShooterContent;
  readonly run: ShooterGameRun;
  readonly locale: GameLocale;
  readonly busy: boolean;
  readonly onContinue: () => void;
};

export const RunResultScreen = ({
  content,
  run,
  locale,
  busy,
  onContinue,
}: Props) => {
  const cleared = run.outcome === "cleared";
  const abandoned = run.outcome === "abandoned";
  const character = content.characters.find(
    (candidate) => candidate.id === run.state.character_slug,
  );
  const chapter = content.chapters.find(
    (candidate) => candidate.id === run.state.chapter_slug,
  );
  const ending = chapter?.endings.find(
    (candidate) => candidate.id === run.state.ending_id,
  );
  const chosenIntermission = chapter?.story.intermission.choices.find(
    (choice) => run.state.selected_choice_ids.includes(choice.id),
  );
  const conclusion = ending?.messages.length
    ? ending.messages
    : cleared
      ? (chapter?.story.epilogue ?? [])
      : [];
  const title = cleared
    ? gameText(locale, "runClearedV4")
    : abandoned
      ? gameText(locale, "runAbandonedV4")
      : gameText(locale, "runFailedV4");

  return (
    <main
      data-game-surface="true"
      className="grid min-h-[var(--xuhuan-stable-height,100dvh)] place-items-center bg-[#02050e] px-5 pb-[var(--xuhuan-host-safe-bottom)] pt-[calc(var(--xuhuan-host-safe-top)+2.5rem)] text-white"
    >
      <article className="w-full max-w-sm border border-cyan-200/25 bg-[#071225] p-5 text-center shadow-[8px_8px_0_rgba(79,70,229,.35)]">
        <p className="font-mono text-[9px] tracking-[.25em] text-cyan-300">
          {character?.name ?? run.state.character_slug}
        </p>
        <h1 className="mt-3 text-3xl font-black leading-tight">{title}</h1>
        {ending ? (
          <div className="mt-3 border border-pink-200/20 bg-pink-300/5 p-3 text-left">
            <p className="text-sm font-bold text-pink-100">{ending.title}</p>
            <p className="mt-1 text-[11px] leading-4 text-slate-300">
              {ending.summary}
            </p>
          </div>
        ) : null}
        {chosenIntermission ? (
          <p className="mt-3 text-left text-[11px] leading-4 text-cyan-100">
            {chosenIntermission.result}
          </p>
        ) : null}
        {conclusion.length > 0 ? (
          <div className="mt-3 space-y-1.5 text-left" data-testid="run-conclusion">
            {conclusion.slice(0, 3).map((message, index) => (
              <p key={`${message.sender}-${index}`} className="border-l-2 border-cyan-300/30 pl-2 text-[11px] leading-4 text-slate-300">
                <span className="mr-1 font-mono text-[8px] text-cyan-300">{message.sender}</span>
                {message.text}
              </p>
            ))}
          </div>
        ) : null}
        <div className="mt-6 border-y border-white/10 py-5">
          <p className="font-mono text-[9px] tracking-[.2em] text-slate-500">
            {gameText(locale, "finalScore")}
          </p>
          <p className="mt-1 font-mono text-5xl font-black text-cyan-200">
            {run.state.score.toLocaleString(locale === "en" ? "en-CA" : "zh-CN")}
          </p>
        </div>
        <button
          type="button"
          data-testid="return-to-hub"
          disabled={busy}
          onClick={onContinue}
          className="mt-6 w-full bg-gradient-to-r from-cyan-300 to-violet-400 px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-50"
        >
          {gameText(locale, "continue")}
        </button>
      </article>
    </main>
  );
};
