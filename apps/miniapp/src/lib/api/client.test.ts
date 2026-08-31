import { beforeEach, describe, expect, it, vi } from "vitest";

const telegram = vi.hoisted(() => ({ initData: "query_id=test&hash=signed" }));

vi.mock("@twa-dev/sdk", () => ({ default: telegram }));
vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_API_URL: "https://api.example.com" },
}));

import {
  APIError,
  createRun,
  createRunCommand,
  getGame,
  getGameContent,
} from "@/lib/api/client";

describe("V4 API client", () => {
  beforeEach(() => {
    telegram.initData = "query_id=test&hash=signed";
    vi.restoreAllMocks();
  });

  it("sends raw Telegram initData and the final show-choice wire shape", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ run: {}, events: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await createRunCommand(
      "c8c6d56d-974f-4c82-8a83-a3c20e736e38",
      {
        type: "choose_show_option",
        option_id: "double-take",
        expected_version: 4,
      },
      "show-key-001",
    );

    const [url, request] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://api.example.com/v2/runs/c8c6d56d-974f-4c82-8a83-a3c20e736e38/commands",
    );
    expect(request?.headers).toMatchObject({
      "X-Telegram-Init-Data": telegram.initData,
      "Idempotency-Key": "show-key-001",
    });
    expect(request?.body).toBe(
      JSON.stringify({
        type: "choose_show_option",
        option_id: "double-take",
        expected_version: 4,
      }),
    );
  });

  it("requests localized immutable V4 content without an identity header", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ version: "v4", protocol: "shooter-v1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await getGameContent("zh-CN");

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.example.com/v2/content/v4?locale=zh-CN",
    );
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      "Accept-Language": "zh-CN",
    });
    expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty(
      "X-Telegram-Init-Data",
    );
  });

  it("creates campaign and daily runs at the same idempotent endpoint", async () => {
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
        encore_level: 0,
      },
      "campaign-key",
    );
    await createRun({ mode: "daily" }, "daily-key");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.example.com/v2/runs");
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({
        mode: "campaign",
        chapter_slug: "seventh-dock",
        character_slug: "nana7mi",
        encore_level: 0,
      }),
    );
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(
      JSON.stringify({ mode: "daily" }),
    );
  });

  it("retries a complete segment with the exact tuple trace and key", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("temporary"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ run: {}, events: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    const body = {
      type: "complete_segment" as const,
      expected_version: 4,
      trace: {
        encoding: "x-position-rle-v1" as const,
        ticks: 260,
        runs: [
          [64, 255],
          [64, 5],
        ] as [number, number][],
      },
    };

    await createRunCommand(
      "c8c6d56d-974f-4c82-8a83-a3c20e736e38",
      body,
      "segment-key-001",
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify(body));
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(JSON.stringify(body));
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({
      "Idempotency-Key": "segment-key-001",
    });
  });

  it("preserves the stable server error envelope", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "version_conflict",
            message: "The authoritative state changed",
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
});
