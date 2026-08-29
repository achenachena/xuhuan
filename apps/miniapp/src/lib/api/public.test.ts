import { afterEach, describe, expect, it, vi } from "vitest";

describe("public API client", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_API_URL;
    vi.resetModules();
  });

  it("rejects malformed run IDs without contacting the API", async () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.com";
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { getPublicDailyResult } = await import("@/lib/api/public");

    await expect(getPublicDailyResult("not-a-run-id")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses a bounded, cached request for a canonical run ID", async () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.com/";
    const runID = "10000000-0000-4000-8000-000000000001";
    const payload = { score: 1200 };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const { getPublicDailyResult } = await import("@/lib/api/public");

    await expect(getPublicDailyResult(runID)).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.example.com/v2/daily/results/${runID}`,
      expect.objectContaining({
        cache: "force-cache",
        next: { revalidate: 300 },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("distinguishes a missing result from an upstream failure", async () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.com";
    const runID = "10000000-0000-4000-8000-000000000001";
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { getPublicDailyResult } = await import("@/lib/api/public");

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(getPublicDailyResult(runID)).resolves.toBeNull();

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    await expect(
      getPublicDailyResult("20000000-0000-4000-8000-000000000002"),
    ).rejects.toThrow("Public API request failed (503)");
  });
});
