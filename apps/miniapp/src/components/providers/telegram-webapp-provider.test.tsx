import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const webApp = vi.hoisted(() => ({
  themeParams: { bg_color: "#000000" },
  isExpanded: false,
  isFullscreen: false,
  safeAreaInset: { top: 20, bottom: 8, left: 0, right: 0 },
  contentSafeAreaInset: { top: 84, bottom: 16, left: 0, right: 0 },
  platform: "ios",
  isVersionAtLeast: vi.fn(() => true),
  disableVerticalSwipes: vi.fn(),
  enableVerticalSwipes: vi.fn(),
  requestFullscreen: vi.fn(),
  lockOrientation: vi.fn(),
  unlockOrientation: vi.fn(),
  setHeaderColor: vi.fn(),
  setBackgroundColor: vi.fn(),
  ready: vi.fn(),
  expand: vi.fn(),
  onEvent: vi.fn(),
  offEvent: vi.fn(),
}));
const applyTelegramTheme = vi.hoisted(() => vi.fn());

vi.mock("@twa-dev/sdk", () => ({ default: webApp }));
vi.mock("@/lib/telegram-theme", () => ({ applyTelegramTheme }));

import TelegramWebAppProvider from "@/components/providers/telegram-webapp-provider";

describe("TelegramWebAppProvider", () => {
  beforeEach(() => {
    webApp.ready.mockReset();
    webApp.expand.mockReset();
    webApp.isVersionAtLeast.mockClear();
    webApp.disableVerticalSwipes.mockReset();
    webApp.enableVerticalSwipes.mockReset();
    webApp.requestFullscreen.mockReset();
    webApp.lockOrientation.mockReset();
    webApp.unlockOrientation.mockReset();
    webApp.setHeaderColor.mockReset();
    webApp.setBackgroundColor.mockReset();
    webApp.onEvent.mockReset();
    webApp.offEvent.mockReset();
    applyTelegramTheme.mockReset();
    webApp.themeParams.bg_color = "#000000";
    webApp.isExpanded = false;
    webApp.isFullscreen = false;
    webApp.platform = "ios";
    webApp.safeAreaInset = { top: 20, bottom: 8, left: 0, right: 0 };
    webApp.contentSafeAreaInset = { top: 84, bottom: 16, left: 0, right: 0 };
    document.documentElement.removeAttribute("data-telegram-host");
    document.documentElement.removeAttribute("data-telegram-fullscreen");
    document.documentElement.style.removeProperty(
      "--xuhuan-tg-content-safe-top",
    );
    document.documentElement.style.removeProperty(
      "--xuhuan-tg-content-safe-bottom",
    );
  });

  it("initializes, expands, subscribes, and unsubscribes the Mini App", async () => {
    const rendered = render(
      <TelegramWebAppProvider>
        <div>game</div>
      </TelegramWebAppProvider>,
    );

    await waitFor(() => expect(webApp.ready).toHaveBeenCalledOnce());
    expect(applyTelegramTheme).toHaveBeenCalledWith(webApp.themeParams);
    expect(webApp.expand).toHaveBeenCalledOnce();
    expect(webApp.isVersionAtLeast).toHaveBeenCalledWith("6.1");
    expect(webApp.isVersionAtLeast).toHaveBeenCalledWith("8.0");
    expect(webApp.disableVerticalSwipes).not.toHaveBeenCalled();
    expect(webApp.requestFullscreen).toHaveBeenCalledOnce();
    expect(webApp.lockOrientation).toHaveBeenCalledOnce();
    expect(webApp.setHeaderColor).toHaveBeenCalledWith("#02050e");
    expect(webApp.setBackgroundColor).toHaveBeenCalledWith("#02050e");
    expect(document.documentElement.dataset.telegramHost).toBe("true");
    expect(document.documentElement.dataset.telegramFullscreen).toBe("false");
    expect(
      document.documentElement.style.getPropertyValue(
        "--xuhuan-tg-content-safe-top",
      ),
    ).toBe("84px");
    expect(webApp.onEvent).toHaveBeenCalledWith(
      "themeChanged",
      expect.any(Function),
    );

    rendered.unmount();
    expect(webApp.offEvent).toHaveBeenCalledWith(
      "themeChanged",
      expect.any(Function),
    );
    expect(webApp.enableVerticalSwipes).not.toHaveBeenCalled();
    expect(webApp.unlockOrientation).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.telegramHost).toBeUndefined();
  });

  it("reapplies Telegram colors when the host theme changes", async () => {
    render(
      <TelegramWebAppProvider>
        <div>game</div>
      </TelegramWebAppProvider>,
    );
    await waitFor(() =>
      expect(webApp.onEvent).toHaveBeenCalledWith(
        "themeChanged",
        expect.any(Function),
      ),
    );
    const themeChanged = webApp.onEvent.mock.calls.find(
      ([event]) => event === "themeChanged",
    )?.[1];
    if (!themeChanged) {
      throw new Error("themeChanged handler was not registered");
    }

    webApp.themeParams.bg_color = "#ffffff";
    themeChanged();

    expect(applyTelegramTheme).toHaveBeenLastCalledWith({
      bg_color: "#ffffff",
    });
  });

  it("updates content-safe insets when Telegram changes its viewport", async () => {
    render(
      <TelegramWebAppProvider>
        <div>game</div>
      </TelegramWebAppProvider>,
    );
    await waitFor(() =>
      expect(webApp.onEvent).toHaveBeenCalledWith(
        "contentSafeAreaChanged",
        expect.any(Function),
      ),
    );
    const contentSafeAreaChanged = webApp.onEvent.mock.calls.find(
      ([event]) => event === "contentSafeAreaChanged",
    )?.[1];
    if (!contentSafeAreaChanged) {
      throw new Error("contentSafeAreaChanged handler was not registered");
    }

    webApp.contentSafeAreaInset = { top: 112, bottom: 24, left: 0, right: 0 };
    contentSafeAreaChanged();

    expect(
      document.documentElement.style.getPropertyValue(
        "--xuhuan-tg-content-safe-top",
      ),
    ).toBe("112px");
    expect(
      document.documentElement.style.getPropertyValue(
        "--xuhuan-tg-content-safe-bottom",
      ),
    ).toBe("24px");
  });

  it("keeps safe-area synchronization when the optional fullscreen bridge throws", async () => {
    webApp.requestFullscreen.mockImplementationOnce(() => {
      throw new Error("native bridge unavailable");
    });

    render(
      <TelegramWebAppProvider>
        <div>game</div>
      </TelegramWebAppProvider>,
    );

    await waitFor(() =>
      expect(
        document.documentElement.style.getPropertyValue(
          "--xuhuan-tg-content-safe-top",
        ),
      ).toBe("84px"),
    );
    expect(webApp.onEvent).toHaveBeenCalledWith(
      "viewportChanged",
      expect.any(Function),
    );
  });
});
