"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import useLocale from "@/components/providers/use-locale";
import { gameText } from "@/features/game/game-copy";
import type {
  PortfolioDemoManifest,
  PortfolioDemoStage,
} from "@/features/portfolio/demo-types";
import { ShowChoicePreview } from "@/features/portfolio/show-choice-preview";
import { ShooterArena } from "@/features/shooter/shooter-arena";
import type { ShooterGameRun } from "@/lib/api/types";
import type { ShooterResult } from "@/features/shooter/types";
import { saveBattleCard } from "@/features/portfolio/battle-card";

type DemoPhase = "wave" | "choice" | "boss" | "result";

const telegramURL =
  process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL ?? "https://t.me/xuhuangamebot";
const fixedTime = "2026-09-01T00:00:00Z";

const demoRun = (
  stage: PortfolioDemoStage,
): ShooterGameRun => ({
  id: "00000000-0000-4000-8000-000000000004",
  content_version: "v4",
  mode: "campaign",
  state: {
    phase: "segment",
    chapter_slug: "seventh-dock",
    character_slug: "nana7mi",
    companion_slugs: [],
    encore_level: 0,
    hearts: stage.runtime_config.player_health,
    max_hearts: 3,
    segment_index: stage.segment_index,
    segment: stage,
    pending_show_options: [],
    show_effects: [],
    selected_choice_ids: [],
    score: 0,
  },
  status: "active",
  outcome: null,
  version: 1,
  created_at: fixedTime,
  updated_at: fixedTime,
  completed_at: null,
});

const isManifest = (value: unknown): value is PortfolioDemoManifest => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PortfolioDemoManifest>;
  return (
    candidate.version === "demo-v3" &&
    (candidate.locale === "en" || candidate.locale === "zh-CN") &&
    candidate.content?.version === "v4" &&
    candidate.content.protocol === "shooter-v1" &&
    candidate.wave?.runtime_config?.duration_ticks === 1_200 &&
    candidate.options?.length === 2 &&
    candidate.options.every((option) => option.boss?.runtime_config?.duration_ticks === 1_350)
  );
};

