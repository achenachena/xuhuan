import Image from "next/image";
import { useState } from "react";

import type { APIGameContent, APIGameSnapshot } from "@/lib/api/client";
import { gameText, type GameLocale } from "@/features/game/game-copy";

type HubScreenProps = {
  readonly content: APIGameContent;
  readonly game: APIGameSnapshot;
  readonly locale: GameLocale;
  readonly busy: boolean;
  readonly onStart: (chapterSlug: string, characterSlug: string, noiseLevel: number) => void;
};

export const HubScreen = ({ content, game, locale, busy, onStart }: HubScreenProps) => {
  const [noise, setNoise] = useState(0);
  const chapter = content.chapters.find((item) => item.slug === game.progress.current_chapter_slug) ?? content.chapters[0];
  const character = content.characters.find((item) => item.slug === chapter?.character_slug);
  const maximumNoise = Math.min(3, game.progress.highest_noise_level);

  if (!chapter || !character) {
    return null;
  }

  return (
    <main className="mx-auto min-h-[100dvh] w-full max-w-lg overflow-hidden bg-[#090d18] text-white">
      <div className="relative min-h-[17rem] overflow-hidden border-b border-cyan-300/15 px-5 pb-5 pt-[var(--xuhuan-host-safe-top)]">
        <Image
          src="/game/v2/seventh-dock.webp"
          alt=""
          fill
          sizes="512px"
          className="object-cover opacity-55 [image-rendering:pixelated]"
          priority
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,rgba(168,85,247,.32),transparent_40%),linear-gradient(145deg,rgba(16,35,56,.72),rgba(17,16,31,.5)_55%,rgba(7,16,24,.8))]" />
        <div className="absolute -right-8 bottom-0 h-64 w-64 opacity-75">
          <Image src={character.portrait_url} alt={character.name} fill sizes="256px" className="object-contain object-bottom drop-shadow-[0_0_28px_rgba(103,232,249,.25)]" priority />
        </div>
        <div className="relative z-[1] max-w-[62%]">
          <div className="mb-8 flex items-center gap-2 text-xs text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399]" />
            {gameText(locale, "online")}
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-cyan-300">{gameText(locale, "chapter")}</p>
          <h1 className="mt-2 text-3xl font-bold leading-tight">{chapter.title}</h1>
          <p className="mt-2 text-sm leading-5 text-slate-300">{chapter.subtitle}</p>
          <span className="mt-4 inline-flex rounded-full border border-white/15 bg-black/25 px-2.5 py-1 text-[11px] text-slate-300">
            {gameText(locale, "runLength")}
          </span>
        </div>
      </div>

      <section className="space-y-6 px-4 py-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">{gameText(locale, "noise")}</h2>
            <span className="font-mono text-xs text-cyan-300">N-{noise}</span>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((level) => {
              const enabled = level <= maximumNoise;
              return (
                <button
                  key={level}
                  type="button"
                  disabled={!enabled}
                  onClick={() => setNoise(level)}
                  className={`rounded-xl border py-3 font-mono text-sm transition ${noise === level ? "border-cyan-300 bg-cyan-300 text-slate-950" : enabled ? "border-white/15 bg-white/5 text-white" : "border-white/5 bg-white/[0.02] text-slate-700"}`}
                >
                  {level}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">{gameText(locale, "noiseHint")}</p>
        </div>

        <button
          type="button"
          disabled={busy || !chapter.available}
          onClick={() => onStart(chapter.slug, character.slug, noise)}
          className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-r from-cyan-300 via-sky-400 to-violet-500 px-5 py-4 text-left text-slate-950 shadow-[0_0_32px_rgba(34,211,238,.16)] transition active:scale-[0.985] disabled:opacity-50"
        >
          <span className="block text-base font-bold">{gameText(locale, "start")}</span>
          <span className="mt-1 block text-xs opacity-70">{character.playstyle}</span>
          <span className="absolute right-5 top-1/2 -translate-y-1/2 text-2xl transition group-hover:translate-x-1">→</span>
        </button>

        <div>
          <h2 className="mb-3 text-sm font-semibold">{gameText(locale, "roster")}</h2>
          <div className="grid grid-cols-7 gap-2">
            {content.characters.map((item) => (
              <div key={item.slug} className="text-center">
                <div className={`relative mx-auto aspect-square overflow-hidden rounded-full border ${item.available ? "border-cyan-300/70" : "border-white/10 grayscale"}`}>
                  <Image src={item.portrait_url} alt={item.name} fill sizes="52px" className="object-cover" />
                  {!item.available && <span className="absolute inset-0 grid place-items-center bg-black/55 text-[10px]">⌁</span>}
                </div>
                <p className="mt-1 truncate text-[9px] text-slate-400">{item.name}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
};
