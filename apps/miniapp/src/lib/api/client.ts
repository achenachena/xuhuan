import type { components } from "@/lib/api/generated";
import { env } from "@/lib/env";

export type APIGameContent = components["schemas"]["GameContent"];
export type APIGameSnapshot = components["schemas"]["GameSnapshot"];
export type APIGameRun = components["schemas"]["GameRun"];
export type APIRunState = components["schemas"]["RunState"];
export type APIRunCommand = components["schemas"]["RunCommandRequest"];
export type APIRunCommandResponse = components["schemas"]["RunCommandResponse"];
export type APIStoryChoiceResponse = components["schemas"]["StoryChoiceResponse"];
export type APICreateRunRequest = components["schemas"]["CreateRunRequest"];
export type APIDailyResult = components["schemas"]["DailyResult"];

type ErrorEnvelope = components["schemas"]["ErrorEnvelope"];
const requestTimeoutMilliseconds = 20_000;
const encounterReplayTimeoutMilliseconds = 45_000;

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
  init: RequestInit = {},
  authenticate = true,
): Promise<TResponse> => {
  const authenticationHeaders = authenticate
    ? await buildAuthenticationHeaders()
    : {};
  const response = await fetch(resolveURL(path), {
    ...init,
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(requestTimeoutMilliseconds),
    headers: {
      Accept: "application/json",
      "Accept-Language": "en",
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
  idempotencyKey: string,
  timeoutMilliseconds = requestTimeoutMilliseconds,
): Promise<TResponse> => {
  return requestJSON<TResponse>(path, {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMilliseconds),
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey
    },
    body: JSON.stringify(body)
  });
};

export const createIdempotencyKey = (): string => {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error("Secure random UUID generation is unavailable");
  }
  return globalThis.crypto.randomUUID();
};

export const getGameContent = (locale: "zh-CN" | "en"): Promise<APIGameContent> => {
  return requestJSON<APIGameContent>(
    `/v2/content/v3?locale=${encodeURIComponent(locale)}`,
    { headers: { "Accept-Language": locale } },
    false,
  );
};

export const getGame = (locale: "zh-CN" | "en" = "en"): Promise<APIGameSnapshot> =>
  requestJSON<APIGameSnapshot>("/v2/game", {
    headers: { "Accept-Language": locale },
  });

export const createRun = (
  body: APICreateRunRequest,
  idempotencyKey: string
): Promise<APIGameRun> => postJSON("/v2/runs", body, idempotencyKey);

export const getRun = (runId: string): Promise<APIGameRun> => {
  return requestJSON<APIGameRun>(`/v2/runs/${encodeURIComponent(runId)}`);
};

export const createRunCommand = (
  runId: string,
  body: APIRunCommand,
  idempotencyKey: string
): Promise<APIRunCommandResponse> => {
  return postJSON(
    `/v2/runs/${encodeURIComponent(runId)}/commands`,
    body,
    idempotencyKey,
    body.type === "complete_encounter"
      ? encounterReplayTimeoutMilliseconds
      : requestTimeoutMilliseconds,
  );
};

export const createStoryChoice = (
  body: { readonly scene_slug: string; readonly option_slug: string; readonly expected_version: number },
  idempotencyKey: string
): Promise<APIStoryChoiceResponse> => {
  return postJSON("/v2/story/choices", body, idempotencyKey);
};
