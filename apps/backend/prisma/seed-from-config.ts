import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const prisma = new PrismaClient();

type CharacterConfig = {
  readonly slug: string;
  readonly name: string;
  readonly vtuberArchetype: string;
  readonly bio: string;
  readonly portraitBlobPath: string;
  readonly modelBlobPath: string;
  readonly baseHealth: number;
  readonly baseAttack: number;
  readonly baseDefense: number;
  readonly baseSpeed: number;
  readonly baseCritRate: number;
  readonly baseCritDamage: number;
  readonly specialMoveName: string;
  readonly specialMoveDesc: string;
  readonly specialMoveType: string;
  readonly rarity: string;
  readonly colorTheme: string;
};

const loadCharacterConfig = (configPath: string): readonly CharacterConfig[] => {
  try {
    const absolutePath = resolve(configPath);
    const fileContent = readFileSync(absolutePath, "utf-8");
    const characters = JSON.parse(fileContent) as CharacterConfig[];
    
    if (!Array.isArray(characters)) {
      throw new Error("Config file must contain an array of characters");
    }
    
    return characters;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load character config: ${error.message}`);
    }
    throw error;
  }
};

const seedCharactersFromConfig = async (configPath: string): Promise<void> => {
  console.log(`🌟 Loading character config from: ${configPath}`);
  
  const characters = loadCharacterConfig(configPath);
  console.log(`📋 Found ${characters.length} characters to seed`);

  for (const character of characters) {
    const existing = await prisma.character.findUnique({
      where: { slug: character.slug }
    });

    if (existing) {
      console.log(`✓ Character "${character.name}" already exists, updating...`);
      await prisma.character.update({
        where: { slug: character.slug },
        data: character
      });
    } else {
      console.log(`+ Creating character "${character.name}"...`);
      await prisma.character.create({
        data: character
      });
    }
  }

  console.log("✨ Character seeding complete!");
};

const main = async (): Promise<void> => {
  try {
    // Get config path from environment variable or command line argument
    const configPath = process.env.CHARACTER_CONFIG_PATH || process.argv[2] || "./config/character-roster.json";
    
    await seedCharactersFromConfig(configPath);
  } catch (error) {
    console.error("Error seeding characters:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

