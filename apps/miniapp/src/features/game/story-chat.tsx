"use client";

import type { GameLocale } from "@/features/game/game-copy";
import { gameText } from "@/features/game/game-copy";
import type { ShooterStoryScene } from "@/lib/api/types";

type Props = {
  readonly scene: ShooterStoryScene;
  readonly locale: GameLocale;
  readonly busy: boolean;
  readonly onChoose: (sceneID: string, optionID: string) => void;
};

export const StoryChat = ({ scene, locale, busy, onChoose }: Props) => (
  <main
    data-game-surface="true"
    className="flex min-h-[var(--xuhuan-stable-height,100dvh)] flex-col bg-[#0d1725] pt-[var(--xuhuan-host-safe-top)] text-slate-50"
  >
    <header className="border-b border-white/10 bg-[#111d2d] px-4 py-3 pr-14">
      <p className="font-mono text-[9px] tracking-[.22em] text-cyan-300">
        {gameText(locale, "intermission")}
      </p>
      <h1 className="mt-1 truncate text-base font-black">
        {scene.title ?? gameText(locale, "backstage")}
      </h1>
    </header>
    <section
      data-testid="intermission-story"
      className="flex-1 space-y-3 overflow-y-auto px-3 py-4"
      aria-live="polite"
    >
      {scene.messages.map((message, index) => {
        const system = message.sender_id === "system";
        return system ? (
          <p
            key={`${message.sender}-${index}`}
            data-message-kind="system"
            className="mx-auto max-w-[90%] text-center font-mono text-[9px] leading-4 text-slate-500"
          >
            <span className="block text-[8px] font-bold tracking-[.16em] text-cyan-400/70">
              {message.sender}
            </span>
            <span className="block">{message.text}</span>
          </p>
        ) : (
          <article
            key={`${message.sender}-${index}`}
            data-message-kind="character"
            className="max-w-[88%] rounded-br-xl rounded-t-xl border border-white/10 bg-[#1a293b] px-3 py-2.5 shadow-sm"
          >
            <p className="text-[9px] font-bold tracking-wide text-cyan-300">
              {message.sender}
            </p>
            <p className="mt-1 text-[13px] leading-5 text-slate-100">
              {message.text}
            </p>
          </article>
        );
      })}
    </section>
    <footer className="border-t border-white/10 bg-[#111d2d] px-3 pb-[var(--xuhuan-host-safe-bottom)] pt-3">
      <p className="mb-2 font-mono text-[8px] tracking-[.18em] text-slate-500">
        {gameText(locale, "chooseReplyV4")}
      </p>
      <div className="grid gap-2">
        {scene.options.map((option) => (
          <button
            key={option.id}
            type="button"
            data-testid={`story-option-${option.id}`}
            disabled={busy}
            onClick={() => onChoose(scene.id, option.id)}
            className="min-h-11 border border-cyan-200/25 bg-cyan-300/10 px-3 py-2 text-left text-[12px] font-bold leading-4 text-cyan-50 active:bg-cyan-300/20 disabled:opacity-50"
          >
            <span className="block">{option.label}</span>
            {option.hint ? (
              <span className="mt-0.5 block text-[10px] font-normal text-slate-400">
                {option.hint}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </footer>
  </main>
);
