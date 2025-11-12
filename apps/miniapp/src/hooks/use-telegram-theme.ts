"use client";

import { useEffect, useState } from "react";

import type { TelegramThemeState } from "@/lib/telegram-theme";
import { getFallbackTheme, normalizeThemeParams } from "@/lib/telegram-theme";

const DEFAULT_THEME_STATE: TelegramThemeState = {
  colorScheme: "light",
  themeParams: getFallbackTheme()
};

const useTelegramTheme = (): TelegramThemeState => {
  const [themeState, setThemeState] = useState<TelegramThemeState>(DEFAULT_THEME_STATE);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    let isMounted = true;
    let cleanup: (() => void) | undefined;

    const resolveTheme = async () => {
      const { default: WebApp } = await import("@twa-dev/sdk");
      if (!isMounted) {
        return;
      }

      // Make app full-screen
      WebApp.ready();
      WebApp.expand();
      WebApp.setHeaderColor("secondary_bg_color");

      const evaluateTheme = (): TelegramThemeState => {
        const themeParams = normalizeThemeParams(WebApp.themeParams);
        const colorScheme: "light" | "dark" = WebApp.colorScheme ?? "light";
        return { colorScheme, themeParams };
      };
      setThemeState(evaluateTheme());
      const handleThemeChange = () => {
        setThemeState(evaluateTheme());
      };
      WebApp.onEvent("themeChanged", handleThemeChange);
      cleanup = () => {
        WebApp.offEvent("themeChanged", handleThemeChange);
      };
    };

    void resolveTheme();

    return () => {
      isMounted = false;
      if (cleanup) {
        cleanup();
      }
    };
  }, []);

  return themeState;
};

export default useTelegramTheme;

