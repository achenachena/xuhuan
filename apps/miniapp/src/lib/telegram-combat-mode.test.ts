import { afterEach, describe, expect, it, vi } from "vitest";

import { enterTelegramCombatMode } from "@/lib/telegram-combat-mode";

vi.mock("@/lib/telegram-gesture-lock", () => ({
  lockTelegramVerticalSwipes: vi.fn(() => vi.fn()),
}));

import { lockTelegramVerticalSwipes } from "@/lib/telegram-gesture-lock";

describe("Telegram combat mode", () => {
  afterEach(() => {
    delete document.documentElement.dataset.shooterEncounter;
    vi.clearAllMocks();
  });

  it("locks portrait only for supported Telegram combat and restores it", async () => {
    const webApp = {
      platform: "ios",
      isVersionAtLeast: vi.fn(() => true),
      lockOrientation: vi.fn(),
      unlockOrientation: vi.fn(),
    };
    const restore = enterTelegramCombatMode(async () => webApp);
    await vi.waitFor(() => expect(webApp.lockOrientation).toHaveBeenCalledOnce());

    expect(document.documentElement.dataset.shooterEncounter).toBe("true");
    expect(lockTelegramVerticalSwipes).toHaveBeenCalledOnce();
    restore();
    expect(webApp.unlockOrientation).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.shooterEncounter).toBeUndefined();
  });

  it("does not call orientation APIs before Telegram 8.0", async () => {
    const webApp = {
      platform: "ios",
      isVersionAtLeast: vi.fn(() => false),
      lockOrientation: vi.fn(),
      unlockOrientation: vi.fn(),
    };
    const restore = enterTelegramCombatMode(async () => webApp);
    await Promise.resolve();
    expect(webApp.lockOrientation).not.toHaveBeenCalled();
    restore();
    expect(webApp.unlockOrientation).not.toHaveBeenCalled();
  });
});
