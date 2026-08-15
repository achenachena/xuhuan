import { beforeEach, describe, expect, it, vi } from "vitest";

const telegram = vi.hoisted(() => ({ initData: "query_id=test&hash=signed" }));

vi.mock("@twa-dev/sdk", () => ({ default: telegram }));
vi.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_API_URL: "https://api.example.com",
    NEXT_PUBLIC_DEV_AUTH_TOKEN: "0123456789abcdef"
  }
}));

import { APIError, createBattleAction, getPlayer } from "@/lib/api/client";

describe("API client", () => {
  beforeEach(() => {
    telegram.initData = "query_id=test&hash=signed";
  });

  it("prefers raw Telegram initData and sends versioned action input", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ battle: {}, result: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    await createBattleAction(
      "c8c6d56d-974f-4c82-8a83-a3c20e736e38",
      { action: "block", expected_version: 4 },
      "action-key-001"
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://api.example.com/v1/battles/c8c6d56d-974f-4c82-8a83-a3c20e736e38/actions"
    );
    expect(request).toMatchObject({ method: "POST" });
    expect(request?.cache).toBe("no-store");
    expect(request?.headers).toMatchObject({
      "X-Telegram-Init-Data": telegram.initData,
      "Idempotency-Key": "action-key-001"
    });
    expect(request?.body).toBe(JSON.stringify({ action: "block", expected_version: 4 }));
  });

  it("uses explicit development auth only when Telegram initData is absent", async () => {
    telegram.initData = "";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "player" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    await getPlayer();

    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      "X-Dev-Auth": "0123456789abcdef"
    });
  });

  it("preserves the stable server error envelope", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "version_conflict",
            message: "The battle state has changed",
            request_id: "request-123"
          }
        }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(getPlayer()).rejects.toEqual(
      expect.objectContaining<Partial<APIError>>({
        status: 409,
        code: "version_conflict",
        requestId: "request-123"
      })
    );
  });
});
