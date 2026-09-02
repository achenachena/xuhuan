"use client";

import Image from "next/image";

import useLocale from "@/components/providers/use-locale";
import { gameText } from "@/features/game/game-copy";

const githubURL = "https://github.com/achenachena/xuhuan";
const telegramURL =
  process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL ?? "https://t.me/xuhuangamebot";

const Metric = ({ value, label }: { readonly value: string; readonly label: string }) => (
  <div className="border border-cyan-200/20 bg-slate-950/55 px-4 py-4 backdrop-blur-sm">
    <strong className="block font-mono text-3xl text-cyan-200">{value}</strong>
    <span className="mt-1 block text-xs uppercase tracking-[0.18em] text-slate-400">{label}</span>
  </div>
);

export const PortfolioLanding = () => {
  const { language } = useLocale();
  const text = (key: Parameters<typeof gameText>[1]) => gameText(language, key);

  return (
    <main className="min-h-screen overflow-hidden bg-[#02050e] text-slate-100">
      <section className="relative isolate border-b border-cyan-200/10">
        <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_70%_20%,rgba(6,182,212,.2),transparent_30%),radial-gradient(circle_at_20%_65%,rgba(168,85,247,.16),transparent_32%)]" />
        <div className="mx-auto grid min-h-[min(760px,100dvh)] max-w-6xl items-center gap-10 px-5 py-24 md:grid-cols-[1.05fr_.95fr] md:px-10">
          <div>
            <p className="font-mono text-xs tracking-[0.22em] text-cyan-300">{text("portfolioEyebrow")}</p>
            <h1 className="mt-5 max-w-3xl text-4xl font-black leading-[1.05] tracking-tight text-white sm:text-6xl">
              {text("portfolioTitle")}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">{text("portfolioBody")}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <a className="bg-cyan-200 px-6 py-3 text-center font-bold text-slate-950 transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-200" href="/demo">
                {text("portfolioPlay")}
              </a>
              <a className="border border-fuchsia-300/60 bg-fuchsia-400/10 px-6 py-3 text-center font-bold text-fuchsia-100 transition hover:bg-fuchsia-300/20" href={telegramURL} rel="noreferrer" target="_blank">
                {text("portfolioTelegram")}
              </a>
              <a className="border border-slate-600 px-6 py-3 text-center font-bold text-slate-200 transition hover:border-slate-300" href={githubURL} rel="noreferrer" target="_blank">
                {text("portfolioGitHub")}
              </a>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[390px]">
            <div className="absolute -inset-8 bg-cyan-400/10 blur-3xl" />
            <div className="relative aspect-[9/16] overflow-hidden rounded-[2rem] border border-cyan-200/30 bg-slate-950 shadow-[0_30px_100px_rgba(8,145,178,.25)]">
              <Image alt="Seventh Dock pixel-art broadcast arena" className="object-cover" fill priority sizes="(max-width: 768px) 90vw, 390px" src="/game/v4/backgrounds/seventh-dock.webp" />
              <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-slate-950 via-slate-950/65 to-transparent" />
              <div className="absolute left-5 right-5 top-6 flex items-center justify-between font-mono text-[10px] tracking-[0.16em] text-cyan-100">
                <span>ON AIR ◆◆◆</span><span>HYPE 82%</span>
              </div>
              <Image alt="Nana player sprite" className="absolute bottom-[13%] left-1/2 h-auto w-[28%] -translate-x-1/2 [image-rendering:pixelated]" height={256} width={256} src="/game/v4/players/nana7mi.webp" />
              <Image alt="Optimal Nana boss sprite" className="absolute left-1/2 top-[20%] h-auto w-[34%] -translate-x-1/2 [image-rendering:pixelated]" height={256} width={256} src="/game/v4/bosses/optimal-nana.webp" />
              <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-[#02050e] to-transparent" />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20 md:px-10">
        <div className="grid gap-4 sm:grid-cols-3">
          <Metric value="8" label={text("portfolioMetricChapters")} />
          <Metric value="32" label={text("portfolioMetricRooms")} />
          <Metric value="2" label={text("portfolioMetricLocales")} />
        </div>

        <div className="mt-20 grid gap-10 lg:grid-cols-2">
          <div className="border-l-2 border-cyan-300 pl-6">
            <p className="font-mono text-xs tracking-[0.2em] text-cyan-300">{text("portfolioDemoEyebrow")}</p>
            <h2 className="mt-3 text-3xl font-black text-white">{text("portfolioDemoTitle")}</h2>
            <p className="mt-4 leading-7 text-slate-300">{text("portfolioDemoBody")}</p>
            <a className="mt-7 inline-block bg-cyan-200 px-6 py-3 font-bold text-slate-950 hover:bg-white" href="/demo">{text("portfolioPlay")} →</a>
          </div>
          <div className="border border-slate-700/70 bg-slate-900/45 p-6">
            <h2 className="text-2xl font-black text-white">{text("portfolioEngineering")}</h2>
            <p className="mt-4 leading-7 text-slate-300">{text("portfolioEngineeringBody")}</p>
            <ul className="mt-6 space-y-3 font-mono text-xs text-cyan-100">
              <li>{text("portfolioFrontend")}</li>
              <li>{text("portfolioBackend")}</li>
              <li>{text("portfolioData")}</li>
              <li>{text("portfolioQuality")}</li>
            </ul>
          </div>
        </div>

        <div className="mt-20 grid gap-6 md:grid-cols-2">
          <article className="bg-cyan-950/25 p-7">
            <h2 className="text-xl font-bold text-cyan-100">{text("portfolioTrustTitle")}</h2>
            <p className="mt-3 leading-7 text-slate-300">{text("portfolioTrustBody")}</p>
          </article>
          <article className="bg-fuchsia-950/20 p-7">
            <h2 className="text-xl font-bold text-fuchsia-100">{text("portfolioStoryTitle")}</h2>
            <p className="mt-3 leading-7 text-slate-300">{text("portfolioStoryBody")}</p>
          </article>
        </div>
      </section>

      <footer className="border-t border-slate-800 px-5 py-10 text-center text-sm text-slate-400">
        <p>{text("portfolioBuiltBy")}</p>
        <p className="mx-auto mt-3 max-w-3xl text-xs leading-5">{text("portfolioFanNotice")}</p>
      </footer>
    </main>
  );
};
