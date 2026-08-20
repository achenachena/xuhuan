"use client";

import { useEffect } from "react";

import { applyTelegramTheme } from "@/lib/telegram-theme";

const TelegramWebAppProvider = ({ children }: { children: React.ReactNode }) => {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    let isMounted = true;
    let cleanup: (() => void) | undefined;

    const bootstrap = async () => {
      const { default: WebApp } = await import("@twa-dev/sdk");
      if (!isMounted) {
        return;
      }
      applyTelegramTheme(WebApp.themeParams);
      const root = document.documentElement;
      const isTelegramHost = WebApp.platform !== "unknown";
      if (isTelegramHost) {
        root.dataset.telegramHost = "true";
      }
      WebApp.ready();
      if (!WebApp.isExpanded) {
        WebApp.expand();
      }
      if (isTelegramHost && WebApp.isVersionAtLeast("6.1")) {
        WebApp.setHeaderColor("#02050e");
        WebApp.setBackgroundColor("#02050e");
      }

      const swipesDisabled =
        isTelegramHost &&
        WebApp.isVersionAtLeast("7.7") &&
        typeof WebApp.disableVerticalSwipes === "function";
      if (swipesDisabled) {
        WebApp.disableVerticalSwipes();
      }

      const immersiveMode = isTelegramHost && WebApp.isVersionAtLeast("8.0");
      if (immersiveMode) {
        WebApp.lockOrientation();
        if (!WebApp.isFullscreen) WebApp.requestFullscreen();
      }

      const syncHostMetrics = () => {
        const content = WebApp.contentSafeAreaInset;
        const system = WebApp.safeAreaInset;
        root.dataset.telegramFullscreen = String(WebApp.isFullscreen);
        root.style.setProperty(
          "--xuhuan-tg-content-safe-top",
          `${Math.max(content?.top ?? 0, system?.top ?? 0)}px`,
        );
        root.style.setProperty(
          "--xuhuan-tg-content-safe-bottom",
          `${Math.max(content?.bottom ?? 0, system?.bottom ?? 0)}px`,
        );
      };
      syncHostMetrics();

      const handleThemeChange = () => {
        applyTelegramTheme(WebApp.themeParams);
      };
      WebApp.onEvent("themeChanged", handleThemeChange);
      WebApp.onEvent("viewportChanged", syncHostMetrics);
      if (immersiveMode) {
        WebApp.onEvent("safeAreaChanged", syncHostMetrics);
        WebApp.onEvent("contentSafeAreaChanged", syncHostMetrics);
        WebApp.onEvent("fullscreenChanged", syncHostMetrics);
        WebApp.onEvent("fullscreenFailed", syncHostMetrics);
      }
      cleanup = () => {
        WebApp.offEvent("themeChanged", handleThemeChange);
        WebApp.offEvent("viewportChanged", syncHostMetrics);
        if (immersiveMode) {
          WebApp.offEvent("safeAreaChanged", syncHostMetrics);
          WebApp.offEvent("contentSafeAreaChanged", syncHostMetrics);
          WebApp.offEvent("fullscreenChanged", syncHostMetrics);
          WebApp.offEvent("fullscreenFailed", syncHostMetrics);
          WebApp.unlockOrientation();
        }
        if (swipesDisabled) {
          WebApp.enableVerticalSwipes();
        }
        delete root.dataset.telegramHost;
        delete root.dataset.telegramFullscreen;
        root.style.removeProperty("--xuhuan-tg-content-safe-top");
        root.style.removeProperty("--xuhuan-tg-content-safe-bottom");
      };
    };

    void bootstrap();

    return () => {
      isMounted = false;
      if (cleanup) {
        cleanup();
      }
    };
  }, []);
  return <>{children}</>;
};

export default TelegramWebAppProvider;
