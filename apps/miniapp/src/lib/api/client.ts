import { env } from "@/lib/env";
import type {
  APIErrorEnvelope,
  ShooterContent,
  ShooterCreateRunRequest,
  ShooterGameRun,
  ShooterGameSnapshot,
  ShooterRunCommand,
  ShooterRunCommandResponse,
} from "@/lib/api/types";

export type APIGameContent = ShooterContent;
export type APIGameSnapshot = ShooterGameSnapshot;
export type APIGameRun = ShooterGameRun;
export type APIRunState = ShooterGameRun["state"];
export type APIRunCommand = ShooterRunCommand;
export type APIRunCommandResponse = ShooterRunCommandResponse;
export type APICreateRunRequest = ShooterCreateRunRequest;
export type { APIDailyResult } from "@/lib/api/types";
const requestTimeoutMilliseconds = 20_000;
const encounterReplayTimeoutMilliseconds = 20_000;
const encounterReplayAttempts = 3;
const retryDelaysMilliseconds = [250, 750] as const;

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
    const body = (await response.json()) as APIErrorEnvelope;
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
  attempts = 1,
): Promise<TResponse> => {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await requestJSON<TResponse>(path, {
        method: "POST",
        signal: AbortSignal.timeout(timeoutMilliseconds),
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey
        },
        body: JSON.stringify(body)
      });
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof TypeError ||
        (error instanceof DOMException &&
          ["AbortError", "TimeoutError"].includes(error.name)) ||
        (error instanceof APIError &&
          (error.status === 429 || error.status >= 500));
      if (!retryable || attempt + 1 >= attempts) throw error;
      await new Promise((resolve) =>
        globalThis.setTimeout(
          resolve,
          retryDelaysMilliseconds[
            Math.min(attempt, retryDelaysMilliseconds.length - 1)
          ],
        ),
      );
    }
  }
  throw lastError;
};

export const createIdempotencyKey = (): string => {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error("Secure random UUID generation is unavailable");
  }
  return globalThis.crypto.randomUUID();
};

export const getGameContent = (locale: "zh-CN" | "en"): Promise<ShooterContent> => {
  return requestJSON<ShooterContent>(
    `/v2/content/v4?locale=${encodeURIComponent(locale)}`,
    { headers: { "Accept-Language": locale } },
    false,
  );
};

export const getGame = (locale: "zh-CN" | "en" = "en"): Promise<ShooterGameSnapshot> =>
  requestJSON<ShooterGameSnapshot>("/v2/game", {
    headers: { "Accept-Language": locale },
  });

export const createRun = (
  body: ShooterCreateRunRequest,
  idempotencyKey: string
): Promise<ShooterGameRun> => postJSON("/v2/runs", body, idempotencyKey);

export const getRun = (runId: string): Promise<ShooterGameRun> => {
  return requestJSON<ShooterGameRun>(`/v2/runs/${encodeURIComponent(runId)}`);
};

export const createRunCommand = (
  runId: string,
  body: ShooterRunCommand,
  idempotencyKey: string
): Promise<ShooterRunCommandResponse> => {
  return postJSON(
    `/v2/runs/${encodeURIComponent(runId)}/commands`,
    body,
    idempotencyKey,
    body.type === "complete_segment"
      ? encounterReplayTimeoutMilliseconds
      : requestTimeoutMilliseconds,
    body.type === "complete_segment" ? encounterReplayAttempts : 1,
  );
};
