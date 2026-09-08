"use client";

import dynamic from "next/dynamic";

import useTelegramHost from "@/components/providers/use-telegram-host";
import { BrowserDemo } from "@/features/portfolio/browser-demo";

const GameShell = dynamic(() => import("@/features/game/game-shell"), {
  loading: () => <main aria-busy="true" className="min-h-screen bg-[#02050e]" />,
});

export const HostExperience = () => {
  const host = useTelegramHost();
  if (host === "detecting") {
    return <main aria-busy="true" className="min-h-screen bg-[#02050e]" />;
  }
  return host === "telegram" ? <GameShell /> : <BrowserDemo />;
};
