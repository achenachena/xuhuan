"use client";

import { useState } from "react";

import { gameText, type GameLocale } from "@/features/game/game-copy";
import type { APIGameContent, APIGameRun } from "@/lib/api/client";

type CommonProps = {
  readonly content: APIGameContent;
  readonly run: APIGameRun;
  readonly locale: GameLocale;
  readonly busy: boolean;
};

const archetypeStyle: Record<string, string> = {
  route: "border-cyan-300/30 bg-cyan-400/10 text-cyan-50",
  distortion: "border-fuchsia-300/30 bg-fuchsia-400/10 text-fuchsia-50",
  echo: "border-sky-300/30 bg-sky-400/10 text-sky-50",
  glitch: "border-violet-300/30 bg-violet-400/10 text-violet-50",
};

export const RewardScreen = ({
  content,
  run,
  locale,
  busy,
  onChoose,
}: CommonProps & { readonly onChoose: (slug: string) => void }) => {
  const reward = run.state.reward;
  if (!reward) return null;
  const plugin = content.plugins.find(
    (item) => item.slug === reward.granted_plugin,
  );
  return (
    <Panel
      title={gameText(locale, "reward")}
      subtitle={gameText(locale, "rewardHint")}
      eyebrow={
        plugin
          ? `${gameText(locale, "pluginFound")}: ${plugin.name}`
          : undefined
      }
    >
      <div className="space-y-3">
        {reward.module_choices.map((slug) => {
          const moduleDefinition = content.modules.find(
            (item) => item.slug === slug,
          );
          if (!moduleDefinition) return null;
          const owned = run.state.modules.find((item) => item.slug === slug);
          return (
            <button
              key={slug}
              type="button"
              disabled={busy}
              onClick={() => onChoose(slug)}
              className={`w-full rounded-2xl border p-4 text-left transition active:scale-[.98] disabled:opacity-50 ${archetypeStyle[moduleDefinition.archetype]}`}
            >
              <span className="float-right rounded-full border border-current/20 px-2 py-1 font-mono text-[9px] uppercase">
                {moduleDefinition.archetype}{" "}
                {owned ? `Lv.${owned.level}→${owned.level + 1}` : "NEW"}
              </span>
              <strong className="block pr-24 text-base">
                {moduleDefinition.name}
              </strong>
              <p className="mt-2 text-xs leading-5 text-slate-300">
                {moduleDefinition.description}
              </p>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => onChoose("")}
        className="mt-4 w-full rounded-xl border border-white/10 py-3 text-xs text-slate-500"
      >
        {gameText(locale, "skip")}
      </button>
    </Panel>
  );
};

export const EventScreen = ({
  content,
  run,
  locale,
  busy,
  onChoose,
}: CommonProps & { readonly onChoose: (slug: string) => void }) => {
  const event = content.events.find(
    (item) => item.slug === run.state.current_event_slug,
  );
  if (!event) return null;
  return (
    <Panel
      title={event.title}
      subtitle={event.body}
      eyebrow={gameText(locale, "event")}
    >
      <div className="space-y-3">
        {event.options.map((option) => (
          <button
            key={option.slug}
            type="button"
            disabled={busy}
            onClick={() => onChoose(option.slug)}
            className="w-full rounded-2xl border border-violet-400/25 bg-violet-400/[.08] p-4 text-left active:scale-[.98] disabled:opacity-50"
          >
            <strong className="text-violet-100">{option.label}</strong>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              {option.result}
            </p>
          </button>
        ))}
      </div>
    </Panel>
  );
};

export const RestScreen = ({
  content,
  run,
  locale,
  busy,
  onRest,
}: CommonProps & {
  readonly onRest: (operation: "repair" | "tune", moduleSlug?: string) => void;
}) => {
  const [tuning, setTuning] = useState(false);
  return (
    <Panel
      title={gameText(locale, "rest")}
      subtitle={tuning ? gameText(locale, "tuneHint") : undefined}
    >
      {tuning ? (
        <>
          <div className="max-h-[58dvh] space-y-2 overflow-y-auto">
            {run.state.modules.map((owned) => {
              const moduleDefinition = content.modules.find(
                (item) => item.slug === owned.slug,
              );
              return (
                <button
                  key={owned.slug}
                  type="button"
                  disabled={busy || owned.level >= 3}
                  onClick={() => onRest("tune", owned.slug)}
                  className="flex w-full items-center justify-between rounded-xl border border-cyan-300/20 bg-cyan-400/[.06] px-4 py-3 text-left disabled:opacity-30"
                >
                  <span>
                    <strong className="block text-sm">
                      {moduleDefinition?.name ?? owned.slug}
                    </strong>
                    <small className="text-slate-500">
                      Lv.{owned.level} → {Math.min(3, owned.level + 1)}
                    </small>
                  </span>
                  <span className="text-cyan-300">＋</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setTuning(false)}
            className="mt-3 w-full rounded-xl border border-white/10 py-3 text-sm text-slate-400"
          >
            {gameText(locale, "back")}
          </button>
        </>
      ) : (
        <div className="grid gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => onRest("repair")}
            className="rounded-2xl border border-emerald-400/25 bg-emerald-400/[.08] p-5 text-left text-emerald-100 disabled:opacity-50"
          >
            <span className="mr-3 text-2xl">＋</span>
            <strong>{gameText(locale, "repair")}</strong>
          </button>
          <button
            type="button"
            disabled={
              busy ||
              run.state.modules.length === 0 ||
              run.state.modules.every((item) => item.level >= 3)
            }
            onClick={() => setTuning(true)}
            className="rounded-2xl border border-cyan-400/25 bg-cyan-400/[.08] p-5 text-left text-cyan-100 disabled:opacity-30"
          >
            <span className="mr-3 text-2xl">⌁</span>
            <strong>{gameText(locale, "tune")}</strong>
          </button>
        </div>
      )}
    </Panel>
  );
};

export const RunResultScreen = ({
  run,
  locale,
  busy,
  onContinue,
}: {
  readonly run: APIGameRun;
  readonly locale: GameLocale;
  readonly busy: boolean;
  readonly onContinue: () => void;
}) => {
  const key =
    run.outcome === "cleared"
      ? "victory"
      : run.outcome === "abandoned"
        ? "abandoned"
        : "defeat";
  const glyph =
    run.outcome === "cleared" ? "⌁" : run.outcome === "abandoned" ? "×" : "…";
  return (
    <Panel
      title={gameText(locale, key)}
      subtitle={
        run.outcome === "cleared"
          ? gameText(locale, "noiseUnlocked")
          : undefined
      }
    >
      <div className="my-8 text-center text-7xl text-cyan-300 drop-shadow-[0_0_25px_rgba(34,211,238,.5)]">
        {glyph}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={onContinue}
        className="w-full rounded-2xl bg-gradient-to-r from-cyan-300 to-violet-400 px-5 py-4 font-bold text-slate-950 disabled:opacity-50"
      >
        {gameText(locale, "continue")}
      </button>
    </Panel>
  );
};

const Panel = ({
  title,
  subtitle,
  eyebrow,
  children,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly eyebrow?: string;
  readonly children: React.ReactNode;
}) => (
  <main className="mx-auto min-h-[100dvh] w-full max-w-lg bg-[radial-gradient(circle_at_top,rgba(76,29,149,.25),transparent_44%),#080d18] px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))] text-white">
    {eyebrow && (
      <p className="font-mono text-[10px] uppercase tracking-[.2em] text-violet-300">
        {eyebrow}
      </p>
    )}
    <h1 className="mt-2 text-2xl font-bold leading-tight">{title}</h1>
    {subtitle ? (
      <p className="mb-6 mt-2 text-sm leading-6 text-slate-400">{subtitle}</p>
    ) : (
      <div className="h-6" />
    )}
    {children}
  </main>
);
