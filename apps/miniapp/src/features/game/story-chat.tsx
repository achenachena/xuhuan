import type { APIGameContent } from "@/lib/api/client";
import { gameText, type GameLocale } from "@/features/game/game-copy";

type StoryChatProps = {
  readonly content: APIGameContent;
  readonly sceneSlug: string;
  readonly locale: GameLocale;
  readonly busy: boolean;
  readonly onChoose: (sceneSlug: string, optionSlug: string) => void;
};

export const StoryChat = ({ content, sceneSlug, locale, busy, onChoose }: StoryChatProps) => {
  const scene = content.scenes.find((item) => item.slug === sceneSlug);
  if (!scene) {
    return null;
  }

  return (
    <section className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col bg-[#101827]">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-[#172231]/95 px-4 pb-3 pt-[var(--xuhuan-host-safe-top)] backdrop-blur">
        <p className="text-sm font-semibold text-white">{gameText(locale, "backendGroup")}</p>
        <div className="mt-1 flex items-center gap-2 text-xs text-emerald-300">
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399]" />
          {gameText(locale, "online")}
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto bg-[radial-gradient(circle_at_top,#202d4b_0%,#101827_56%)] px-4 py-5">
        <div className="mx-auto w-fit rounded-full bg-white/10 px-3 py-1 text-[11px] text-slate-300">
          {scene.title}
        </div>
        {scene.messages.map((message, index) =>
          message.kind === "system" ? (
            <div key={`${message.sender}-${index}`} className="mx-auto max-w-[92%] rounded-xl border border-cyan-300/20 bg-cyan-950/40 px-3 py-2 text-center text-xs leading-5 text-cyan-100">
              <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-400">
                {gameText(locale, "system")}
              </span>
              {message.text}
            </div>
          ) : (
            <div key={`${message.sender}-${index}`} className="flex items-end gap-2">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-cyan-300 to-violet-500 text-xs font-bold text-slate-950">
                {message.sender.slice(0, 1).toUpperCase()}
              </div>
              <div className="max-w-[82%] rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-sm leading-5 text-slate-900 shadow-lg shadow-black/10">
                <span className="mb-0.5 block text-[10px] font-semibold text-violet-600">{message.sender}</span>
                {message.text}
              </div>
            </div>
          )
        )}
      </div>

      <footer className="border-t border-white/10 bg-[#172231] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <p className="mb-2 text-[11px] uppercase tracking-[0.16em] text-slate-400">{gameText(locale, "chooseReply")}</p>
        <div className="space-y-2">
          {scene.options.map((option) => (
            <button
              key={option.slug}
              type="button"
              disabled={busy}
              onClick={() => onChoose(scene.slug, option.slug)}
              className="w-full rounded-xl border border-violet-400/35 bg-violet-500/15 px-4 py-3 text-left text-sm font-medium text-violet-50 transition active:scale-[0.98] disabled:opacity-50"
            >
              {option.label}
            </button>
          ))}
        </div>
      </footer>
    </section>
  );
};
