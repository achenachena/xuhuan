import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const webApp = vi.hoisted(() => ({
  themeParams: { bg_color: "#000000" },
  isExpanded: false,
  platform: "ios",
  isVersionAtLeast: vi.fn(() => true),
  disableVerticalSwipes: vi.fn(),
  enableVerticalSwipes: vi.fn(),
  ready: vi.fn(),
  expand: vi.fn(),
  onEvent: vi.fn(),
  offEvent: vi.fn()
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
    webApp.onEvent.mockReset();
    webApp.offEvent.mockReset();
    applyTelegramTheme.mockReset();
    webApp.themeParams.bg_color = "#000000";
    webApp.isExpanded = false;
    webApp.platform = "ios";
    document.documentElement.removeAttribute("data-telegram-host");
  });

  it("initializes, expands, subscribes, and unsubscribes the Mini App", async () => {
    const rendered = render(
      <TelegramWebAppProvider>
        <div>game</div>
      </TelegramWebAppProvider>
    );

    await waitFor(() => expect(webApp.ready).toHaveBeenCalledOnce());
    expect(applyTelegramTheme).toHaveBeenCalledWith(webApp.themeParams);
    expect(webApp.expand).toHaveBeenCalledOnce();
    expect(webApp.isVersionAtLeast).toHaveBeenCalledWith("7.7");
    expect(webApp.disableVerticalSwipes).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.telegramHost).toBe("true");
    expect(webApp.onEvent).toHaveBeenCalledWith("themeChanged", expect.any(Function));

    rendered.unmount();
    expect(webApp.offEvent).toHaveBeenCalledWith("themeChanged", expect.any(Function));
    expect(webApp.enableVerticalSwipes).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.telegramHost).toBeUndefined();
  });

  it("reapplies Telegram colors when the host theme changes", async () => {
    render(
      <TelegramWebAppProvider>
        <div>game</div>
      </TelegramWebAppProvider>
    );
    await waitFor(() => expect(webApp.onEvent).toHaveBeenCalledWith("themeChanged", expect.any(Function)));
    const themeChanged = webApp.onEvent.mock.calls.find(([event]) => event === "themeChanged")?.[1];
    if (!themeChanged) {
      throw new Error("themeChanged handler was not registered");
    }

    webApp.themeParams.bg_color = "#ffffff";
    themeChanged();

    expect(applyTelegramTheme).toHaveBeenLastCalledWith({
      bg_color: "#ffffff"
    });
  });
});
