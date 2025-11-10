import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { applyPlayerProgress, getOrCreatePlayer } from "../services/player-service.js";

const playerPayloadSchema = z.object({
  id: z.string(),
  username: z.string(),
  level: z.number(),
  experience: z.number(),
  credits: z.number(),
  energy: z.number()
});

const progressBodySchema = z.object({
  experienceDelta: z.number().int().min(-100_000).max(200_000).default(0),
  creditsDelta: z.number().int().min(-500_000).max(500_000).default(0),
  energyDelta: z.number().int().min(-180).max(180).default(0),
  level: z.number().int().min(1).optional()
});

type ProgressBody = z.infer<typeof progressBodySchema>;

export const playerRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/player",
    {
      schema: {
        response: {
          200: z.object({
            player: playerPayloadSchema
          })
        }
      }
    },
    async (request, reply) => {
      if (!request.telegramUser) {
        reply.unauthorized("Missing Telegram signature");
        return;
      }
      const player = await getOrCreatePlayer({
        telegramId: request.telegramUser.id,
        username: request.telegramUser.username
      });
      return { player };
    }
  );

  fastify.post(
    "/player/progress",
    {
      schema: {
        body: progressBodySchema,
        response: {
          200: z.object({
            player: playerPayloadSchema
          })
        }
      }
    },
    async (request, reply) => {
      if (!request.telegramUser) {
        reply.unauthorized("Missing Telegram signature");
        return;
      }
      const body = request.body as ProgressBody;
      const player = await applyPlayerProgress({
        telegramId: request.telegramUser.id,
        username: request.telegramUser.username,
        experienceDelta: body.experienceDelta,
        creditsDelta: body.creditsDelta,
        energyDelta: body.energyDelta,
        level: body.level
      });
      return { player };
    }
  );
};

export default playerRoutes;

