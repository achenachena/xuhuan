"use client";

import Link from "next/link";

import LanguageToggle from "@/components/language-toggle";
import useLocale from "@/components/providers/use-locale";
import { gameText } from "@/features/game/game-copy";

const DailyResultNotFound = () => {
  const { language } = useLocale();
  return (
    <main className="grid min-h-screen place-items-center bg-[#050914] p-6 pt-[var(--xuhuan-host-safe-top)] text-center text-slate-50">
      <LanguageToggle />
      <div>
        <p className="font-mono text-sm tracking-[.2em] text-rose-300">
          {gameText(language, "dailyShareExpired")}
        </p>
        <h1 className="mt-3 text-3xl font-black">
          {gameText(language, "dailyShareExpiredBody")}
        </h1>
        <Link
          href="/"
          className="mt-6 inline-block border-2 border-cyan-300/35 bg-cyan-300/10 px-5 py-3 text-cyan-50"
        >
          {gameText(language, "dailyShareReturn")}
        </Link>
      </div>
    </main>
  );
};

export default DailyResultNotFound;
