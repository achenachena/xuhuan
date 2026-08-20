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
      const swipeAwareWebApp = WebApp as typeof WebApp & {
        disableVerticalSwipes?: () => void;
        enableVerticalSwipes?: () => void;
      };
      if (WebApp.platform !== "unknown") {
        document.documentElement.dataset.telegramHost = "true";
      }
      WebApp.ready();
      if (!WebApp.isExpanded) {
        WebApp.expand();
      }
      const swipesDisabled =
        WebApp.isVersionAtLeast("7.7") &&
        typeof swipeAwareWebApp.disableVerticalSwipes === "function";
      if (swipesDisabled) {
        swipeAwareWebApp.disableVerticalSwipes?.();
      }
      const handleThemeChange = () => {
        applyTelegramTheme(WebApp.themeParams);
      };
      WebApp.onEvent("themeChanged", handleThemeChange);
      cleanup = () => {
        WebApp.offEvent("themeChanged", handleThemeChange);
        if (swipesDisabled) {
          swipeAwareWebApp.enableVerticalSwipes?.();
        }
        delete document.documentElement.dataset.telegramHost;
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
