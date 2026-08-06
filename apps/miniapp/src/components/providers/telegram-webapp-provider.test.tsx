import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const webApp = vi.hoisted(() => ({
  themeParams: { bg_color: "#000000" },
  isExpanded: false,
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
  it("initializes, expands, subscribes, and unsubscribes the Mini App", async () => {
    const rendered = render(
      <TelegramWebAppProvider>
        <div>game</div>
      </TelegramWebAppProvider>
    );

    await waitFor(() => expect(webApp.ready).toHaveBeenCalledOnce());
    expect(applyTelegramTheme).toHaveBeenCalledWith(webApp.themeParams);
    expect(webApp.expand).toHaveBeenCalledOnce();
    expect(webApp.onEvent).toHaveBeenCalledWith("themeChanged", expect.any(Function));

    rendered.unmount();
    expect(webApp.offEvent).toHaveBeenCalledWith("themeChanged", expect.any(Function));
  });
});
