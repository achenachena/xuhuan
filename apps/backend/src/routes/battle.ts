import type { FastifyPluginAsync } from "fastify";
import { BattleOutcome } from "@prisma/client";
import { z } from "zod";

import { resolveBattle, startBattle } from "../services/battle-service.js";

const battleStartBodySchema = z.object({
  encounterSlug: z.string().min(1),
  seed: z.string().optional()
});

type BattleStartBody = z.infer<typeof battleStartBodySchema>;

const encounterSchema = z.object({
  slug: z.string(),
  name: z.string(),
  level: z.number(),
  maxHealth: z.number(),
  attack: z.number(),
  defense: z.number(),
  speed: z.number(),
  critRate: z.number(),
  critDamage: z.number()
});

const battleStartResponseSchema = z.object({
  runId: z.string(),
  seed: z.string(),
  encounter: encounterSchema
});

const rewardsSchema = z.object({
  experience: z.number().int().min(0).default(0),
  credits: z.number().int().min(0).default(0)
});

const logEntrySchema = z.record(z.string(), z.unknown());

const battleResolveBodySchema = z.object({
  runId: z.string().min(1),
  outcome: z.nativeEnum(BattleOutcome),
  rewards: rewardsSchema.default({
    experience: 0,
    credits: 0
  }),
  log: z.array(logEntrySchema).optional()
});

type BattleResolveBody = z.infer<typeof battleResolveBodySchema>;

const battleResolveResponseSchema = z.object({
  runId: z.string(),
  outcome: z.nativeEnum(BattleOutcome),
  rewards: rewardsSchema
});

export const battleRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/battle/start",
    {
      schema: {
        body: battleStartBodySchema,
        response: {
          200: battleStartResponseSchema
        }
      }
    },
    async (request, reply) => {
      if (!request.telegramUser) {
        reply.unauthorized("Missing Telegram signature");
        return;
      }
      const body = request.body as BattleStartBody;
      const payload = await startBattle({
        telegramId: request.telegramUser.id,
        username: request.telegramUser.username,
        encounterSlug: body.encounterSlug,
        seed: body.seed
      });
      return payload;
    }
  );

  fastify.post(
    "/battle/resolve",
    {
      schema: {
        body: battleResolveBodySchema,
        response: {
          200: battleResolveResponseSchema
        }
      }
    },
    async (request, reply) => {
      if (!request.telegramUser) {
        reply.unauthorized("Missing Telegram signature");
        return;
      }
      const body = request.body as BattleResolveBody;
      const result = await resolveBattle({
        telegramId: request.telegramUser.id,
        username: request.telegramUser.username,
        runId: body.runId,
        outcome: body.outcome,
        rewards: body.rewards,
        log: body.log
      });
      return result;
    }
  );
};

export default battleRoutes;

