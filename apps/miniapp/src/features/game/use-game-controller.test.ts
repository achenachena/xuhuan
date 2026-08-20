import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  APIGameContent,
  APIGameSnapshot,
} from "@/lib/api/client";

const dependencies = vi.hoisted(() => ({
  getGameContent: vi.fn(),
  getGame: vi.fn(),
}));

vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  ...dependencies,
}));

import { useGameController } from "@/features/game/use-game-controller";

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
};

const contentFor = (locale: "en" | "zh-CN") =>
  ({ locale }) as APIGameContent;
const game = { active_run: null } as APIGameSnapshot;

describe("useGameController", () => {
  beforeEach(() => {
    dependencies.getGameContent.mockReset();
    dependencies.getGame.mockReset().mockResolvedValue(game);
  });

  it("ignores a stale content response after the locale changes", async () => {
    const english = deferred<APIGameContent>();
    const chinese = deferred<APIGameContent>();
    dependencies.getGameContent.mockImplementation((locale) =>
      locale === "en" ? english.promise : chinese.promise,
    );

    const { result, rerender } = renderHook(
      ({ locale }: { locale: "en" | "zh-CN" }) =>
        useGameController(locale),
      { initialProps: { locale: "en" as "en" | "zh-CN" } },
    );
    await waitFor(() =>
      expect(dependencies.getGameContent).toHaveBeenCalledWith("en"),
    );

    rerender({ locale: "zh-CN" });
    await waitFor(() =>
      expect(dependencies.getGameContent).toHaveBeenCalledWith("zh-CN"),
    );
    await act(async () => chinese.resolve(contentFor("zh-CN")));
    await waitFor(() => expect(result.current.content?.locale).toBe("zh-CN"));

    await act(async () => english.resolve(contentFor("en")));
    expect(result.current.content?.locale).toBe("zh-CN");
  });
});
