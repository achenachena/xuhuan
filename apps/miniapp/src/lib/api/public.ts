import { cache } from "react";

import type { APIDailyResult, APIGameContent } from "@/lib/api/client";

const runIDPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const publicRequest = async <T>(
  path: string,
  revalidate: number,
): Promise<T | null> => {
  const baseURL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "");
  if (!baseURL) return null;
  const response = await fetch(`${baseURL}${path}`, {
    cache: "force-cache",
    next: { revalidate },
    signal: AbortSignal.timeout(5_000),
    headers: { Accept: "application/json" },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Public API request failed (${response.status})`);
  }
  return (await response.json()) as T;
};

export const getPublicDailyResult = cache(
  async (runID: string): Promise<APIDailyResult | null> => {
    if (!runIDPattern.test(runID)) return null;
    return publicRequest<APIDailyResult>(
      `/v2/daily/results/${encodeURIComponent(runID)}`,
      300,
    );
  },
);

export const getPublicGameContent = cache(
  (locale: "en" | "zh-CN"): Promise<APIGameContent | null> =>
    publicRequest<APIGameContent>(
      `/v2/content/v3?locale=${encodeURIComponent(locale)}`,
      31_536_000,
    ),
);
