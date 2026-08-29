"use client";

import { useEffect, useState } from "react";

import useLocale from "@/components/providers/use-locale";
import { ActionArena } from "@/features/action/action-arena";
import { preloadActionVisuals } from "@/features/action/action-renderer";
import { gameText, type GameLocale } from "@/features/game/game-copy";
import { HubScreen } from "@/features/game/hub-screen";
import {
  EventScreen,
  RestScreen,
  RewardScreen,
  RunResultScreen,
} from "@/features/game/interstitial-screens";
import { RouteMap } from "@/features/game/route-map";
import { StoryChat } from "@/features/game/story-chat";
import {
  type RunMode,
  useGameController,
} from "@/features/game/use-game-controller";
import { APIError, type APIGameRun } from "@/lib/api/client";

const preferredRun = (
  campaign: APIGameRun | null,
  daily: APIGameRun | null,
  preferred: RunMode,
): { mode: RunMode; run: APIGameRun | null } => {
  const requested = preferred === "daily" ? daily : campaign;
  if (requested) return { mode: preferred, run: requested };
  if (campaign) return { mode: "campaign", run: campaign };
  if (daily) return { mode: "daily", run: daily };
  return { mode: preferred, run: null };
};

const GameShell = () => {
  const { language } = useLocale();
  const locale = language;
  const controller = useGameController(locale);
  const { content, game, loading, busy, error } = controller;
  const [requestedMode, setRequestedMode] = useState<RunMode>("campaign");

  useEffect(() => {
    void preloadActionVisuals().catch(() => undefined);
  }, []);

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

  const active = preferredRun(
    game.campaign_run,
    game.daily_run,
    requestedMode,
  );
  const run = active.run;
  const mode = active.mode;
  const command = (body: Parameters<typeof controller.command>[1]) =>
    controller.command(mode, body);

  let screen: React.ReactNode;
  if (game.pending_scene_slug) {
    screen = (
      <StoryChat
        content={content}
        sceneSlug={game.pending_scene_slug}
        locale={locale}
        busy={busy}
        onChoose={(scene, option) => void controller.chooseStory(scene, option)}
      />
    );
  } else if (!run) {
    screen = (
      <HubScreen
        content={content}
        game={game}
        locale={locale}
        busy={busy}
        onStartCampaign={(chapter, character, noise) => {
          setRequestedMode("campaign");
          void controller.startCampaign(chapter, character, noise);
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
        run={run}
        characterName={
          content.characters.find(
            (character) => character.slug === run.state.character_slug,
          )?.name ?? gameText(locale, "unknownPilot")
        }
        locale={locale}
        busy={busy}
        onContinue={() => void controller.returnToHub()}
      />
    );
  } else {
    switch (run.state.phase) {
      case "map":
        screen = (
          <RouteMap
            content={content}
            run={run}
            locale={locale}
            busy={busy}
            onChooseNode={(nodeId) =>
              void command({ type: "choose_node", node_id: nodeId })
            }
            onAbandon={() => {
              if (window.confirm(gameText(locale, "abandonConfirm"))) {
                void command({ type: "abandon_run" });
              }
            }}
          />
        );
        break;
      case "encounter":
        screen = (
          <ActionArena
            key={`${run.id}:${run.version}:${run.state.encounter?.seed}`}
            content={content}
            run={run}
            locale={locale}
            busy={busy}
            onComplete={async (trace) =>
              (await command({ type: "complete_encounter", trace })) !== null
            }
          />
        );
        break;
      case "reward":
        screen = (
          <RewardScreen
            content={content}
            run={run}
            locale={locale}
            busy={busy}
            onChoose={(slug) =>
              void command({
                type: "choose_module_reward",
                choice_slug: slug,
              })
            }
            onReroll={() => void command({ type: "reroll_module_reward" })}
          />
        );
        break;
      case "event":
        screen = (
          <EventScreen
            content={content}
            run={run}
            locale={locale}
            busy={busy}
            onChoose={(slug) =>
              void command({ type: "resolve_event", choice_slug: slug })
            }
          />
        );
        break;
      case "rest":
        screen = (
          <RestScreen
            content={content}
            run={run}
            locale={locale}
            busy={busy}
            onRest={(operation, moduleSlug) =>
              void command({
                type: "rest",
                operation,
                module_slug: moduleSlug,
              })
            }
          />
        );
        break;
      default:
        screen = (
          <FatalError
            locale={locale}
            error={new Error("Unknown run phase")}
            onRetry={() => void controller.returnToHub()}
          />
        );
    }
  }

  return (
    <>
      {screen}
      {busy && run?.state.phase !== "encounter" ? (
        <div
          aria-live="polite"
          className="pointer-events-none fixed left-3 top-[var(--xuhuan-host-safe-top)] z-50 flex items-center gap-2 border border-cyan-300/25 bg-slate-950/90 px-3 py-2 font-mono text-[10px] text-cyan-100 shadow-xl backdrop-blur"
        >
          <span className="h-2 w-2 animate-pulse bg-cyan-300" />
          {gameText(locale, "syncing")}
        </div>
      ) : null}
      {error && run?.state.phase !== "encounter" ? (
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
  <main className="grid min-h-[var(--xuhuan-stable-height,100dvh)] place-items-center bg-[#050914] px-6 text-center text-white">
    <div>
      <div className="mx-auto mb-5 h-12 w-12 animate-pulse border-2 border-cyan-300/50 bg-cyan-300/10 shadow-[4px_4px_0_rgba(124,58,237,.5)]" />
      <p className="text-sm text-slate-300">{gameText(locale, "connecting")}</p>
      <p className="mt-2 font-mono text-[10px] tracking-[0.2em] text-cyan-400">
        CONTENT-V3 / ACTION-V2
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
    <main className="grid min-h-[var(--xuhuan-stable-height,100dvh)] place-items-center bg-[#050914] p-6 text-center text-white">
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
