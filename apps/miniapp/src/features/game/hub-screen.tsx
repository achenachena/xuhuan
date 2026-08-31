"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

import { useAudio } from "@/components/providers/audio-provider";
import type { GameLocale } from "@/features/game/game-copy";
import { formatGameText, gameText } from "@/features/game/game-copy";
import type {
  ShooterChapterContent,
  ShooterContent,
  ShooterGameSnapshot,
} from "@/lib/api/types";

type Props = {
  readonly content: ShooterContent;
  readonly game: ShooterGameSnapshot;
  readonly locale: GameLocale;
  readonly busy: boolean;
  readonly onStartCampaign: (
    chapterSlug: string,
    characterSlug: string,
    encoreLevel: number,
    companionSlug?: string,
  ) => void;
  readonly onStartDaily: () => void;
};

const orderedChapters = (content: ShooterContent): readonly ShooterChapterContent[] =>
  [...content.chapters].sort((left, right) => left.order - right.order);

const defaultCharacterForChapter = (
  chapter: ShooterChapterContent | undefined,
  content: ShooterContent,
  unlockedCharacterIDs: ReadonlySet<string>,
): string => {
  const featured = content.characters.find(
    (character) => character.id === chapter?.featured_character,
  );
  if (featured && chapter?.featured_character !== "player-choice") {
    return featured.id;
  }
  return (
    content.characters.find((character) =>
      unlockedCharacterIDs.has(character.id),
    )?.id ??
    content.characters[0]?.id ??
    ""
  );
};

