import type { components } from "@/lib/api/generated";
import { env } from "@/lib/env";

export type APIPlayer = components["schemas"]["Player"];
export type APICharacter = components["schemas"]["Character"];
export type APIEncounter = components["schemas"]["Encounter"];
export type APIBattle = components["schemas"]["Battle"];
export type APIBattleActionResponse = components["schemas"]["BattleActionResponse"];
export type APIActionKind = components["schemas"]["ActionKind"];

type ErrorEnvelope = components["schemas"]["ErrorEnvelope"];

let cachedWebApp: (typeof import("@twa-dev/sdk"))["default"] | null = null;

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

export class APIError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = "APIError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

const resolveURL = (path: string): string => {
  const baseURL = env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ?? "";
  return `${baseURL}${path}`;
};

const buildAuthenticationHeaders = async (): Promise<HeadersInit> => {
  const webApp = await loadTelegramWebApp();
  const initData = webApp?.initData ?? "";
  if (initData) {
    return { "X-Telegram-Init-Data": initData };
  }
  if (env.NEXT_PUBLIC_DEV_AUTH_TOKEN) {
    return { "X-Dev-Auth": env.NEXT_PUBLIC_DEV_AUTH_TOKEN };
  }
  return {};
};

const parseError = async (response: Response): Promise<APIError> => {
  try {
    const body = (await response.json()) as ErrorEnvelope;
    return new APIError(response.status, body.error.code, body.error.message, body.error.request_id);
  } catch {
    return new APIError(response.status, "request_failed", `API request failed (${response.status})`);
  }
};

const requestJSON = async <TResponse>(
  path: string,
  init: RequestInit = {}
): Promise<TResponse> => {
  const authenticationHeaders = await buildAuthenticationHeaders();
  const response = await fetch(resolveURL(path), {
    ...init,
    headers: {
      Accept: "application/json",
      "Accept-Language": "zh-CN",
      ...authenticationHeaders,
      ...init.headers
    }
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  return (await response.json()) as TResponse;
};

const postJSON = async <TBody, TResponse>(
  path: string,
  body: TBody,
  idempotencyKey: string
): Promise<TResponse> => {
  return requestJSON<TResponse>(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey
    },
    body: JSON.stringify(body)
  });
};

export const createIdempotencyKey = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const getPlayer = (): Promise<APIPlayer> => requestJSON<APIPlayer>("/v1/player");

export const getCharacters = async (): Promise<readonly APICharacter[]> => {
  const response = await requestJSON<{ characters: APICharacter[] }>("/v1/characters");
  return response.characters;
};

export const getCharacter = (slug: string): Promise<APICharacter> => {
  return requestJSON<APICharacter>(`/v1/characters/${encodeURIComponent(slug)}`);
};

export const getEncounters = async (): Promise<readonly APIEncounter[]> => {
  const response = await requestJSON<{ encounters: APIEncounter[] }>("/v1/encounters");
  return response.encounters;
};

export const createBattle = (
  body: { readonly character_slug: string; readonly encounter_slug: string },
  idempotencyKey: string
): Promise<APIBattle> => postJSON("/v1/battles", body, idempotencyKey);

export const getBattle = (battleId: string): Promise<APIBattle> => {
  return requestJSON<APIBattle>(`/v1/battles/${encodeURIComponent(battleId)}`);
};

export const createBattleAction = (
  battleId: string,
  body: { readonly action: APIActionKind; readonly expected_version: number },
  idempotencyKey: string
): Promise<APIBattleActionResponse> => {
  return postJSON(`/v1/battles/${encodeURIComponent(battleId)}/actions`, body, idempotencyKey);
};
