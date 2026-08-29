"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

import { gameText, type GameLocale } from "@/features/game/game-copy";
import type { APIGameContent, APIGameSnapshot } from "@/lib/api/client";

type HubScreenProps = {
  readonly content: APIGameContent;
  readonly game: APIGameSnapshot;
  readonly locale: GameLocale;
  readonly busy: boolean;
  readonly onStartCampaign: (
    chapterSlug: string,
    characterSlug: string,
    noiseLevel: number,
  ) => void;
  readonly onStartDaily: () => void;
};

const chapterUnlocked = (
  content: APIGameContent,
  game: APIGameSnapshot,
  chapterSlug: string,
) => {
  const chapter = content.chapters.find((item) => item.slug === chapterSlug);
  const current = content.chapters.find(
    (item) => item.slug === game.progress.current_chapter_slug,
  );
  if (!chapter || !current || !chapter.available) return false;
  if (game.progress.chapters.some((item) => item.chapter_slug === chapterSlug)) {
    return true;
  }
  return chapter.order <= current.order;
};

export const HubScreen = ({
  content,
  game,
  locale,
  busy,
  onStartCampaign,
  onStartDaily,
}: HubScreenProps) => {
  const initialChapter = chapterUnlocked(
    content,
    game,
    game.progress.current_chapter_slug,
  )
    ? game.progress.current_chapter_slug
    : (content.chapters[0]?.slug ?? "");
  const [selectedChapterSlug, setSelectedChapterSlug] = useState(initialChapter);
  const [selectedCharacterSlug, setSelectedCharacterSlug] = useState("");
  const [noise, setNoise] = useState(0);

  const chapter =
    content.chapters.find((item) => item.slug === selectedChapterSlug) ??
    content.chapters[0];
  const completedCharacters = useMemo(() => {
    const cleared = new Set(
      game.progress.chapters
        .filter((item) => item.clears > 0)
        .map((item) => item.chapter_slug),
    );
    return content.characters.filter((character) =>
      content.chapters.some(
        (item) =>
          item.character_slug === character.slug && cleared.has(item.slug),
      ),
    );
  }, [content, game.progress.chapters]);
  const chapterCharacter = content.characters.find(
    (item) => item.slug === chapter?.character_slug,
  );
  const character = chapter?.finale
    ? (completedCharacters.find(
        (item) => item.slug === selectedCharacterSlug,
      ) ?? completedCharacters[0])
    : chapterCharacter;
  const chapterProgress = game.progress.chapters.find(
    (item) => item.chapter_slug === chapter?.slug,
  );
  const maximumNoise = Math.min(
    3,
    chapterProgress?.highest_noise_level ??
      (chapter?.slug === game.progress.current_chapter_slug
        ? game.progress.highest_noise_level
        : 0),
  );
  const effectiveNoise = Math.min(noise, maximumNoise);

  if (!chapter || !character) return null;

  return (
    <main
      data-game-surface="true"
      className="mx-auto min-h-[var(--xuhuan-stable-height,100dvh)] w-full max-w-lg overflow-hidden bg-[#060b15] text-white"
    >
      <section className="relative min-h-[22rem] overflow-hidden border-b-2 border-cyan-300/20 px-5 pb-5 pt-[var(--xuhuan-host-safe-top)]">
        <Image
          src={chapter.background_url}
          alt=""
          fill
          sizes="512px"
          className="object-cover opacity-65 [image-rendering:pixelated]"
          priority
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,.1),rgba(2,6,23,.5)_58%,#060b15),radial-gradient(circle_at_82%_32%,rgba(168,85,247,.28),transparent_35%)]" />
        <div className="absolute -right-8 bottom-0 h-72 w-64 opacity-90">
          <Image
            src={character.portrait_url}
            alt={character.name}
            fill
            sizes="256px"
            unoptimized
            className="object-contain object-bottom drop-shadow-[0_0_24px_rgba(103,232,249,.28)] [image-rendering:pixelated]"
            priority
          />
        </div>
        <div className="relative z-[1] max-w-[66%]">
          <div className="mb-7 flex items-center gap-2 text-xs text-emerald-300">
            <span className="h-2 w-2 bg-emerald-400 shadow-[0_0_10px_#34d399]" />
            {gameText(locale, "online")}
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-cyan-200">
            CH {String(chapter.order).padStart(2, "0")}{" // "}{gameText(locale, "chapter")}
          </p>
          <h1 className="mt-2 text-3xl font-black leading-tight drop-shadow-lg">
            {chapter.title}
          </h1>
          <p className="mt-2 text-sm leading-5 text-slate-200">
            {chapter.subtitle}
          </p>
          <span className="mt-4 inline-flex border border-white/20 bg-black/45 px-2.5 py-1 font-mono text-[10px] text-slate-200">
            {gameText(locale, "runLength")}
          </span>
        </div>
      </section>

      <div className="space-y-6 px-4 py-5 pb-[var(--xuhuan-host-safe-bottom)]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-slate-300">
              {gameText(locale, "chapters")}
            </h2>
            {game.progress.ending ? (
              <span className="border border-violet-300/30 bg-violet-400/10 px-2 py-1 font-mono text-[9px] text-violet-200">
                {gameText(locale, "ending")}: {game.progress.ending}
              </span>
            ) : null}
          </div>
          <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-2">
            {content.chapters.map((item) => {
              const unlocked = chapterUnlocked(content, game, item.slug);
              const progress = game.progress.chapters.find(
                (entry) => entry.chapter_slug === item.slug,
              );
              const selected = item.slug === chapter.slug;
              return (
                <button
                  key={item.slug}
                  data-testid={`chapter-${item.slug}`}
                  type="button"
                  disabled={!unlocked}
                  onClick={() => {
                    setSelectedChapterSlug(item.slug);
                    setNoise(0);
                  }}
                  className={`w-36 shrink-0 snap-start border-2 p-3 text-left transition disabled:opacity-35 ${selected ? "border-cyan-200 bg-cyan-300 text-slate-950 shadow-[3px_3px_0_#7c3aed]" : "border-slate-700 bg-[#0b1424] text-slate-200"}`}
                >
                  <span className="font-mono text-[9px] font-bold">
                    {unlocked
                      ? progress?.clears
                        ? gameText(locale, "cleared")
                        : gameText(locale, "current")
                      : gameText(locale, "locked")}
                  </span>
                  <strong className="mt-2 block line-clamp-2 text-xs leading-4">
                    {item.title}
                  </strong>
                </button>
              );
            })}
          </div>
        </section>

        {chapter.finale ? (
          <section>
            <h2 className="text-sm font-bold">{gameText(locale, "selectPilot")}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {gameText(locale, "finalePilotHint")}
            </p>
            <div className="mt-3 grid grid-cols-7 gap-2">
              {completedCharacters.map((item) => {
                const selected = item.slug === character.slug;
                return (
                  <button
                    key={item.slug}
                    data-testid={`pilot-${item.slug}`}
                    type="button"
                    onClick={() => setSelectedCharacterSlug(item.slug)}
                    className={`relative aspect-square overflow-hidden border-2 ${selected ? "border-cyan-200 bg-cyan-300/15" : "border-white/10 bg-white/5"}`}
                    aria-label={item.name}
                  >
                    <Image
                      src={item.portrait_url}
                      alt=""
                      fill
                      sizes="52px"
                      unoptimized
                      className="object-contain [image-rendering:pixelated]"
                    />
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold">{gameText(locale, "noise")}</h2>
            <span className="font-mono text-xs text-cyan-200">N-{effectiveNoise}</span>
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
                  className={`border-2 py-3 font-mono text-sm font-black transition ${effectiveNoise === level ? "border-cyan-200 bg-cyan-300 text-slate-950 shadow-[2px_2px_0_#7c3aed]" : enabled ? "border-white/15 bg-white/5 text-white" : "border-white/5 bg-white/[0.02] text-slate-700"}`}
                >
                  {level}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            {gameText(locale, "noiseHint")}
          </p>
        </section>

        <button
          data-testid="start-campaign"
          type="button"
          disabled={busy || !chapterUnlocked(content, game, chapter.slug)}
          onClick={() => onStartCampaign(chapter.slug, character.slug, effectiveNoise)}
          className="group relative w-full overflow-hidden bg-gradient-to-r from-cyan-300 via-sky-400 to-violet-400 px-5 py-4 text-left text-slate-950 shadow-[5px_5px_0_rgba(91,33,182,.75)] transition active:translate-x-1 active:translate-y-1 active:shadow-none disabled:opacity-50"
        >
          <span className="block text-base font-black">
            {gameText(locale, "start")}
          </span>
          <span className="mt-1 block pr-8 text-xs opacity-75">
            {character.playstyle}
          </span>
          <span className="absolute right-5 top-1/2 -translate-y-1/2 text-2xl">→</span>
        </button>

        <section className="border-2 border-violet-300/25 bg-violet-500/[.07] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-black text-violet-100">
                {gameText(locale, "daily")}
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                {game.progress.daily_unlocked
                  ? gameText(locale, "dailyHint")
                  : gameText(locale, "dailyLocked")}
              </p>
            </div>
            <span className="font-mono text-xs text-violet-200">UTC</span>
          </div>
          {game.daily_result ? (
            <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[10px]">
              <span className="border border-white/10 bg-black/20 p-2 text-slate-400">
                {gameText(locale, "score")}
                <b className="float-right text-cyan-100">
                  {game.daily_result.score}
                </b>
              </span>
              <span className="border border-white/10 bg-black/20 p-2 text-slate-400">
                {gameText(locale, "dailyStreak")}
                <b className="float-right text-violet-100">
                  {game.daily_result.streak}
                </b>
              </span>
            </div>
          ) : null}
          <button
            data-testid="start-daily"
            type="button"
            disabled={busy || !game.progress.daily_unlocked}
            onClick={onStartDaily}
            className="mt-3 w-full border-2 border-violet-300/35 bg-violet-400/15 py-3 font-mono text-[10px] font-bold tracking-[.15em] text-violet-100 disabled:opacity-30"
          >
            {gameText(locale, "daily")}
          </button>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-bold">{gameText(locale, "roster")}</h2>
          <div className="grid grid-cols-7 gap-2">
            {content.characters.map((item) => {
              const unlocked = completedCharacters.some(
                (entry) => entry.slug === item.slug,
              ) || item.slug === "nana7mi";
              return (
                <div key={item.slug} className="text-center">
                  <div
                    className={`relative mx-auto aspect-square overflow-hidden border-2 ${unlocked ? "border-cyan-300/60" : "border-white/10 grayscale"}`}
                  >
                    <Image
                      src={item.portrait_url}
                      alt={item.name}
                      fill
                      sizes="52px"
                      unoptimized
                      className="object-contain [image-rendering:pixelated]"
                    />
                    {!unlocked ? (
                      <span className="absolute inset-0 grid place-items-center bg-black/55 text-[10px]">⌁</span>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate text-[9px] text-slate-400">
                    {item.name}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
};
