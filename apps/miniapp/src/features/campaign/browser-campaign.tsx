"use client";

import useLocale from "@/components/providers/use-locale";
import { GameView } from "@/features/game/game-shell";
import { useLocalGame } from "./use-local-game";

export const BrowserCampaign = () => {
  const { language } = useLocale();
  const controller = useLocalGame(language);
  return <GameView locale={language} controller={controller} browserSession />;
};
