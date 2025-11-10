import type { PrismaClient, Character } from "@prisma/client";

type CharacterAttributes = {
  readonly maxHealth: number;
  readonly attack: number;
  readonly defense: number;
  readonly speed: number;
  readonly critRate: number;
  readonly critDamage: number;
};

type CharacterWithScaledStats = Character & {
  readonly scaledAttributes: CharacterAttributes;
};

const calculateScaledStat = (baseStat: number, level: number): number => {
  // Simple linear scaling: base * (1 + (level - 1) * 0.15)
  const scalingFactor = 1 + (level - 1) * 0.15;
  return Math.round(baseStat * scalingFactor);
};

export const listCharacters = async (prisma: PrismaClient): Promise<readonly Character[]> => {
  const characters = await prisma.character.findMany({
    orderBy: {
      name: "asc"
    }
  });
  return characters;
};

export const getCharacterBySlug = async (
  prisma: PrismaClient,
  slug: string
): Promise<Character | null> => {
  const character = await prisma.character.findUnique({
    where: { slug }
  });
  return character;
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
  prisma: PrismaClient,
  slug: string,
  level: number
): Promise<CharacterWithScaledStats | null> => {
  const character = await getCharacterBySlug(prisma, slug);
  if (!character) {
    return null;
  }

  const scaledAttributes = generateCharacterStats(character, level);

  return {
    ...character,
    scaledAttributes
  };
};
