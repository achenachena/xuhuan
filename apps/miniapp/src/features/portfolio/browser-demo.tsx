"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import useLocale from "@/components/providers/use-locale";
import { gameText } from "@/features/game/game-copy";
import type {
  PortfolioDemoManifest,
  PortfolioDemoStage,
} from "@/features/portfolio/demo-types";
import { ShowChoicePreview } from "@/features/portfolio/show-choice-preview";
import { ShooterArena } from "@/features/shooter/shooter-arena";
import type { ShooterGameRun } from "@/lib/api/types";

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
    candidate.version === "demo-v2" &&
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
  const text = useCallback(
    (key: Parameters<typeof gameText>[1]) => gameText(language, key),
    [language],
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/game/v4/demo/demo-v2.${language}.json`, {
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
            onComplete={async () => {
              setPhase("result");
              return true;
            }}
          />
        ) : null}

        {phase === "result" ? (
          <section data-testid="demo-end-actions" className="absolute inset-0 grid content-center bg-[linear-gradient(rgba(2,5,14,.75),rgba(2,5,14,.96)),url('/game/v4/reversal/stage.webp')] bg-cover bg-center p-6 text-center text-white">
            <button className="bg-cyan-200 px-5 py-3 font-bold text-slate-950" onClick={reset}>{text("demoRestart")}</button>
            <a className="mt-3 border border-fuchsia-300/50 bg-fuchsia-400/10 px-5 py-3 font-bold text-fuchsia-100" href={telegramURL} rel="noreferrer" target="_blank">{text("demoTelegram")}</a>
            <a className="mt-5 text-sm text-slate-300 underline underline-offset-4" href="https://github.com/achenachena/xuhuan" rel="noreferrer" target="_blank">GitHub</a>
          </section>
        ) : null}
      </div>
    </main>
  );
};
