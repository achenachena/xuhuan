"use client";

import { gameText, type GameLocale } from "@/features/game/game-copy";
import { SignalPanel } from "@/features/game/screens/signal-panel";
import type { APIGameContent, APIGameRun } from "@/lib/api/client";

type EventScreenProps = {
  readonly content: APIGameContent;
  readonly run: APIGameRun;
  readonly locale: GameLocale;
  readonly busy: boolean;
  readonly onChoose: (slug: string) => void;
};

export const EventScreen = ({
  content,
  run,
  locale,
  busy,
  onChoose,
}: EventScreenProps) => {
  const event = content.events.find(
    (item) => item.slug === run.state.current_event_slug,
  );
  if (!event) return null;
  return (
    <SignalPanel
      title={event.title}
      subtitle={event.body}
      eyebrow={gameText(locale, "event")}
    >
      <div className="space-y-3">
        {event.options.map((option, index) => (
          <button
            key={option.slug}
            data-testid={`event-choice-${option.slug}`}
            type="button"
            disabled={busy}
            onClick={() => onChoose(option.slug)}
            className="group grid w-full grid-cols-[2.5rem_1fr] gap-3 border-2 border-violet-300/35 bg-[#10152b] p-4 text-left shadow-[4px_4px_0_rgba(76,29,149,.45)] transition active:translate-x-1 active:translate-y-1 active:shadow-none disabled:opacity-50"
          >
            <span className="grid h-10 w-10 place-items-center border border-violet-300/40 bg-violet-400/15 font-mono text-sm font-black text-violet-100">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span>
              <strong className="block text-sm text-white">{option.label}</strong>
              <span className="mt-1 block text-xs leading-5 text-slate-400">
                {option.result}
              </span>
            </span>
          </button>
        ))}
      </div>
    </SignalPanel>
  );
};
