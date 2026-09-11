"use client";

import useLocale from "@/components/providers/use-locale";
import { gameText } from "@/features/game/game-copy";
import { GameView } from "@/features/game/game-shell";
import { LocalSaveError, resetLocalSave } from "./local-game";
import { useLocalGame } from "./use-local-game";

export const BrowserCampaign = () => {
  const { language } = useLocale();
  const controller = useLocalGame(language);
  const storageError = controller.error instanceof LocalSaveError;
  const invalid = controller.error instanceof LocalSaveError && controller.error.message === "localSaveInvalid";
  return <>
    {(!storageError || controller.game) && <GameView locale={language} controller={controller} localSave />}
    {storageError && <aside role="alert" className={`${controller.game ? "fixed bottom-4 left-4 right-4 z-50" : "mx-auto mt-24 max-w-md"} border border-rose-200/40 bg-slate-950 p-5 text-sm text-white`}>
      <p>{gameText(language, invalid ? "localSaveInvalid" : "localSaveUnavailable")}</p>
      <button className="mt-4 border border-cyan-200 px-4 py-2" onClick={() => void controller.load()}>{gameText(language, "retry")}</button>
      {invalid && <button className="ml-3 mt-4 border border-rose-200 px-4 py-2" onClick={async () => {
        if (window.confirm(gameText(language, "localSaveResetConfirm"))) {
          try { await resetLocalSave(); } catch { await controller.load(); return; }
          await controller.load();
        }
      }}>{gameText(language, "localSaveReset")}</button>}
    </aside>}
  </>;
};
