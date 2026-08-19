"use client";

import useLocale from "@/components/providers/use-locale";
import { CombatScreen } from "@/features/game/combat-screen";
import { gameText, type GameLocale } from "@/features/game/game-copy";
import { HubScreen } from "@/features/game/hub-screen";
import { EventScreen, RestScreen, RewardScreen, RunResultScreen } from "@/features/game/interstitial-screens";
import { RouteMap } from "@/features/game/route-map";
import { StoryChat } from "@/features/game/story-chat";
import { useGameController } from "@/features/game/use-game-controller";
import { APIError } from "@/lib/api/client";

const localeFrom = (language: string): GameLocale => language.toLowerCase().startsWith("en") ? "en" : "zh-CN";

const GameShell = () => {
  const { language } = useLocale();
  const locale = localeFrom(language);
  const controller = useGameController(locale);
  const { content, game, loading, busy, error } = controller;

  if (loading && (!content || !game)) {
    return <LoadingScreen locale={locale} />;
  }
  if (!content || !game) {
    return <FatalError locale={locale} error={error} onRetry={() => void controller.load()} />;
  }

  const run = game.active_run;
  let screen: React.ReactNode;
  if (game.pending_scene_slug && !run) {
    screen = <StoryChat content={content} sceneSlug={game.pending_scene_slug} locale={locale} busy={busy} onChoose={(scene, option) => void controller.chooseStory(scene, option)} />;
  } else if (!run) {
    screen = <HubScreen content={content} game={game} locale={locale} busy={busy} onStart={(chapter, character, noise) => void controller.startRun(chapter, character, noise)} />;
  } else if (run.status !== "active" || run.state.phase === "completed") {
    screen = <RunResultScreen run={run} locale={locale} busy={busy} onContinue={() => void controller.returnToHub()} />;
  } else {
    switch (run.state.phase) {
      case "map":
        screen = <RouteMap content={content} run={run} locale={locale} busy={busy} onChooseNode={(nodeId) => void controller.command({ type: "choose_node", node_id: nodeId })} onAbandon={() => {
          if (window.confirm(gameText(locale, "abandonConfirm"))) {
            void controller.command({ type: "abandon_run" });
          }
        }} />;
        break;
      case "combat":
        screen = <CombatScreen content={content} run={run} locale={locale} busy={busy} onPlayCard={(cardId, targetId) => void controller.command({ type: "play_card", card_instance_id: cardId, target_id: targetId })} onEndTurn={() => void controller.command({ type: "end_turn" })} />;
        break;
      case "reward":
        screen = <RewardScreen content={content} run={run} locale={locale} busy={busy} onChoose={(slug) => void controller.command({ type: "choose_card_reward", choice_slug: slug })} />;
        break;
      case "event":
        screen = <EventScreen content={content} run={run} locale={locale} busy={busy} onChoose={(slug) => void controller.command({ type: "resolve_event", choice_slug: slug })} />;
        break;
      case "rest":
        screen = <RestScreen content={content} run={run} locale={locale} busy={busy} onRest={(operation, cardId) => void controller.command({ type: "rest", operation, card_instance_id: cardId })} />;
        break;
      default:
        screen = <FatalError locale={locale} error={new Error("unknown run phase")} onRetry={() => void controller.returnToHub()} />;
    }
  }

  return (
    <>
      {screen}
      {busy && <div aria-live="polite" className="pointer-events-none fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-50 flex items-center gap-2 rounded-full border border-cyan-300/20 bg-slate-950/85 px-3 py-2 text-[10px] text-cyan-200 shadow-xl backdrop-blur"><span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300" />SYNC</div>}
      {error && <ErrorToast locale={locale} error={error} onDismiss={controller.clearError} />}
    </>
  );
};

const LoadingScreen = ({ locale }: { readonly locale: GameLocale }) => (
  <main className="grid min-h-[100dvh] place-items-center bg-[#080d18] px-6 text-center text-white">
    <div><div className="mx-auto mb-5 h-12 w-12 animate-pulse rounded-full border border-cyan-300/40 bg-cyan-300/10 shadow-[0_0_28px_rgba(34,211,238,.24)]" /><p className="text-sm text-slate-300">{gameText(locale, "connecting")}</p><p className="mt-2 font-mono text-[10px] tracking-[0.2em] text-cyan-500">HANDSHAKE / V2</p></div>
  </main>
);

const FatalError = ({ locale, error, onRetry }: { readonly locale: GameLocale; readonly error: unknown; readonly onRetry: () => void }) => {
  const message = error instanceof APIError && error.status === 401 ? gameText(locale, "authError") : gameText(locale, "networkError");
  return <main className="grid min-h-[100dvh] place-items-center bg-[#080d18] p-6 text-center text-white"><div className="max-w-xs"><div className="mb-4 text-5xl text-rose-400">⌁</div><p className="text-sm leading-6 text-slate-300">{message}</p><button type="button" onClick={onRetry} className="mt-5 rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-5 py-3 text-sm text-cyan-100">{gameText(locale, "retry")}</button></div></main>;
};

const ErrorToast = ({ locale, error, onDismiss }: { readonly locale: GameLocale; readonly error: unknown; readonly onDismiss: () => void }) => {
  const message = error instanceof APIError && error.status === 401 ? gameText(locale, "authError") : error instanceof APIError && error.code === "invalid_command" ? gameText(locale, "unavailable") : gameText(locale, "networkError");
  return <button type="button" onClick={onDismiss} className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl border border-rose-400/25 bg-rose-950/95 px-4 py-3 text-left text-xs leading-5 text-rose-100 shadow-2xl">{message}<span className="float-right ml-2 text-rose-400">×</span></button>;
};

export default GameShell;
