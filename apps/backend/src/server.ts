import Fastify from "fastify";
import type {
  FastifyBaseLogger,
  FastifyInstance,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault
} from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { env } from "./env.js";
import { telegramAuthPlugin } from "./plugins/telegram-auth.js";
import battleRoutes from "./routes/battle.js";
import playerRoutes from "./routes/player.js";

const TELEGRAM_ORIGIN_FALLBACKS = Object.freeze([
  "https://web.telegram.org",
  "https://web.telegram.org/a/",
  "https://telegram.org"
]);

const healthResponseSchema = z.object({
  status: z.literal("ok"),
  uptime: z.number(),
  version: z.string()
});

type OriginCallback = (err: Error | null, allow: boolean) => void;
type OriginValidator = (origin: string | undefined, callback: OriginCallback) => void;

const createOriginValidator = (allowedOrigins: ReadonlySet<string>): OriginValidator => {
  return (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Origin ${origin} not allowed`), false);
  };
};

export type AppServer = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  FastifyBaseLogger,
  ZodTypeProvider
>;

export const buildServer = (): AppServer => {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug"
    }
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const originWhitelist = new Set<string>([
    ...TELEGRAM_ORIGIN_FALLBACKS,
    ...env.TELEGRAM_ALLOWED_ORIGINS
  ]);

  app.register(sensible);
  app.register(cors, {
    origin: createOriginValidator(originWhitelist),
    credentials: true
  });
  app.register(telegramAuthPlugin, {
    publicRoutes: ["/health"]
  });
  app.register(playerRoutes);
  app.register(battleRoutes);

  app.get(
    "/health",
    {
      schema: {
        response: {
          200: healthResponseSchema
        }
      }
    },
    async () => {
      return {
        status: "ok" as const,
        uptime: process.uptime(),
        version: env.VERSION
      };
    }
  );

  return app;
};

const registerGracefulShutdown = (server: AppServer): void => {
  const handleSignal = async (signal: NodeJS.Signals): Promise<void> => {
    server.log.info({ signal }, "Received shutdown signal");
    try {
      await server.close();
      process.exit(0);
    } catch (error) {
      server.log.error(error);
      process.exit(1);
    }
  };
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  signals.forEach((signal) => {
    process.on(signal, () => {
      void handleSignal(signal);
    });
  });
};

const startServer = async (): Promise<void> => {
  const server = buildServer();
  registerGracefulShutdown(server);
  try {
    await server.listen({ port: env.PORT, host: "0.0.0.0" });
    server.log.info(`Server listening on port ${env.PORT}`);
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
};

const isMainModule = (): boolean => {
  if (!process.argv[1]) {
    return false;
  }
  const argvUrl = new URL(`file://${process.argv[1]}`).href;
  return import.meta.url === argvUrl;
};

if (isMainModule()) {
  void startServer();
}

