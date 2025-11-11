import type { Character as PrismaCharacter } from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { getAssetUrl } from "./asset-service.js";

type CharacterAttributes = {
  readonly maxHealth: number;
  readonly attack: number;
  readonly defense: number;
  readonly speed: number;
  readonly critRate: number;
  readonly critDamage: number;
};

// Character DTO with signed URLs for frontend consumption
type Character = Omit<PrismaCharacter, "portraitBlobPath" | "modelBlobPath"> & {
  readonly portraitUrl: string;
  readonly spriteUrl: string;
};

type CharacterWithScaledStats = Character & {
  readonly scaledAttributes: CharacterAttributes;
};

const calculateScaledStat = (baseStat: number, level: number): number => {
  // Simple linear scaling: base * (1 + (level - 1) * 0.15)
  const scalingFactor = 1 + (level - 1) * 0.15;
  return Math.round(baseStat * scalingFactor);
};

/**
 * Maps a Prisma character to a Character DTO with asset URLs
 * Note: portraitBlobPath and modelBlobPath should contain full Vercel Blob URLs
 */
const mapCharacterToDto = (prismaCharacter: PrismaCharacter): Character => {
  const portraitUrl = getAssetUrl(prismaCharacter.portraitBlobPath);
  const spriteUrl = getAssetUrl(prismaCharacter.modelBlobPath);

  const { portraitBlobPath, modelBlobPath, ...rest } = prismaCharacter;

  return {
    ...rest,
    portraitUrl,
    spriteUrl
  };
};

export const listCharacters = async (): Promise<readonly Character[]> => {
  const prismaCharacters = await prisma.character.findMany({
    orderBy: {
      name: "asc"
    }
  });
  
  const characters = prismaCharacters.map((char) => mapCharacterToDto(char));
  
  return characters;
};

export const getCharacterBySlug = async (slug: string): Promise<Character | null> => {
  const prismaCharacter = await prisma.character.findUnique({
    where: { slug }
  });
  
  if (!prismaCharacter) {
    return null;
  }
  
  return mapCharacterToDto(prismaCharacter);
};

export const generateCharacterStats = (character: Character, level: number): CharacterAttributes => {
  return {
    maxHealth: calculateScaledStat(character.baseHealth, level),
    attack: calculateScaledStat(character.baseAttack, level),
    defense: calculateScaledStat(character.baseDefense, level),
    speed: calculateScaledStat(character.baseSpeed, level),
    critRate: character.baseCritRate,
    critDamage: character.baseCritDamage
  };
};

export const getCharacterWithScaledStats = async (
  slug: string,
  level: number
): Promise<CharacterWithScaledStats | null> => {
  const character = await getCharacterBySlug(slug);
  if (!character) {
    return null;
  }

  const scaledAttributes = generateCharacterStats(character, level);

  return {
    ...character,
    scaledAttributes
  };
};

// Export Character type for use in routes
export type { Character };
