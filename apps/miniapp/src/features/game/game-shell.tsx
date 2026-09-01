"use client";

import { useState } from "react";

import useLocale from "@/components/providers/use-locale";
import { gameText, type GameLocale } from "@/features/game/game-copy";
import { HubScreen } from "@/features/game/hub-screen";
import { RunResultScreen } from "@/features/game/run-result-screen";
import { StoryChat } from "@/features/game/story-chat";
import {
  type RunMode,
  useGameController,
} from "@/features/game/use-game-controller";
import { ShooterArena } from "@/features/shooter/shooter-arena";
import { ShooterGates } from "@/features/shooter/shooter-gates";
import { APIError } from "@/lib/api/client";
import type {
  ShooterContent,
  ShooterGameRun,
  ShooterStoryScene,
} from "@/lib/api/types";

const preferredRun = (
  campaign: ShooterGameRun | null,
  daily: ShooterGameRun | null,
  preferred: RunMode,
): { mode: RunMode; run: ShooterGameRun | null } => {
  const requested = preferred === "daily" ? daily : campaign;
  if (requested) return { mode: preferred, run: requested };
  if (campaign) return { mode: "campaign", run: campaign };
  if (daily) return { mode: "daily", run: daily };
  return { mode: preferred, run: null };
};

const localizedSystemBubble = (
  content: ShooterContent,
  preferredChapter: ShooterContent["chapters"][number],
) => {
  const chapters = [
    preferredChapter,
    ...content.chapters.filter(
      (candidate) => candidate.id !== preferredChapter.id,
    ),
  ];
  for (const chapter of chapters) {
    const message = [
      ...chapter.story.intermission.messages,
      ...chapter.story.prelude,
      ...chapter.story.epilogue,
      ...chapter.story.replay_recap,
    ].find((candidate) => candidate.sender_id === "system");
    if (message) return message;
  }
  return null;
};

const resolveStoryScene = (
  content: ShooterContent,
  run: ShooterGameRun,
): ShooterStoryScene | null => {
  const story = run.state.story;
  const chapter = content.chapters.find(
    (candidate) => candidate.id === run.state.chapter_slug,
  );
  if (!story || !chapter) return null;
  if (story.scene_id === `${chapter.id}-intermission`) {
    const intermission = chapter.story.intermission;
    const localizedSystem = localizedSystemBubble(content, chapter);
    if (!localizedSystem) return null;
    return {
      id: story.scene_id,
      title: chapter.title,
      messages: [
        { ...localizedSystem, text: intermission.prompt },
        ...intermission.messages,
      ],
      options: intermission.choices
        .filter((choice) => story.choice_ids.includes(choice.id))
        .map((choice) => ({
          id: choice.id,
          label: choice.label,
          hint: choice.result,
        })),
    };
  }
  if (story.scene_id === "zero-channel-ending") {
    return {
      id: story.scene_id,
      title: chapter.title,
      messages: chapter.story.epilogue.slice(0, 3),
      options: chapter.endings
        .filter((ending) => story.choice_ids.includes(ending.id))
        .map((ending) => ({
          id: ending.id,
          label: ending.title,
          hint: ending.summary,
        })),
    };
  }
  return null;
};

const GameShell = () => {
  const { language: locale } = useLocale();
  const controller = useGameController(locale);
  const { content, game, loading, busy, error } = controller;
  const [requestedMode, setRequestedMode] = useState<RunMode>("campaign");

  if (loading && (!content || !game)) return <LoadingScreen locale={locale} />;
  if (!content || !game) {
    return (
      <FatalError
        locale={locale}
        error={error}
        onRetry={() => void controller.load()}
      />
    );
  }

  if (
    content.version !== "v4" ||
    content.protocol !== "shooter-v1" ||
    game.content_version !== "v4" ||
    game.protocol !== "shooter-v1"
  ) {
    return <MaintenanceScreen locale={locale} />;
  }

  const active = preferredRun(
    game.campaign_run,
    game.daily_run,
    requestedMode,
  );
  const { mode, run } = active;
  const command = (body: Parameters<typeof controller.command>[1]) =>
    controller.command(mode, body);

  let screen: React.ReactNode;
  if (!run) {
    screen = (
      <HubScreen
        content={content}
        game={game}
        locale={locale}
        busy={busy}
        onStartCampaign={(chapter, character, encore, companion) => {
          setRequestedMode("campaign");
          void controller.startCampaign(chapter, character, encore, companion);
        }}
        onStartDaily={() => {
          setRequestedMode("daily");
          void controller.startDaily();
        }}
      />
    );
  } else if (run.status !== "active" || run.state.phase === "completed") {
    screen = (
      <RunResultScreen
        content={content}
        run={run}
        locale={locale}
        busy={busy}
        onContinue={() => void controller.returnToHub()}
      />
    );
  } else {
    switch (run.state.phase) {
      case "segment":
        screen = (
          <ShooterArena
            key={`${run.id}:${run.version}:${run.state.segment_index}`}
            content={content}
            run={run}
            busy={busy}
            onComplete={async (trace) =>
              (await command({ type: "complete_segment", trace })) !== null
            }
          />
        );
        break;
      case "show_choice":
        screen = (
          <ShooterGates
            content={content}
            run={run}
            busy={busy}
            onChoose={async (optionID) =>
              (await command({
                type: "choose_show_option",
                option_id: optionID,
              })) !== null
            }
          />
        );
        break;
      case "story":
        const scene = resolveStoryScene(content, run);
        if (!scene) {
          screen = (
            <FatalError
              locale={locale}
              error={new Error("Story phase is missing its scene")}
              onRetry={() => void controller.load()}
            />
          );
          break;
        }
        screen = (
          <StoryChat
            scene={scene}
            locale={locale}
            busy={busy}
            onChoose={(sceneID, optionID) =>
              void command({
                type: "choose_intermission_reply",
                scene_id: sceneID,
                option_id: optionID,
              })
            }
          />
        );
        break;
      default:
        screen = <MaintenanceScreen locale={locale} />;
    }
  }

  const combat =
    run?.state.phase === "segment" || run?.state.phase === "show_choice";
  return (
    <>
      {screen}
      {busy && !combat ? <SyncIndicator locale={locale} /> : null}
      {error && !combat ? (
        <ErrorToast
          locale={locale}
          error={error}
          onDismiss={controller.clearError}
        />
      ) : null}
    </>
  );
};

