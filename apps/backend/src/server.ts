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
import characterRoutes from "./routes/character.js";
import adminCharacterRoutes from "./routes/admin-character.js";

const healthResponseSchema = z.object({
  status: z.literal("ok"),
  uptime: z.number(),
  version: z.string()
});

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

  app.register(sensible);
  app.register(cors, {
    origin: true, // Allow all origins for now - character endpoints are public
    credentials: true
  });
  app.register(telegramAuthPlugin, {
    publicRoutes: [
      "/health",
      "/characters",
      "/characters/:slug",
      "/characters/:slug/stats",
      "/admin/characters",
      "/admin/characters/:slug"
    ]
  });
  app.register(playerRoutes);
  app.register(battleRoutes);
  app.register(characterRoutes);
  app.register(adminCharacterRoutes);

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

