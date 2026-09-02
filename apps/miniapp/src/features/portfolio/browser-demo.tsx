"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import useLocale from "@/components/providers/use-locale";
import { gameText } from "@/features/game/game-copy";
import type {
  PortfolioDemoManifest,
  PortfolioDemoOption,
  PortfolioDemoStage,
} from "@/features/portfolio/demo-types";
import { ShooterArena } from "@/features/shooter/shooter-arena";
import type { ShooterResult } from "@/features/shooter/types";
import type { ShooterGameRun } from "@/lib/api/types";

type DemoPhase = "intro" | "wave" | "choice" | "boss" | "result";

const telegramURL =
  process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL ?? "https://t.me/xuhuangamebot";
const fixedTime = "2026-09-01T00:00:00Z";

const demoRun = (
  stage: PortfolioDemoStage,
  phase: "segment" | "show_choice",
  optionIDs: readonly string[] = [],
): ShooterGameRun => ({
  id: "00000000-0000-4000-8000-000000000004",
  content_version: "v4",
  mode: "campaign",
  state: {
    phase,
    chapter_slug: "seventh-dock",
    character_slug: "nana7mi",
    companion_slugs: [],
    encore_level: 0,
    hearts: 3,
    max_hearts: 3,
    segment_index: stage.segment_index,
    ...(phase === "segment" ? { segment: stage } : {}),
    pending_show_options: [...optionIDs],
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
    candidate.version === "demo-v1" &&
    (candidate.locale === "en" || candidate.locale === "zh-CN") &&
    candidate.content?.version === "v4" &&
    candidate.content.protocol === "shooter-v1" &&
    candidate.wave?.runtime_config?.duration_ticks === 900 &&
    candidate.options?.length === 2
  );
};

export const BrowserDemo = () => {
  const { language } = useLocale();
  const [manifest, setManifest] = useState<PortfolioDemoManifest | null>(null);
  const [errorLocale, setErrorLocale] = useState<string | null>(null);
  const [phase, setPhase] = useState<DemoPhase>("intro");
  const [choice, setChoice] = useState<PortfolioDemoOption | null>(null);
  const [waveScore, setWaveScore] = useState(0);
  const [result, setResult] = useState<ShooterResult | null>(null);
  const text = useCallback(
    (key: Parameters<typeof gameText>[1]) => gameText(language, key),
    [language],
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/game/v4/demo/demo-v1.${language}.json`, {
      signal: controller.signal,
      cache: "force-cache",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Demo manifest is unavailable");
        const value: unknown = await response.json();
        if (!isManifest(value)) throw new Error("Demo manifest is invalid");
        setManifest(value);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setErrorLocale(language);
        }
      });
    return () => controller.abort();
  }, [language]);

  const reset = () => {
    setPhase("intro");
    setChoice(null);
    setWaveScore(0);
    setResult(null);
  };
  const waveRun = useMemo(
    () => (manifest ? demoRun(manifest.wave, "segment") : null),
    [manifest],
  );
  const bossRun = useMemo(
    () => (choice ? demoRun(choice.boss, "segment") : null),
    [choice],
  );

  const loadError = errorLocale === language;
  if (!manifest || manifest.locale !== language || loadError) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#02050e] p-6 text-center text-white">
        <div>
          <p>{loadError ? text("networkError") : text("connecting")}</p>
          {loadError ? <button className="mt-5 bg-cyan-200 px-5 py-3 font-bold text-slate-950" onClick={() => window.location.reload()}>{text("retry")}</button> : null}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(6,182,212,.15),transparent_35%),#02050e] sm:grid sm:place-items-center sm:p-6">
      <div className="relative mx-auto h-[100dvh] w-full max-w-[420px] overflow-hidden bg-[#02050e] shadow-[0_30px_100px_rgba(0,0,0,.65)] sm:h-[min(760px,calc(100dvh-3rem))] sm:rounded-[2rem] sm:border sm:border-cyan-200/25">
        {phase === "intro" ? (
          <section className="absolute inset-0 grid content-end overflow-hidden p-6 pb-10 text-white">
            <Image alt="Seventh Dock browser demo" className="object-cover opacity-70" fill priority sizes="420px" src="/game/v4/backgrounds/seventh-dock.webp" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#02050e] via-[#02050e]/65 to-transparent" />
            <div className="relative z-10">
              <p className="font-mono text-xs tracking-[.2em] text-cyan-300">{text("portfolioDemoEyebrow")}</p>
              <h1 className="mt-3 text-4xl font-black">{text("demoTitle")}</h1>
              <p className="mt-4 leading-7 text-slate-200">{text("demoIntro")}</p>
              <button data-testid="start-browser-demo" className="mt-7 w-full bg-cyan-200 px-5 py-4 font-black text-slate-950 active:translate-y-px" onClick={() => setPhase("wave")}>{text("demoStart")}</button>
              <p className="mt-4 text-center text-[11px] leading-5 text-slate-400">{text("demoLocalNotice")}</p>
              <Link className="mt-4 block text-center text-sm text-cyan-200 underline underline-offset-4" href="/">{text("demoBack")}</Link>
            </div>
          </section>
        ) : null}

        {phase === "wave" && waveRun ? (
          <ShooterArena
            key={`wave:${language}`}
            embedded
            content={manifest.content}
            run={waveRun}
            busy={false}
            onComplete={async (_trace, localResult) => {
              setWaveScore(localResult.score);
              setResult(localResult);
              setPhase(localResult.won ? "choice" : "result");
              return true;
            }}
          />
        ) : null}

        {phase === "choice" ? (
          <section className="absolute inset-0 grid content-center gap-4 bg-[#02050e] p-5 text-white">
            <div className="text-center">
              <p className="font-mono text-[10px] tracking-[.2em] text-cyan-300">SHOW EFFECT</p>
              <h1 className="mt-2 text-2xl font-black">{text("demoChoose")}</h1>
              <p className="mt-2 text-sm text-slate-400">{text("demoChooseHint")}</p>
            </div>
            {manifest.options.map((option, index) => (
              <button
                key={option.id}
                data-testid={`demo-option-${option.id}`}
                className={`border p-5 text-left transition active:scale-[.99] ${index === 0 ? "border-cyan-300/50 bg-cyan-950/40" : "border-fuchsia-300/50 bg-fuchsia-950/35"}`}
                onClick={() => {
                  setChoice(option);
                  setPhase("boss");
                }}
              >
                <strong className="block text-xl text-white">{option.name}</strong>
                <span className="mt-2 block text-sm leading-6 text-slate-300">{option.description}</span>
              </button>
            ))}
          </section>
        ) : null}

        {phase === "boss" && bossRun ? (
          <ShooterArena
            key={`boss:${choice?.id}:${language}`}
            embedded
            content={manifest.content}
            run={bossRun}
            busy={false}
            onComplete={async (_trace, localResult) => {
              setResult({ ...localResult, score: waveScore + localResult.score });
              setPhase("result");
              return true;
            }}
          />
        ) : null}

        {phase === "result" && result ? (
          <section className="absolute inset-0 grid content-center bg-[radial-gradient(circle_at_center,rgba(34,211,238,.16),transparent_40%),#02050e] p-6 text-center text-white">
            <p className="font-mono text-xs tracking-[.2em] text-cyan-300">DEMO COMPLETE</p>
            <h1 className="mt-4 text-3xl font-black">{result.won ? text("demoCleared") : text("demoFailed")}</h1>
            <p className="mt-6 text-sm uppercase tracking-wider text-slate-400">{text("demoScore")}</p>
            <p className="mt-1 font-mono text-5xl font-black text-amber-200">{result.score}</p>
            <button className="mt-8 bg-cyan-200 px-5 py-3 font-bold text-slate-950" onClick={reset}>{text("demoRetry")}</button>
            <a className="mt-3 border border-fuchsia-300/50 bg-fuchsia-400/10 px-5 py-3 font-bold text-fuchsia-100" href={telegramURL} rel="noreferrer" target="_blank">{text("demoFullGame")}</a>
            <Link className="mt-5 text-sm text-slate-400 underline underline-offset-4" href="/">{text("demoBack")}</Link>
          </section>
        ) : null}
      </div>
    </main>
  );
};
