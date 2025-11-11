import crypto from "node:crypto";

import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { env } from "../env.js";

const TELEGRAM_HEADER = "x-telegram-init-data";

const telegramUserSchema = z.object({
  id: z.number(),
  username: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  language_code: z.string().optional()
});

type TelegramUser = {
  readonly id: number;
  readonly username?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly languageCode?: string;
};

type TelegramAuthPluginOptions = {
  readonly publicRoutes?: readonly string[];
};

declare module "fastify" {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface FastifyRequest {
    telegramUser?: TelegramUser;
    telegramInitData?: Record<string, unknown>;
  }
}

const buildSecretKey = (): Buffer => {
  return crypto.createHmac("sha256", "WebAppData").update(env.TELEGRAM_BOT_TOKEN).digest();
};

const timingSafeEqual = (expected: string, actual: string): boolean => {
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");
  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
};

const parseInitData = (payload: string): URLSearchParams => {
  try {
    return new URLSearchParams(payload);
  } catch (error) {
    throw new Error("Invalid Telegram init payload", { cause: error });
  }
};

const buildDataCheckString = (params: URLSearchParams): string => {
  const entries: string[] = [];
  params.forEach((value, key) => {
    if (key === "hash") {
      return;
    }
    entries.push(`${key}=${value}`);
  });
  entries.sort();
  return entries.join("\n");
};

const verifySignature = (params: URLSearchParams, secretKey: Buffer): void => {
  const hash = params.get("hash");
  if (!hash) {
    throw new Error("Init data missing hash parameter");
  }
  const dataCheckString = buildDataCheckString(params);
  const computed = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  const isValid = timingSafeEqual(computed, hash);
  if (!isValid) {
    throw new Error("Telegram init data signature mismatch");
  }
};

const mapTelegramUser = (raw: unknown): TelegramUser => {
  const parsed = telegramUserSchema.parse(raw);
  return {
    id: parsed.id,
    username: parsed.username,
    firstName: parsed.first_name,
    lastName: parsed.last_name,
    languageCode: parsed.language_code
  };
};

const buildTelegramAuthPlugin = (): FastifyPluginAsync<TelegramAuthPluginOptions> => {
  const secretKey = buildSecretKey();
  const isDevelopment = env.NODE_ENV === "development";

  return async (fastify, options) => {
    const publicRoutes = new Set(options.publicRoutes ?? []);

    fastify.decorateRequest("telegramUser", undefined);
    fastify.decorateRequest("telegramInitData", undefined);

    fastify.addHook("preHandler", async (request, reply) => {
      if (request.method === "OPTIONS") {
        return;
      }
      if (publicRoutes.has(request.routerPath ?? "")) {
        return;
      }

      const rawHeader = request.headers[TELEGRAM_HEADER];

      // Development mode: inject mock user for local testing
      if (isDevelopment && !rawHeader) {
        // No Telegram header in dev mode - inject mock user
        request.telegramUser = {
          id: 123456789,
          username: "dev_user",
          firstName: "Dev",
          lastName: "User",
          languageCode: "en"
        };
        request.telegramInitData = {
          user: JSON.stringify({ id: 123456789, username: "dev_user" }),
          auth_date: Date.now().toString()
        };
        request.log.debug("Using mock Telegram user for development");
        return;
      }

      if (typeof rawHeader !== "string") {
        reply.unauthorized("Missing Telegram init data");
        return;
      }
      try {
        const params = parseInitData(rawHeader);
        verifySignature(params, secretKey);
        const userParam = params.get("user");
        if (!userParam) {
          reply.unauthorized("Missing Telegram user payload");
          return;
        }
        const parsedUser = mapTelegramUser(JSON.parse(userParam));
        request.telegramUser = parsedUser;
        const initData: Record<string, unknown> = {};
        params.forEach((value, key) => {
          initData[key] = value;
        });
        request.telegramInitData = initData;
      } catch (error) {
        request.log.warn({ err: error }, "Telegram authentication failed");
        reply.unauthorized("Invalid Telegram signature");
      }
    });
  };
};

export const telegramAuthPlugin = fp(buildTelegramAuthPlugin(), {
  name: "telegram-auth"
});

export type TelegramAuthPlugin = typeof telegramAuthPlugin;

