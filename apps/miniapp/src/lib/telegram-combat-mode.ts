import { lockTelegramVerticalSwipes } from "@/lib/telegram-gesture-lock";

type OrientationController = {
  readonly platform: string;
  readonly isVersionAtLeast: (version: string) => boolean;
  readonly lockOrientation?: () => void;
  readonly unlockOrientation?: () => void;
};

const loadController = async (): Promise<OrientationController> => {
  const { default: webApp } = await import("@twa-dev/sdk");
  return webApp;
};

export const enterTelegramCombatMode = (
  load: () => Promise<OrientationController> = loadController,
): (() => void) => {
  const root = document.documentElement;
  root.dataset.shooterEncounter = "true";
  const restoreSwipes = lockTelegramVerticalSwipes();
  let disposed = false;
  let orientation: OrientationController | null = null;

  void load()
    .then((webApp) => {
      if (
        disposed ||
        webApp.platform === "unknown" ||
        !webApp.isVersionAtLeast("8.0") ||
        typeof webApp.lockOrientation !== "function"
      ) {
        return;
      }
      webApp.lockOrientation();
      orientation = webApp;
    })
    .catch(() => undefined);

  return () => {
    disposed = true;
    restoreSwipes();
    orientation?.unlockOrientation?.();
    orientation = null;
    delete root.dataset.shooterEncounter;
  };
};
