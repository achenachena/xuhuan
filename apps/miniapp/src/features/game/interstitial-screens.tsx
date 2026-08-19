"use client";

import { useState } from "react";

import type { APIGameContent, APIGameRun } from "@/lib/api/client";
import { gameText, type GameLocale } from "@/features/game/game-copy";

type CommonProps = {
  readonly content: APIGameContent;
  readonly run: APIGameRun;
  readonly locale: GameLocale;
  readonly busy: boolean;
};

export const RewardScreen = ({ content, run, locale, busy, onChoose }: CommonProps & { readonly onChoose: (slug?: string) => void }) => {
  const choices = run.state.reward?.card_choices ?? [];
  return (
    <Panel title={gameText(locale, "reward")} subtitle={gameText(locale, "rewardHint")}>
      <div className="grid gap-3">
        {choices.map((slug) => {
          const card = content.cards.find((item) => item.slug === slug);
          return <button key={slug} type="button" disabled={busy} onClick={() => onChoose(slug)} className="rounded-2xl border border-cyan-300/25 bg-cyan-300/[0.07] p-4 text-left transition active:scale-[0.98] disabled:opacity-50"><strong className="text-cyan-100">{card?.name ?? slug}</strong><p className="mt-1 text-xs leading-5 text-slate-400">{card?.description}</p><span className="mt-3 inline-block rounded-full bg-white/5 px-2 py-1 text-[9px] uppercase text-slate-500">{card?.type} · {card?.cost}</span></button>;
        })}
      </div>
      <button type="button" disabled={busy} onClick={() => onChoose()} className="mt-4 w-full rounded-xl border border-white/10 py-3 text-sm text-slate-400 disabled:opacity-50">{gameText(locale, "skip")}</button>
    </Panel>
  );
};

export const EventScreen = ({ content, run, locale, busy, onChoose }: CommonProps & { readonly onChoose: (slug: string) => void }) => {
  const event = content.events.find((item) => item.slug === run.state.current_event_slug);
  if (!event) return null;
  return (
    <Panel title={event.title} subtitle={event.body} eyebrow={gameText(locale, "event")}>
      <div className="space-y-3">
        {event.options.map((option) => <button key={option.slug} type="button" disabled={busy} onClick={() => onChoose(option.slug)} className="w-full rounded-2xl border border-violet-400/25 bg-violet-400/[0.08] p-4 text-left transition active:scale-[0.98] disabled:opacity-50"><strong className="text-violet-100">{option.label}</strong><p className="mt-1 text-xs leading-5 text-slate-400">{option.result}</p></button>)}
      </div>
    </Panel>
  );
};

export const RestScreen = ({ content, run, locale, busy, onRest }: CommonProps & { readonly onRest: (operation: "heal" | "remove", cardId?: string) => void }) => {
  const [removing, setRemoving] = useState(false);
  return (
    <Panel title={gameText(locale, "rest")} subtitle={removing ? gameText(locale, "removeHint") : undefined}>
      {removing ? (
        <>
          <div className="max-h-[56dvh] space-y-2 overflow-y-auto pr-1">
            {run.state.deck.map((instance) => {
              const card = content.cards.find((item) => item.slug === instance.slug);
              return <button key={instance.id} type="button" disabled={busy || run.state.deck.length <= 7} onClick={() => onRest("remove", instance.id)} className="flex w-full items-center justify-between rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-3 py-3 text-left disabled:opacity-30"><span><strong className="block text-sm">{card?.name ?? instance.slug}</strong><small className="text-slate-500">{card?.type}</small></span><span className="text-rose-300">×</span></button>;
            })}
          </div>
          <button type="button" onClick={() => setRemoving(false)} className="mt-3 w-full rounded-xl border border-white/10 py-3 text-sm text-slate-400">{gameText(locale, "back")}</button>
        </>
      ) : (
        <div className="grid gap-3">
          <button type="button" disabled={busy} onClick={() => onRest("heal")} className="rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.08] p-5 text-left text-emerald-100 disabled:opacity-50"><span className="mr-3 text-2xl">＋</span><strong>{gameText(locale, "heal")}</strong></button>
          <button type="button" disabled={busy || run.state.deck.length <= 7} onClick={() => setRemoving(true)} className="rounded-2xl border border-rose-400/25 bg-rose-400/[0.08] p-5 text-left text-rose-100 disabled:opacity-30"><span className="mr-3 text-2xl">×</span><strong>{gameText(locale, "remove")}</strong></button>
        </div>
      )}
    </Panel>
  );
};

export const RunResultScreen = ({ run, locale, busy, onContinue }: { readonly run: APIGameRun; readonly locale: GameLocale; readonly busy: boolean; readonly onContinue: () => void }) => {
  const key = run.outcome === "cleared" ? "victory" : run.outcome === "abandoned" ? "abandoned" : "defeat";
  const glyph = run.outcome === "cleared" ? "⌁" : run.outcome === "abandoned" ? "×" : "…";
  return (
    <Panel title={gameText(locale, key)} subtitle={run.outcome === "cleared" ? "+ Noise 1 · Memory fragment recorded" : undefined}>
      <div className="my-8 text-center text-7xl text-cyan-300 drop-shadow-[0_0_25px_rgba(34,211,238,.5)]">{glyph}</div>
      <button type="button" disabled={busy} onClick={onContinue} className="w-full rounded-2xl bg-gradient-to-r from-cyan-300 to-violet-400 px-5 py-4 font-bold text-slate-950 disabled:opacity-50">{gameText(locale, "continue")}</button>
    </Panel>
  );
};

const Panel = ({ title, subtitle, eyebrow, children }: { readonly title: string; readonly subtitle?: string; readonly eyebrow?: string; readonly children: React.ReactNode }) => (
  <main className="mx-auto min-h-[100dvh] w-full max-w-lg bg-[radial-gradient(circle_at_top,rgba(76,29,149,.25),transparent_44%),#080d18] px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))] text-white">
    {eyebrow && <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-violet-300">{eyebrow}</p>}
    <h1 className="mt-2 text-2xl font-bold leading-tight">{title}</h1>
    {subtitle && <p className="mb-6 mt-2 text-sm leading-6 text-slate-400">{subtitle}</p>}
    {!subtitle && <div className="h-6" />}
    {children}
  </main>
);
