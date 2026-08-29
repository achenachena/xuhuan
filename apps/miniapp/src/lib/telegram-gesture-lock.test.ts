import { describe, expect, it, vi } from "vitest";

import { lockTelegramVerticalSwipes } from "@/lib/telegram-gesture-lock";

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
};

const controller = () => ({
  platform: "ios",
  isVersionAtLeast: () => true,
  disableVerticalSwipes: vi.fn(),
  enableVerticalSwipes: vi.fn(),
});

describe("Telegram encounter gesture lock", () => {
  it("restores vertical swipes after an active encounter", async () => {
    const webApp = controller();
    const restore = lockTelegramVerticalSwipes(async () => webApp);
    await Promise.resolve();

    expect(webApp.disableVerticalSwipes).toHaveBeenCalledOnce();
    restore();
    expect(webApp.enableVerticalSwipes).toHaveBeenCalledOnce();
  });

  it("does not lock after the encounter has already unmounted", async () => {
    const pending = deferred<ReturnType<typeof controller>>();
    const restore = lockTelegramVerticalSwipes(() => pending.promise);
    restore();

    const webApp = controller();
    pending.resolve(webApp);
    await pending.promise;
    await Promise.resolve();

    expect(webApp.disableVerticalSwipes).not.toHaveBeenCalled();
    expect(webApp.enableVerticalSwipes).not.toHaveBeenCalled();
  });
});