export const HubScreen = ({
  content,
  game,
  locale,
  busy,
  onStartCampaign,
  onStartDaily,
}: Props) => {
  const audio = useAudio();
  const chapters = useMemo(() => orderedChapters(content), [content]);
  const currentChapter = chapters.find(
    (chapter) => chapter.id === game.progress.current_chapter_slug,
  ) ?? chapters[0];
  const [selectedChapterID, setSelectedChapterID] = useState(
    currentChapter?.id ?? "",
  );
  const selectedChapter =
    chapters.find((chapter) => chapter.id === selectedChapterID) ?? currentChapter;
  const unlockedChapterIDs = useMemo(
    () =>
      new Set([
        game.progress.current_chapter_slug,
        ...game.progress.chapters
          .filter((chapter) => chapter.clears > 0)
          .map((chapter) => chapter.chapter_slug),
      ]),
    [game.progress],
  );
  const unlockedCharacterIDs = useMemo(
    () =>
      new Set(
        game.progress.unlocks
          .filter((unlock) => unlock.type === "character")
          .map((unlock) => unlock.content_slug),
      ),
    [game.progress.unlocks],
  );
  const unlockedCompanionIDs = useMemo(
    () =>
      new Set(
        game.progress.unlocks
          .filter((unlock) => unlock.type === "companion")
          .map((unlock) => unlock.content_slug),
      ),
    [game.progress.unlocks],
  );
  const unlockedCharacters = content.characters.filter((character) =>
    unlockedCharacterIDs.has(character.id),
  );
  const unlockedCompanions = content.companions.filter((companion) =>
    unlockedCompanionIDs.has(companion.id),
  );
  const defaultCharacter = defaultCharacterForChapter(
    selectedChapter,
    content,
    unlockedCharacterIDs,
  );
  const [selectedCharacterID, setSelectedCharacterID] = useState(defaultCharacter);
  const [selectedCompanionID, setSelectedCompanionID] = useState("");
  const [encoreLevel, setEncoreLevel] = useState(0);
  const chapterProgress = game.progress.chapters.find(
    (chapter) => chapter.chapter_slug === selectedChapter?.id,
  );
  const maxEncore = Math.min(
    3,
    chapterProgress?.highest_encore_level ?? 0,
  );
  const character =
    content.characters.find((candidate) => candidate.id === selectedCharacterID) ??
    content.characters.find((candidate) => candidate.id === defaultCharacter);

  const selectChapter = (chapter: ShooterChapterContent) => {
    setSelectedChapterID(chapter.id);
    setSelectedCharacterID(
      defaultCharacterForChapter(chapter, content, unlockedCharacterIDs),
    );
    setEncoreLevel(0);
    setSelectedCompanionID("");
  };

  if (!selectedChapter || !character) {
    return (
      <main className="grid min-h-[var(--xuhuan-stable-height,100dvh)] place-items-center bg-[#02050e] text-slate-200">
        {gameText(locale, "maintenanceError")}
      </main>
    );
  }

  const cleared = chapterProgress?.clears ?? 0;
  const isFinale = selectedChapter.id === "zero-channel";
  const canSelectCharacter =
    (cleared > 0 || isFinale) && unlockedCharacters.length > 1;
  const storyMessages = (
    cleared > 0
      ? selectedChapter.story.replay_recap
      : selectedChapter.story.prelude
  ).slice(0, 3);
  const onlineCount = Math.min(
    8,
    1 +
      game.progress.chapters.filter(
        (progress) =>
          progress.clears > 0 && progress.chapter_slug !== "zero-channel",
      ).length,
  );

  return (
    <main
      data-game-surface="true"
      className="relative min-h-[var(--xuhuan-stable-height,100dvh)] overflow-hidden bg-[#02050e] text-white"
    >
      <div
        className="absolute inset-0 bg-cover bg-center opacity-45"
        style={{ backgroundImage: `url(${selectedChapter.background_url})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#02050e]/80 via-[#02050e]/35 to-[#02050e]" />
      <section className="relative mx-auto flex min-h-[var(--xuhuan-stable-height,100dvh)] w-full max-w-md flex-col px-4 pb-[var(--xuhuan-host-safe-bottom)] pt-[calc(var(--xuhuan-host-safe-top)+2.5rem)]">
        <header className="pr-9">
          <p className="font-mono text-[9px] font-bold tracking-[.28em] text-cyan-200">
            {gameText(locale, "backstage")} · {formatGameText(locale, "online", { current: onlineCount })}
          </p>
          <h1 className="mt-2 text-[clamp(1.8rem,9vw,2.7rem)] font-black leading-[.95] tracking-tight">
            {selectedChapter.title}
          </h1>
          <p className="mt-2 max-w-sm text-sm leading-5 text-slate-300">
            {selectedChapter.subtitle}
          </p>
        </header>

        <div className="mt-3 space-y-1.5" data-testid="chapter-intro-feed">
          {storyMessages.map((message, index) => (
            <div
              key={`${message.sender}-${index}`}
              className="max-w-[92%] border border-white/10 bg-[#101d2d]/90 px-2.5 py-1.5 text-[11px] leading-4 text-slate-100"
            >
              <span className="mr-2 font-mono text-[8px] font-bold text-cyan-300">
                {message.sender}
              </span>
              {message.text}
            </div>
          ))}
        </div>

        <div className="mt-4 flex min-h-0 flex-1 items-end justify-center">
          <div className="relative h-[min(45vh,20rem)] w-[min(72vw,18rem)]">
            <Image
              src={character.portrait_url}
              alt={character.name}
              fill
              priority
              sizes="(max-width: 480px) 72vw, 288px"
              className="object-contain object-bottom [image-rendering:pixelated] drop-shadow-[0_0_24px_rgba(103,232,249,.28)]"
            />
          </div>
        </div>

        <div className="border border-cyan-200/25 bg-[#06101f]/92 p-3 shadow-[5px_5px_0_rgba(67,56,202,.35)] backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-black">{character.name}</p>
              <p className="mt-0.5 truncate text-[11px] text-slate-400">
                {gameText(locale, "startHintV4")}
              </p>
            </div>
            <button
              type="button"
              aria-label={gameText(locale, audio.muted ? "unmuteAudio" : "muteAudio")}
              onClick={audio.toggleMuted}
              className="grid h-8 w-8 shrink-0 place-items-center border border-white/15 bg-slate-900/80 text-xs text-slate-200"
            >
              {audio.muted ? "×" : "♪"}
            </button>
          </div>

          {canSelectCharacter ? (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label={gameText(locale, "selectPilot")}>
              {unlockedCharacters.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  data-testid={`pilot-${candidate.id}`}
                  onClick={() => setSelectedCharacterID(candidate.id)}
                  className={`shrink-0 border px-2 py-1 text-[10px] font-bold ${candidate.id === character.id ? "border-cyan-200 bg-cyan-300/20 text-cyan-50" : "border-white/15 bg-white/5 text-slate-400"}`}
                >
                  {candidate.name}
                </button>
              ))}
            </div>
          ) : null}

          {cleared > 0 && unlockedCompanions.length > 0 ? (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label={gameText(locale, "selectCompanion")}>
              <button
                type="button"
                onClick={() => setSelectedCompanionID("")}
                aria-pressed={selectedCompanionID === ""}
                className={`shrink-0 border px-2 py-1 text-[10px] font-bold ${selectedCompanionID === "" ? "border-pink-200 bg-pink-300/20 text-pink-50" : "border-white/15 bg-white/5 text-slate-400"}`}
              >
                {gameText(locale, "noCompanion")}
              </button>
              {unlockedCompanions.map((companion) => (
                <button
                  key={companion.id}
                  type="button"
                  data-testid={`companion-${companion.id}`}
                  onClick={() => setSelectedCompanionID(companion.id)}
                  aria-pressed={selectedCompanionID === companion.id}
                  className={`shrink-0 border px-2 py-1 text-[10px] font-bold ${selectedCompanionID === companion.id ? "border-pink-200 bg-pink-300/20 text-pink-50" : "border-white/15 bg-white/5 text-slate-400"}`}
                >
                  {companion.name}
                </button>
              ))}
            </div>
          ) : null}

          {cleared > 0 && maxEncore > 0 ? (
            <div className="mt-3 flex items-center gap-2">
              <span className="font-mono text-[9px] tracking-wider text-slate-400">
                {gameText(locale, "encore")}
              </span>
              {Array.from({ length: maxEncore + 1 }, (_, level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setEncoreLevel(level)}
                  className={`h-7 w-7 border font-mono text-[10px] ${encoreLevel === level ? "border-amber-200 bg-amber-300 text-slate-950" : "border-white/15 bg-white/5 text-slate-300"}`}
                >
                  {level}
                </button>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            data-testid="start-campaign"
            disabled={busy}
            onClick={() => onStartCampaign(selectedChapter.id, character.id, encoreLevel, selectedCompanionID || undefined)}
            className="mt-3 w-full bg-gradient-to-r from-cyan-300 via-sky-300 to-violet-400 px-5 py-3 text-sm font-black tracking-[.12em] text-slate-950 shadow-[4px_4px_0_rgba(14,116,144,.45)] active:translate-x-px active:translate-y-px active:shadow-none disabled:opacity-50"
          >
            {busy ? gameText(locale, "connectingShort") : gameText(locale, "goLive")}
          </button>
          {cleared > 0 ? (
            <p className="mt-2 text-center font-mono text-[8px] text-slate-500">
              {formatGameText(locale, "chapterClearCount", { count: cleared })}
            </p>
          ) : null}
        </div>

        <nav className="mt-3 flex justify-center gap-1.5" aria-label={gameText(locale, "chapters")}>
          {chapters.map((chapter) => {
            const unlocked = unlockedChapterIDs.has(chapter.id);
            return (
              <button
                key={chapter.id}
                type="button"
                data-testid={`chapter-${chapter.id}`}
                disabled={!unlocked}
                aria-label={chapter.title}
                onClick={() => selectChapter(chapter)}
                className={`h-2.5 w-6 border ${chapter.id === selectedChapter.id ? "border-cyan-100 bg-cyan-300" : unlocked ? "border-cyan-300/40 bg-cyan-300/15" : "border-slate-800 bg-slate-900"}`}
              />
            );
          })}
        </nav>

        {game.progress.daily_unlocked ? (
          <div className="mt-3 border border-pink-200/25 bg-pink-300/10 p-2">
            <button
              type="button"
              data-testid="start-daily"
              disabled={busy}
              onClick={onStartDaily}
              className="w-full px-2 py-1 font-mono text-[10px] font-bold tracking-wider text-pink-100 disabled:opacity-50"
            >
              {content.daily.title}
            </button>
            {game.daily_result ? (
              <p
                data-testid="daily-best-summary"
                className="mt-1 text-center font-mono text-[8px] tracking-wider text-pink-200/70"
              >
                {formatGameText(locale, "dailyBestSummary", {
                  score: game.daily_result.score,
                  streak: game.daily_result.streak,
                })}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
};
