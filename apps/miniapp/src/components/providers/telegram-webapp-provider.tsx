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
      WebApp.ready();
      if (!WebApp.isExpanded) {
        WebApp.expand();
      }
      const handleThemeChange = () => {
        applyTelegramTheme(WebApp.themeParams);
      };
      WebApp.onEvent("themeChanged", handleThemeChange);
      cleanup = () => {
        WebApp.offEvent("themeChanged", handleThemeChange);
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

