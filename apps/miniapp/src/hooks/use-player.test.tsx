import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getPlayer: vi.fn(),
  createBattle: vi.fn(),
  createBattleAction: vi.fn(),
  getBattle: vi.fn()
}));

vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  ...api
}));

import { usePlayerProfile, useStartBattle } from "@/hooks/use-player";
import { createTestBattle } from "@/test/fixtures";

const wrapper = ({ children }: { readonly children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
    {children}
  </SWRConfig>
);

describe("API hooks", () => {
  beforeEach(() => {
    api.getPlayer.mockReset();
    api.createBattle.mockReset();
  });

  it("exposes loading and error states", async () => {
    let rejectRequest: (reason: Error) => void = () => undefined;
    api.getPlayer.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectRequest = reject;
      })
    );
    const { result } = renderHook(() => usePlayerProfile(), { wrapper });
    expect(result.current.isLoading).toBe(true);

    act(() => rejectRequest(new Error("offline")));
    await waitFor(() => expect(result.current.error).toEqual(new Error("offline")));
    expect(result.current.isLoading).toBe(false);
  });

  it("maps start-battle input to the generated API contract", async () => {
    const battle = createTestBattle();
    api.createBattle.mockResolvedValue(battle);
    const { result } = renderHook(() => useStartBattle(), { wrapper });

    await act(async () => {
      await result.current.startBattle({
        characterSlug: "nana7mi",
        encounterSlug: "training-drone",
        idempotencyKey: "start-key-001"
      });
    });

    expect(api.createBattle).toHaveBeenCalledWith(
      { character_slug: "nana7mi", encounter_slug: "training-drone" },
      "start-key-001"
    );
  });
});
