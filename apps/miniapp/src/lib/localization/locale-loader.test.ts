import { afterEach, describe, expect, it, vi } from "vitest";

import loadLocaleBundle from "@/lib/localization/locale-loader";

describe("locale bundle loading", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each([
    ["en-US", "Light Attack", "Victory"],
    ["zh-CN", "轻击", "战斗胜利"]
  ])("loads the bundled %s language without a remote host", async (language, lightAttack, victory) => {
    vi.stubEnv("NEXT_PUBLIC_LOCALE_BASE_URL", "");

    const bundle = await loadLocaleBundle({ language });

    expect(bundle["actions.lightAttack.title"]).toBe(lightAttack);
    expect(bundle["rewardModal.title.victory"]).toBe(victory);
  });

  it("falls back to the bundled language when a remote bundle is invalid", async () => {
    vi.stubEnv("NEXT_PUBLIC_LOCALE_BASE_URL", "https://locales.example.com/");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ "actions.lightAttack.title": 42 }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    const bundle = await loadLocaleBundle({ language: "en" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://locales.example.com/en.json",
      expect.objectContaining({ cache: "no-store" })
    );
    expect(bundle["actions.lightAttack.title"]).toBe("Light Attack");
  });
});
