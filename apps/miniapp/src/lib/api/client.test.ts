import { beforeEach, describe, expect, it, vi } from "vitest";

const telegram = vi.hoisted(() => ({ initData: "query_id=test&hash=signed" }));

vi.mock("@twa-dev/sdk", () => ({ default: telegram }));
vi.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_API_URL: "https://api.example.com",
  },
}));

import {
  APIError,
  createRun,
  createRunCommand,
  getGame,
  getGameContent,
} from "@/lib/api/client";

describe("API client", () => {
  beforeEach(() => {
    telegram.initData = "query_id=test&hash=signed";
  });

  it("prefers raw Telegram initData and sends a versioned run command", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ run: {}, events: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await createRunCommand(
      "c8c6d56d-974f-4c82-8a83-a3c20e736e38",
      { type: "choose_node", node_id: "l1-a", expected_version: 4 },
      "action-key-001",
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://api.example.com/v2/runs/c8c6d56d-974f-4c82-8a83-a3c20e736e38/commands",
    );
    expect(request).toMatchObject({ method: "POST" });
    expect(request?.cache).toBe("no-store");
    expect(request?.signal).toBeInstanceOf(AbortSignal);
    expect(request?.headers).toMatchObject({
      "X-Telegram-Init-Data": telegram.initData,
      "Idempotency-Key": "action-key-001",
    });
    expect(request?.body).toBe(
      JSON.stringify({
        type: "choose_node",
        node_id: "l1-a",
        expected_version: 4,
      }),
    );
  });

  it("requests immutable V3 content in the selected locale", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ version: "v3", protocol: "action-v2" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await getGameContent("zh-CN");

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.example.com/v2/content/v3?locale=zh-CN",
    );
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      "Accept-Language": "zh-CN",
    });
    expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty(
      "X-Telegram-Init-Data",
    );
  });

  it("creates campaign and daily runs through the same idempotent endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ id: "run" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await createRun(
      {
        mode: "campaign",
        chapter_slug: "seventh-dock",
        character_slug: "nana7mi",
        noise_level: 0,
      },
      "campaign-key",
    );
    await createRun({ mode: "daily" }, "daily-key");

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.example.com/v2/runs",
    );
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      "Idempotency-Key": "campaign-key",
    });
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({
      "Idempotency-Key": "daily-key",
    });
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(
      JSON.stringify({ mode: "daily" }),
    );
  });

  it("sends no identity header when Telegram initData is absent", async () => {
    telegram.initData = "";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "player" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await getGame();

    expect(fetchMock.mock.calls[0][1]?.headers).not.toHaveProperty(
      "X-Telegram-Init-Data",
    );
  });

  it("preserves the stable server error envelope", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "version_conflict",
            message: "The authoritative state has changed",
            request_id: "request-123",
          },
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(getGame()).rejects.toEqual(
      expect.objectContaining<Partial<APIError>>({
        status: 409,
        code: "version_conflict",
        requestId: "request-123",
      }),
    );
  });

  it("retries a completed encounter with the same idempotency key", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("temporary network failure"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ run: {}, events: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    await createRunCommand(
      "c8c6d56d-974f-4c82-8a83-a3c20e736e38",
      {
        type: "complete_encounter",
        expected_version: 4,
        trace: { encoding: "rle8-v1", ticks: 1, data: "AAE" },
      },
      "encounter-key-001",
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      "Idempotency-Key": "encounter-key-001",
    });
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({
      "Idempotency-Key": "encounter-key-001",
    });
  });
});
