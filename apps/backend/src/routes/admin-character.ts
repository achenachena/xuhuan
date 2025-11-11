import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { env } from "../env.js";

const characterUpsertSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  vtuberArchetype: z.string().min(1),
  bio: z.string().min(1),
  portraitBlobPath: z.string().min(1),
  modelBlobPath: z.string().min(1),
  baseHealth: z.number().int().positive(),
  baseAttack: z.number().int().positive(),
  baseDefense: z.number().int().positive(),
  baseSpeed: z.number().int().positive(),
  baseCritRate: z.number().min(0).max(1).default(0.1),
  baseCritDamage: z.number().min(0).default(0.5),
  specialMoveName: z.string().min(1),
  specialMoveDesc: z.string().min(1),
  specialMoveType: z.string().min(1),
  rarity: z.enum(["common", "rare", "epic", "legendary"]).default("common"),
  colorTheme: z.string().regex(/^#[0-9A-Fa-f]{6}$/)
});

const characterUpdateSchema = characterUpsertSchema.partial().omit({ slug: true });

const adminCharacterRoutes: FastifyPluginAsync = async (app): Promise<void> => {
  // Admin authentication middleware
  const verifyAdminToken = async (request: any, reply: any): Promise<void> => {
    const token = request.headers["x-admin-token"];
    
    if (!token || token !== env.CHARACTER_ADMIN_TOKEN) {
      return reply.status(401).send({
        success: false,
        error: "Unauthorized: Invalid admin token"
      });
    }
  };

  // List all characters with raw blob paths (for admin management)
  app.get("/admin/characters", {
    preHandler: verifyAdminToken
  }, async (request, reply) => {
    try {
      const characters = await prisma.character.findMany({
        orderBy: {
          name: "asc"
        }
      });
      
      return reply.status(200).send({
        success: true,
        characters
      });
    } catch (error) {
      app.log.error(error, "Failed to list characters for admin");
      return reply.status(500).send({
        success: false,
        error: "Failed to list characters"
      });
    }
  });

  // Create or update character (upsert)
  app.post("/admin/characters", {
    preHandler: verifyAdminToken
  }, async (request, reply) => {
    try {
      const validation = characterUpsertSchema.safeParse(request.body);
      
      if (!validation.success) {
        return reply.status(400).send({
          success: false,
          error: "Invalid character data",
          details: validation.error.errors
        });
      }

      const data = validation.data;
      
      const character = await prisma.character.upsert({
        where: { slug: data.slug },
        update: data,
        create: data
      });

      return reply.status(200).send({
        success: true,
        character
      });
    } catch (error) {
      app.log.error(error, "Failed to upsert character");
      return reply.status(500).send({
        success: false,
        error: "Failed to upsert character"
      });
    }
  });

  // Update specific character by slug
  app.patch("/admin/characters/:slug", {
    preHandler: verifyAdminToken
  }, async (request, reply) => {
    try {
      const { slug } = request.params as { slug: string };
      const validation = characterUpdateSchema.safeParse(request.body);
      
      if (!validation.success) {
        return reply.status(400).send({
          success: false,
          error: "Invalid character data",
          details: validation.error.errors
        });
      }

      const data = validation.data;
      
      // Check if character exists
      const existing = await prisma.character.findUnique({
        where: { slug }
      });
      
      if (!existing) {
        return reply.status(404).send({
          success: false,
          error: "Character not found"
        });
      }

      const character = await prisma.character.update({
        where: { slug },
        data
      });

      return reply.status(200).send({
        success: true,
        character
      });
    } catch (error) {
      app.log.error(error, "Failed to update character");
      return reply.status(500).send({
        success: false,
        error: "Failed to update character"
      });
    }
  });

  // Delete character by slug
  app.delete("/admin/characters/:slug", {
    preHandler: verifyAdminToken
  }, async (request, reply) => {
    try {
      const { slug } = request.params as { slug: string };
      
      await prisma.character.delete({
        where: { slug }
      });

      return reply.status(200).send({
        success: true,
        message: "Character deleted successfully"
      });
    } catch (error) {
      app.log.error(error, "Failed to delete character");
      return reply.status(500).send({
        success: false,
        error: "Failed to delete character"
      });
    }
  });
};

export default adminCharacterRoutes;

