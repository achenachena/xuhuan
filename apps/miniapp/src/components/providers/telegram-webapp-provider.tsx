"use client";

import { useEffect, useState } from "react";

import TelegramHostContext, {
  type HostKind,
} from "@/components/providers/telegram-host-context";
import { applyTelegramTheme } from "@/lib/telegram-theme";

const TelegramWebAppProvider = ({ children }: { children: React.ReactNode }) => {
  const [host, setHost] = useState<HostKind>("detecting");

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
      // A non-empty initData payload is the only client-side signal used to
      // mount the authenticated game. The Go API still verifies its HMAC;
      // this check only prevents public browsers from making protected calls.
      const isTelegramHost =
        WebApp.platform !== "unknown" &&
        typeof WebApp.initData === "string" &&
        WebApp.initData.length > 0;
      if (isTelegramHost) {
        root.dataset.telegramHost = "true";
      }
      setHost(isTelegramHost ? "telegram" : "browser");
      WebApp.ready();
      if (!WebApp.isExpanded) {
        WebApp.expand();
      }
      if (isTelegramHost && WebApp.isVersionAtLeast("6.1")) {
        WebApp.setHeaderColor("#02050e");
        WebApp.setBackgroundColor("#02050e");
      }

      const immersiveMode = isTelegramHost && WebApp.isVersionAtLeast("8.0");
      if (immersiveMode) {
        // Some Telegram clients advertise the API version before the native
        // fullscreen/orientation bridge is actually available. Presentation
        // enhancement must never abort safe-area synchronization.
        try {
          if (!WebApp.isFullscreen) WebApp.requestFullscreen();
        } catch {
          // Continue in the host's current presentation mode.
        }
      }

      const syncHostMetrics = () => {
        const content = WebApp.contentSafeAreaInset;
        const system = WebApp.safeAreaInset;
        const stableHeight = WebApp.viewportStableHeight || window.innerHeight;
        const viewportHeight = WebApp.viewportHeight || window.innerHeight;
        root.dataset.telegramFullscreen = String(WebApp.isFullscreen);
        root.style.setProperty(
          "--xuhuan-stable-height",
          `${Math.max(1, Math.round(stableHeight))}px`,
        );
        root.style.setProperty(
          "--xuhuan-viewport-height",
          `${Math.max(1, Math.round(viewportHeight))}px`,
        );
        root.style.setProperty(
          "--xuhuan-tg-content-safe-top",
          `${Math.max(content?.top ?? 0, system?.top ?? 0)}px`,
        );
        root.style.setProperty(
          "--xuhuan-tg-content-safe-bottom",
          `${Math.max(content?.bottom ?? 0, system?.bottom ?? 0)}px`,
        );
        root.style.setProperty(
          "--xuhuan-tg-content-safe-left",
          `${Math.max(content?.left ?? 0, system?.left ?? 0)}px`,
        );
        root.style.setProperty(
          "--xuhuan-tg-content-safe-right",
          `${Math.max(content?.right ?? 0, system?.right ?? 0)}px`,
        );
      };
      syncHostMetrics();

      const handleThemeChange = () => {
        applyTelegramTheme(WebApp.themeParams);
      };
      const handleDeactivated = () => {
        window.dispatchEvent(new Event("xuhuan:deactivated"));
      };
      const handleActivated = () => {
        window.dispatchEvent(new Event("xuhuan:activated"));
      };
      WebApp.onEvent("themeChanged", handleThemeChange);
      WebApp.onEvent("viewportChanged", syncHostMetrics);
      WebApp.onEvent("deactivated", handleDeactivated);
      WebApp.onEvent("activated", handleActivated);
      window.addEventListener("resize", syncHostMetrics, { passive: true });
      if (immersiveMode) {
        WebApp.onEvent("safeAreaChanged", syncHostMetrics);
        WebApp.onEvent("contentSafeAreaChanged", syncHostMetrics);
        WebApp.onEvent("fullscreenChanged", syncHostMetrics);
        WebApp.onEvent("fullscreenFailed", syncHostMetrics);
      }
      cleanup = () => {
        WebApp.offEvent("themeChanged", handleThemeChange);
        WebApp.offEvent("viewportChanged", syncHostMetrics);
        WebApp.offEvent("deactivated", handleDeactivated);
        WebApp.offEvent("activated", handleActivated);
        window.removeEventListener("resize", syncHostMetrics);
        if (immersiveMode) {
          WebApp.offEvent("safeAreaChanged", syncHostMetrics);
          WebApp.offEvent("contentSafeAreaChanged", syncHostMetrics);
          WebApp.offEvent("fullscreenChanged", syncHostMetrics);
          WebApp.offEvent("fullscreenFailed", syncHostMetrics);
        }
        delete root.dataset.telegramHost;
        delete root.dataset.telegramFullscreen;
        root.style.removeProperty("--xuhuan-tg-content-safe-top");
        root.style.removeProperty("--xuhuan-tg-content-safe-bottom");
        root.style.removeProperty("--xuhuan-tg-content-safe-left");
        root.style.removeProperty("--xuhuan-tg-content-safe-right");
        root.style.removeProperty("--xuhuan-stable-height");
        root.style.removeProperty("--xuhuan-viewport-height");
      };
    };

    void bootstrap().catch(() => {
      if (isMounted) setHost("browser");
    });

    return () => {
      isMounted = false;
      if (cleanup) {
        cleanup();
      }
    };
  }, []);
  return (
    <TelegramHostContext.Provider value={host}>
      {children}
    </TelegramHostContext.Provider>
  );
};

export default TelegramWebAppProvider;
