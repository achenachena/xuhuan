import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { listCharacters, getCharacterBySlug, getCharacterWithScaledStats } from "../services/character-service.js";

const getCharacterSchema = z.object({
  slug: z.string().min(1)
});

const getCharacterWithStatsSchema = z.object({
  slug: z.string().min(1),
  level: z.number().int().min(1).max(100).default(1)
});

const characterRoutes: FastifyPluginAsync = async (app): Promise<void> => {
  // List all characters
  app.get("/characters", async (request, reply) => {
    try {
      const characters = await listCharacters();
      return reply.status(200).send({
        success: true,
        characters
      });
    } catch (error) {
      app.log.error(error, "Failed to list characters");
      return reply.status(500).send({
        success: false,
        error: "Failed to list characters"
      });
    }
  });

  // Get specific character by slug
  app.get("/characters/:slug", async (request, reply) => {
    try {
      const params = getCharacterSchema.parse(request.params);
      const character = await getCharacterBySlug(params.slug);

      if (!character) {
        return reply.status(404).send({
          success: false,
          error: "Character not found"
        });
      }

      return reply.status(200).send({
        success: true,
        character
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: "Invalid parameters"
        });
      }
      app.log.error(error, "Failed to get character");
      return reply.status(500).send({
        success: false,
        error: "Failed to get character"
      });
    }
  });

  // Get character with scaled stats for a specific level
  app.get("/characters/:slug/stats", async (request, reply) => {
    try {
      const params = getCharacterSchema.parse(request.params);
      const query = request.query as { level?: string };
      const level = query.level ? parseInt(query.level, 10) : 1;

      const validation = getCharacterWithStatsSchema.safeParse({
        slug: params.slug,
        level
      });

      if (!validation.success) {
        return reply.status(400).send({
          success: false,
          error: "Invalid parameters"
        });
      }

      const character = await getCharacterWithScaledStats(
        validation.data.slug,
        validation.data.level
      );

      if (!character) {
        return reply.status(404).send({
          success: false,
          error: "Character not found"
        });
      }

      return reply.status(200).send({
        success: true,
        character
      });
    } catch (error) {
      app.log.error(error, "Failed to get character with stats");
      return reply.status(500).send({
        success: false,
        error: "Failed to get character with stats"
      });
    }
  });
};

export default characterRoutes;