export const BrowserDemo = () => {
  const { language } = useLocale();
  // The first loaded configuration owns this session. Translating labels must
  // not recreate the simulator, refill health, or discard a finished segment.
  const [manifest, setManifest] = useState<PortfolioDemoManifest | null>(null);
  const [localizedManifest, setLocalizedManifest] = useState<PortfolioDemoManifest | null>(null);
  const [errorLocale, setErrorLocale] = useState<string | null>(null);
  const [phase, setPhase] = useState<DemoPhase>("wave");
  const [choiceID, setChoiceID] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [waveHealth, setWaveHealth] = useState(3);
  const [musicProgress, setMusicProgress] = useState(0);
  const [result, setResult] = useState<ShooterResult | null>(null);
  const [reversals, setReversals] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const text = useCallback(
    (key: Parameters<typeof gameText>[1]) => gameText(language, key),
    [language],
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/game/v4/demo/demo-v3.${language}.json`, {
      signal: controller.signal,
      cache: "force-cache",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Demo manifest is unavailable");
        const value: unknown = await response.json();
        if (!isManifest(value)) throw new Error("Demo manifest is invalid");
        setManifest((current) => current ?? value);
        setLocalizedManifest(value);
        setErrorLocale(null);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setErrorLocale(language);
        }
      });
    return () => controller.abort();
  }, [language]);

  const reset = () => {
    setPhase("wave");
    setChoiceID(null);
    setAttempt((current) => current + 1);
    setWaveHealth(3);
    setMusicProgress(0);
    setResult(null);
    setReversals(0);
    setSaveError(false);
  };
  const waveRun = useMemo(
    () => (manifest ? demoRun(manifest.wave) : null),
    [manifest],
  );
  const bossRun = useMemo(
    () => {
      const choice = manifest?.options.find((option) => option.id === choiceID);
      return choice ? demoRun({
        ...choice.boss,
        runtime_config: { ...choice.boss.runtime_config, player_health: waveHealth },
      }) : null;
    },
    [manifest, choiceID, waveHealth],
  );

  const loadError = errorLocale === language;
  if (!manifest) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#02050e] p-6 text-center text-white">
        <div>
          <p>{loadError ? text("demoLoadError") : text("connecting")}</p>
          {loadError ? <button className="mt-5 bg-cyan-200 px-5 py-3 font-bold text-slate-950" onClick={() => window.location.reload()}>{text("retry")}</button> : null}
        </div>
      </main>
    );
  }
  const displayedManifest = localizedManifest?.locale === language ? localizedManifest : manifest;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(6,182,212,.15),transparent_35%),#02050e] sm:grid sm:place-items-center sm:p-6">
      <div className="relative mx-auto h-[100dvh] w-full max-w-[420px] overflow-hidden bg-[#02050e] shadow-[0_30px_100px_rgba(0,0,0,.65)] sm:h-[min(760px,calc(100dvh-3rem))] sm:rounded-[2rem] sm:border sm:border-cyan-200/25">
        {(phase === "wave" || phase === "choice") && waveRun ? (
          <div inert={phase === "choice"}>
          <ShooterArena
            key={`wave:${attempt}`}
            embedded
            opening={displayedManifest.opening}
            content={manifest.content}
            run={waveRun}
            busy={false}
            onComplete={async (localResult) => {
              setWaveHealth(localResult.health);
              setMusicProgress(localResult.final.reversal?.breaks ?? 0);
              setReversals(localResult.final.reversal?.breaks ?? 0);
              setResult(localResult);
              setPhase(localResult.won ? "choice" : "result");
              return true;
            }}
          />
          </div>
        ) : null}

        {phase === "choice" ? (
          <section aria-labelledby="demo-choice-title" className="absolute inset-0 z-40 flex flex-col justify-center bg-[#02050e]/30 p-4 text-white">
            <h1 id="demo-choice-title" className="mx-auto mb-3 bg-[#07111f]/95 px-4 py-2 text-center text-lg font-black">{text("demoChoose")}</h1>
            <div className="grid grid-cols-2 gap-3">
            {displayedManifest.options.map((option, index) => (
              <button
                type="button"
                key={option.id}
                data-testid={`demo-option-${option.id}`}
                className={`overflow-hidden border-2 bg-[#0b1927] p-2 text-center transition hover:-translate-y-1 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[.98] ${index === 0 ? "border-cyan-200/80" : "border-amber-200/80"}`}
                onClick={() => {
                  setChoiceID(option.id);
                  setPhase("boss");
                }}
              >
                <ShowChoicePreview weapon={option.boss.runtime_config.reversal?.weapon === "pierce" ? "pierce" : "twin"} />
                <strong className="grid min-h-12 place-items-center text-sm leading-5 text-white">{option.name}</strong>
                <span className="block min-h-12 text-xs leading-5 text-slate-300">{text(option.boss.runtime_config.reversal?.weapon === "pierce" ? "demoPierceDescription" : "demoTwinDescription")}</span>
              </button>
            ))}
            </div>
          </section>
        ) : null}

        {phase === "boss" && bossRun ? (
          <ShooterArena
            key={`boss:${choiceID}:${attempt}`}
            embedded
            musicProgress={musicProgress}
            content={manifest.content}
            run={bossRun}
            busy={false}
            onComplete={async (localResult) => {
              setResult(localResult);
              setReversals(musicProgress + (localResult.final.reversal?.breaks ?? 0));
              setPhase("result");
              return true;
            }}
          />
        ) : null}

        {phase === "result" && result ? (
          <section data-testid="demo-end-actions" className="absolute inset-0 overflow-y-auto bg-[linear-gradient(rgba(2,5,14,.85),rgba(2,5,14,.97)),url('/game/v4/reversal/stage.webp')] bg-cover bg-center px-5 pb-8 pt-16 text-center text-white">
            <p className="mb-2 font-mono text-xs tracking-widest text-cyan-200">XUHUAN / ONLY ONE ONLINE</p>
            <h1 className="text-2xl font-black leading-tight">{text(result.won ? "demoWon" : "demoLost")}</h1>
            <dl className="my-5 grid grid-cols-2 gap-3 border-y border-white/20 py-4">
              <div><dt className="text-xs text-slate-300">{text("demoReversals")}</dt><dd data-testid="demo-reversals" className="text-3xl font-black text-cyan-200">{reversals}</dd></div>
              <div><dt className="text-xs text-slate-300">{text("demoHearts")}</dt><dd data-testid="demo-hearts" className="text-3xl font-black text-pink-200">{result.health} / 3</dd></div>
            </dl>
            {choiceID ? <p className="mb-3 text-sm text-slate-300">{text("demoTryOther")}</p> : null}
            <div className="grid gap-3">
            <button disabled={saving} className="bg-cyan-200 px-5 py-3 font-bold text-slate-950 disabled:opacity-50" onClick={reset}>{text("demoRestart")}</button>
            <button disabled={saving} className="border border-cyan-200/40 px-4 py-2 text-sm disabled:opacity-50" onClick={async () => {
              setSaving(true); setSaveError(false);
              try { await saveBattleCard({ won: result.won, health: result.health, reversals }, language); }
              catch { setSaveError(true); }
              finally { setSaving(false); }
            }}>{text("demoDownload")}</button>
            {saveError ? <p role="alert" className="text-sm text-rose-200">{text("demoDownloadFailed")}</p> : null}
            <Link className="py-2 font-semibold text-cyan-200 underline underline-offset-4" href="/engineering">{text("demoEngineering")}</Link>
            <div className="flex justify-center gap-6 text-sm underline underline-offset-4">
              <a href="https://github.com/achenachena/xuhuan/issues/new?title=Demo%20feedback&body=Where%20were%20you%20confused%3F%0A%0AWhat%20moment%20do%20you%20remember%3F%0A%0AWould%20you%20play%20again%3F%0A%0ADevice%20and%20browser%20(optional)%3A" rel="noreferrer" target="_blank">{text("demoFeedback")}</a>
              <a href="https://github.com/achenachena/xuhuan" rel="noreferrer" target="_blank">GitHub</a>
            </div>
            <a className="mt-2 py-2 text-sm text-fuchsia-200 underline underline-offset-4" href={telegramURL} rel="noreferrer" target="_blank">{text("demoTelegram")}</a>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
};
