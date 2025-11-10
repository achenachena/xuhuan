"use client";

import useSWR from "swr";
import useSWRMutation from "swr/mutation";

import { env } from "@/lib/env";
import type {
  BattleLogEntry,
  BattleOutcome,
  BattleState,
  RewardBundle
} from "@/lib/game-loop";

let cachedWebApp: (typeof import("@twa-dev/sdk"))['default'] | null = null;

const loadTelegramWebApp = async () => {
  if (typeof window === "undefined") {
    return null;
  }
  if (cachedWebApp) {
    return cachedWebApp;
  }
  const sdkModule = await import("@twa-dev/sdk");
  cachedWebApp = sdkModule.default;
  return cachedWebApp;
};

export type PlayerProfile = {
  readonly id: string;
  readonly username: string;
  readonly level: number;
  readonly experience: number;
  readonly credits: number;
  readonly energy: number;
};

export type BattleStartRequest = {
  readonly enemyId: string;
  readonly seed?: string;
};

export type BattleStartResponse = {
  readonly battleId: string;
  readonly state: BattleState;
};

export type BattleCompleteRequest = {
  readonly battleId: string;
  readonly outcome: BattleOutcome;
  readonly log: readonly BattleLogEntry[];
  readonly rewards?: RewardBundle;
};

export type BattleCompleteResponse = {
  readonly runId: string;
  readonly state: BattleState;
};

type JsonFetcher<TResponse> = (path: string) => Promise<TResponse>;

const API_BASE_URL = env.NEXT_PUBLIC_API_URL ?? "";

const resolveUrl = (path: string): string => {
  if (!API_BASE_URL) {
    return path;
  }
  if (path.startsWith("http")) {
    return path;
  }
  return `${API_BASE_URL}${path}`;
};

const buildTelegramHeaders = async (): Promise<HeadersInit> => {
  const webApp = await loadTelegramWebApp();
  const initData = webApp?.initData ?? "";
  if (!initData) {
    return {};
  }
  return {
    "X-Telegram-Init-Data": initData
  } satisfies HeadersInit;
};

const getJson = async <TResponse>(path: string): Promise<TResponse> => {
  const headers = await buildTelegramHeaders();
  const response = await fetch(resolveUrl(path), {
    method: "GET",
    headers,
    credentials: "include"
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Failed to fetch ${path}`);
  }
  return (await response.json()) as TResponse;
};

const postJson = async <TBody, TResponse>(path: string, body: TBody): Promise<TResponse> => {
  const headers = await buildTelegramHeaders();
  const response = await fetch(resolveUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    body: JSON.stringify(body),
    credentials: "include"
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(errorBody || `Failed to post ${path}`);
  }
  return (await response.json()) as TResponse;
};

export const usePlayerProfile = () => {
  const swr = useSWR<PlayerProfile>("/player", getJson as JsonFetcher<PlayerProfile>);
  return {
    player: swr.data,
    isLoading: swr.isLoading,
    error: swr.error,
    mutatePlayer: swr.mutate
  };
};

export const useStartBattle = () => {
  const mutation = useSWRMutation<
    BattleStartResponse,
    Error,
    string,
    BattleStartRequest
  >("/battle/start", (url, { arg }) => postJson<BattleStartRequest, BattleStartResponse>(url, arg));

  return {
    startBattle: mutation.trigger,
    data: mutation.data,
    isMutating: mutation.isMutating,
    error: mutation.error,
    reset: mutation.reset
  };
};

export const useCompleteBattle = () => {
  const mutation = useSWRMutation<
    BattleCompleteResponse,
    Error,
    string,
    BattleCompleteRequest
  >("/battle/complete", (url, { arg }) =>
    postJson<BattleCompleteRequest, BattleCompleteResponse>(url, arg)
  );

  return {
    completeBattle: mutation.trigger,
    data: mutation.data,
    isMutating: mutation.isMutating,
    error: mutation.error,
    reset: mutation.reset
  };
};

