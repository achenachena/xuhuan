"use client";

import useLocale from "@/components/providers/use-locale";
import { gameText } from "@/features/game/game-copy";

const LanguageToggle = () => {
  const { language, setLanguage } = useLocale();
  const isEnglish = language === "en";
  const label = gameText(
    language,
    isEnglish ? "switchToChinese" : "switchToEnglish",
  );

  return (
    <button
      data-language-toggle="true"
      type="button"
      aria-label={label}
      title={label}
      onClick={() => setLanguage(isEnglish ? "zh-CN" : "en")}
      className="fixed right-[var(--xuhuan-host-safe-right)] top-[calc(var(--xuhuan-host-safe-top)+.25rem)] z-[60] grid h-8 min-w-8 place-items-center border border-cyan-200/35 bg-[#071225]/82 px-1.5 font-mono text-[8px] font-bold tracking-wider text-cyan-50 shadow-[2px_2px_0_rgba(2,6,23,.65)] backdrop-blur-sm transition active:translate-x-px active:translate-y-px active:shadow-none"
    >
      {isEnglish ? "ZH" : "EN"}
    </button>
  );
};

export default LanguageToggle;
