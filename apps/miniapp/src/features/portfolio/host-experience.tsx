"use client";

import useTelegramHost from "@/components/providers/use-telegram-host";
import GameShell from "@/features/game/game-shell";
import { BrowserDemo } from "@/features/portfolio/browser-demo";

export const HostExperience = () => {
  const host = useTelegramHost();
  if (host === "detecting") {
    return <main aria-busy="true" className="min-h-screen bg-[#02050e]" />;
  }
  return host === "telegram" ? <GameShell /> : <BrowserDemo />;
};
