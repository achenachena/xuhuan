type SwipeController = {
  readonly platform: string;
  readonly isVersionAtLeast: (version: string) => boolean;
  readonly disableVerticalSwipes?: () => void;
  readonly enableVerticalSwipes?: () => void;
};

type LoadSwipeController = () => Promise<SwipeController>;

const loadTelegramSwipeController: LoadSwipeController = async () => {
  const { default: webApp } = await import("@twa-dev/sdk");
  return webApp;
};

export const lockTelegramVerticalSwipes = (
  load: LoadSwipeController = loadTelegramSwipeController,
): (() => void) => {
  let disposed = false;
  let lockedController: SwipeController | null = null;

  void load()
    .then((webApp) => {
      if (
        disposed ||
        webApp.platform === "unknown" ||
        !webApp.isVersionAtLeast("7.7") ||
        typeof webApp.disableVerticalSwipes !== "function"
      ) {
        return;
      }
      webApp.disableVerticalSwipes();
      lockedController = webApp;
    })
    .catch(() => undefined);

  return () => {
    disposed = true;
    lockedController?.enableVerticalSwipes?.();
    lockedController = null;
  };
};
