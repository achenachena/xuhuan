"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

import type { APIGameContent, APIGameRun } from "@/lib/api/client";
import { gameText, type GameLocale } from "@/features/game/game-copy";

type CombatScreenProps = {
  readonly content: APIGameContent;
  readonly run: APIGameRun;
  readonly locale: GameLocale;
  readonly busy: boolean;
  readonly onPlayCard: (cardInstanceId: string, targetId?: string) => void;
  readonly onEndTurn: () => void;
};

const cardStyle: Record<string, string> = {
  attack: "border-rose-400/55 bg-gradient-to-b from-rose-500/30 to-rose-950/70",
  defense: "border-sky-400/55 bg-gradient-to-b from-sky-500/30 to-sky-950/70",
  signal: "border-emerald-400/55 bg-gradient-to-b from-emerald-500/30 to-emerald-950/70",
  glitch: "border-violet-400/55 bg-[repeating-linear-gradient(135deg,rgba(168,85,247,.32)_0_7px,rgba(15,23,42,.8)_7px_14px)]"
};

const cardGlyph: Record<string, string> = { attack: "↗", defense: "◇", signal: "⌁", glitch: "#?" };

export const CombatScreen = ({ content, run, locale, busy, onPlayCard, onEndTurn }: CombatScreenProps) => {
  const combat = run.state.combat;
  const firstAlive = combat?.enemies.find((enemy) => enemy.health > 0)?.id ?? "";
  const [selectedTarget, setSelectedTarget] = useState(firstAlive);
  const [hint, setHint] = useState<string | null>(null);
  const cards = useMemo(() => new Map(content.cards.map((card) => [card.slug, card])), [content.cards]);
  const enemies = useMemo(() => new Map(content.enemies.map((enemy) => [enemy.slug, enemy])), [content.enemies]);

  if (!combat) {
    return null;
  }

  const play = (instanceId: string, slug: string) => {
    const card = cards.get(slug);
    if (!card) return;
    if (card.unplayable) {
      setHint(gameText(locale, "unplayable"));
      return;
    }
    const actualCost = card.type === "signal" && combat.player.discount_signal > 0 ? 0 : card.cost;
    if (actualCost > combat.player.bandwidth) {
      setHint(gameText(locale, "lowBandwidth"));
      return;
    }
    if (card.target === "enemy" && !selectedTarget) {
      setHint(gameText(locale, "selectTarget"));
      return;
    }
    setHint(null);
    onPlayCard(instanceId, card.target === "enemy" ? selectedTarget : card.target === "self" ? "player" : undefined);
  };

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col overflow-hidden bg-[#060a12] text-white">
      <header className="border-b border-white/10 bg-[#111827]/95 px-3 pb-2 pt-[max(0.55rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="flex items-center justify-between text-xs">
          <div><span className="text-slate-500">{gameText(locale, "combat")}</span><strong className="ml-2">{gameText(locale, "turn")} {combat.turn}</strong></div>
          <div className="font-mono text-emerald-300">♥ {combat.player.health}/{combat.player.max_health} <span className="ml-1 text-sky-300">◇ {combat.player.block}</span></div>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5 text-[11px]">
          <Meter label={gameText(locale, "bandwidth")} value={`${combat.player.bandwidth}`} tone="cyan" />
          <Meter label={gameText(locale, "beacon")} value={`${combat.player.beacons}/3`} tone="amber" />
          <Meter label={gameText(locale, "distortion")} value={`${combat.player.distortion}/${combat.player.distortion_limit}`} tone={combat.player.distortion >= 3 ? "violet" : "slate"} />
        </div>
      </header>

      <section className="relative flex min-h-[14.5rem] flex-1 items-center justify-center overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_center,rgba(30,64,175,.22),transparent_55%),linear-gradient(#07111f,#10101b)] px-3 py-3">
        <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(103,232,249,.15)_1px,transparent_1px),linear-gradient(90deg,rgba(103,232,249,.15)_1px,transparent_1px)] [background-size:24px_24px]" />
        <div className={`relative z-[1] grid w-full gap-3 ${combat.enemies.length > 1 ? "grid-cols-2" : "grid-cols-1 px-12"}`}>
          {combat.enemies.map((enemy) => {
            const definition = enemies.get(enemy.slug);
            const intent = definition?.intents[enemy.intent_index % (definition.intents.length || 1)];
            const selected = selectedTarget === enemy.id;
            return (
              <button
                key={enemy.id}
                type="button"
                disabled={enemy.health <= 0 || busy}
                onClick={() => setSelectedTarget(enemy.id)}
                className={`relative min-w-0 rounded-2xl border p-2 text-left transition ${selected ? "border-cyan-300 bg-cyan-300/10 shadow-[0_0_20px_rgba(34,211,238,.18)]" : "border-white/10 bg-black/25"} disabled:grayscale`}
              >
                <div className="absolute right-2 top-2 z-[2] rounded-full border border-rose-300/25 bg-rose-950/80 px-2 py-1 text-[9px] text-rose-100">
                  <span className="block uppercase text-rose-400">{gameText(locale, "intent")}</span>
                  {intent?.name ?? "…"}
                </div>
                <div className="relative mx-auto mt-6 h-24 w-full max-w-[9rem]">
                  {definition?.image_url ? <Image src={definition.image_url} alt={definition.name} fill sizes="144px" loading="eager" className="object-contain drop-shadow-[0_0_20px_rgba(167,139,250,.4)]" /> : <span className="grid h-full place-items-center text-5xl">◉</span>}
                </div>
                <p className="truncate text-center text-xs font-semibold">{definition?.name ?? enemy.slug}</p>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/60"><div className="h-full bg-gradient-to-r from-rose-600 to-fuchsia-400" style={{ width: `${Math.max(0, enemy.health / enemy.max_health) * 100}%` }} /></div>
                <p className="mt-1 text-center font-mono text-[10px] text-rose-200">{enemy.health}/{enemy.max_health} {enemy.block > 0 ? `◇${enemy.block}` : ""}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="bg-[#0c1220] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        <div className="mb-2 flex items-center justify-between text-[10px] text-slate-500">
          <span>{gameText(locale, "draw")} {(combat.draw_pile ?? []).length} · {gameText(locale, "discard")} {(combat.discard_pile ?? []).length} · {gameText(locale, "exhaust")} {(combat.exhaust_pile ?? []).length}</span>
          <span>{gameText(locale, "deck")} {run.state.deck.length}</span>
        </div>
        {combat.route_completed && <div className="mb-2 rounded-lg border border-amber-300/25 bg-amber-300/10 px-2 py-1 text-center text-[10px] text-amber-200">{gameText(locale, "routeReady")}</div>}
        {hint && <div role="status" className="mb-2 text-center text-xs text-rose-300">{hint}</div>}
        <div className="scrollbar-thin flex min-h-[10.5rem] snap-x gap-2 overflow-x-auto pb-2">
          {(combat.hand ?? []).map((instance) => {
            const card = cards.get(instance.slug);
            if (!card) return null;
            const actualCost = card.type === "signal" && combat.player.discount_signal > 0 ? 0 : card.cost;
            return (
              <button
                key={instance.id}
                type="button"
                disabled={busy}
                onClick={() => play(instance.id, instance.slug)}
                className={`relative w-[7.4rem] shrink-0 snap-center rounded-xl border p-2 text-left shadow-lg transition active:-translate-y-1 disabled:opacity-50 ${cardStyle[card.type]}`}
              >
                <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-black/70 font-mono text-xs text-cyan-200">{actualCost}</span>
                <span className="text-2xl text-white/80">{cardGlyph[card.type]}</span>
                <strong className="mt-2 block pr-5 text-xs leading-4">{card.name}</strong>
                <p className="mt-1 text-[10px] leading-4 text-slate-200">{card.description}</p>
                <span className="absolute bottom-1.5 right-2 text-[8px] uppercase tracking-wider text-white/45">{card.type}</span>
              </button>
            );
          })}
        </div>
        <button type="button" disabled={busy} onClick={onEndTurn} className="w-full rounded-xl border border-white/15 bg-white/5 py-2.5 text-xs font-semibold text-slate-200 transition active:bg-white/10 disabled:opacity-40">
          {gameText(locale, "endTurn")} →
        </button>
      </section>
    </main>
  );
};

const Meter = ({ label, value, tone }: { readonly label: string; readonly value: string; readonly tone: "cyan" | "amber" | "violet" | "slate" }) => {
  const colors = { cyan: "text-cyan-300 border-cyan-300/20", amber: "text-amber-300 border-amber-300/20", violet: "text-violet-300 border-violet-300/20", slate: "text-slate-300 border-white/10" };
  return <div className={`rounded-lg border bg-white/[0.03] px-2 py-1.5 ${colors[tone]}`}><span className="block truncate text-[8px] uppercase tracking-wider opacity-65">{label}</span><strong className="font-mono text-sm">{value}</strong></div>;
};
