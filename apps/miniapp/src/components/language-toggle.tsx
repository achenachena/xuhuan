"use client";

import useLocale from "@/components/providers/use-locale";

const LanguageToggle = () => {
  const { language, setLanguage } = useLocale();
  const isEnglish = language === "en";
  const label = isEnglish ? "Switch language to Chinese" : "切换语言为英文";

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => setLanguage(isEnglish ? "zh-CN" : "en")}
      className="fixed right-3 top-[max(.55rem,env(safe-area-inset-top))] z-[60] min-w-12 border-2 border-cyan-200/30 bg-[#071225]/92 px-2.5 py-2 font-mono text-[10px] font-bold tracking-wider text-cyan-50 shadow-[3px_3px_0_rgba(2,6,23,.75)] backdrop-blur-sm transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
    >
      {isEnglish ? "中文" : "EN"}
    </button>
  );
};

export default LanguageToggle;
