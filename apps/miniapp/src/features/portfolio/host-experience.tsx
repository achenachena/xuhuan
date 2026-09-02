"use client";

import useTelegramHost from "@/components/providers/use-telegram-host";
import GameShell from "@/features/game/game-shell";
import { PortfolioLanding } from "@/features/portfolio/portfolio-landing";

export const HostExperience = () => {
  const host = useTelegramHost();
  return host === "telegram" ? <GameShell /> : <PortfolioLanding />;
};
