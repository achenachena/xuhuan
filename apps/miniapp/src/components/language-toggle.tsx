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
      type="button"
      aria-label={label}
      title={label}
      onClick={() => setLanguage(isEnglish ? "zh-CN" : "en")}
      className="fixed right-3 top-[var(--xuhuan-host-safe-top)] z-[60] min-w-12 border-2 border-cyan-200/30 bg-[#071225]/92 px-2.5 py-2 font-mono text-[10px] font-bold tracking-wider text-cyan-50 shadow-[3px_3px_0_rgba(2,6,23,.75)] backdrop-blur-sm transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
    >
      {isEnglish ? "ZH" : "EN"}
    </button>
  );
};

export default LanguageToggle;