const LoadingScreen = ({ locale }: { readonly locale: GameLocale }) => (
  <main className="grid min-h-[var(--xuhuan-stable-height,100dvh)] place-items-center bg-[#02050e] px-6 text-center text-white">
    <div>
      <div className="mx-auto mb-5 h-12 w-12 animate-pulse border-2 border-cyan-300/50 bg-cyan-300/10 shadow-[4px_4px_0_rgba(124,58,237,.5)]" />
      <p className="text-sm text-slate-300">{gameText(locale, "connecting")}</p>
      <p className="mt-2 font-mono text-[10px] tracking-[0.2em] text-cyan-400">
        CONTENT-V4 / SHOOTER-V1
      </p>
    </div>
  </main>
);

const MaintenanceScreen = ({ locale }: { readonly locale: GameLocale }) => (
  <main
    data-testid="protocol-maintenance"
    className="grid min-h-[var(--xuhuan-stable-height,100dvh)] place-items-center bg-[#02050e] p-6 text-center text-white"
  >
    <div className="max-w-xs border border-cyan-200/25 bg-[#071225] p-5">
      <p className="font-mono text-[9px] tracking-[.2em] text-cyan-300">
        CONTENT-V4 / SHOOTER-V1
      </p>
      <p className="mt-4 text-sm leading-6 text-slate-300">
        {gameText(locale, "protocolMaintenance")}
      </p>
    </div>
  </main>
);

const FatalError = ({
  locale,
  error,
  onRetry,
}: {
  readonly locale: GameLocale;
  readonly error: unknown;
  readonly onRetry: () => void;
}) => {
  const message =
    error instanceof APIError && error.status === 401
      ? gameText(locale, "authError")
      : error instanceof APIError &&
          (error.status === 404 || error.status === 502 || error.status === 503)
        ? gameText(locale, "maintenanceError")
        : gameText(locale, "networkError");
  return (
    <main className="grid min-h-[var(--xuhuan-stable-height,100dvh)] place-items-center bg-[#02050e] p-6 text-center text-white">
      <div className="max-w-xs">
        <div className="mb-4 text-5xl text-rose-300">⌁</div>
        <p className="text-sm leading-6 text-slate-300">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 border-2 border-cyan-300/35 bg-cyan-300/10 px-5 py-3 text-sm text-cyan-50"
        >
          {gameText(locale, "retry")}
        </button>
      </div>
    </main>
  );
};

const SyncIndicator = ({ locale }: { readonly locale: GameLocale }) => (
  <div
    aria-live="polite"
    className="pointer-events-none fixed left-3 top-[var(--xuhuan-host-safe-top)] z-50 flex items-center gap-2 border border-cyan-300/25 bg-slate-950/90 px-3 py-2 font-mono text-[10px] text-cyan-100 shadow-xl backdrop-blur"
  >
    <span className="h-2 w-2 animate-pulse bg-cyan-300" />
    {gameText(locale, "syncing")}
  </div>
);

const ErrorToast = ({
  locale,
  error,
  onDismiss,
}: {
  readonly locale: GameLocale;
  readonly error: unknown;
  readonly onDismiss: () => void;
}) => {
  const message =
    error instanceof APIError && error.status === 401
      ? gameText(locale, "authError")
      : error instanceof APIError && error.code === "invalid_command"
        ? gameText(locale, "unavailable")
        : gameText(locale, "networkError");
  return (
    <button
      type="button"
      onClick={onDismiss}
      className="fixed bottom-[var(--xuhuan-host-safe-bottom)] left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 border-2 border-rose-300/35 bg-rose-950/95 px-4 py-3 text-left text-xs leading-5 text-rose-50 shadow-2xl"
    >
      {message}
      <span className="float-right ml-2 text-rose-300">×</span>
    </button>
  );
};

export default GameShell;
