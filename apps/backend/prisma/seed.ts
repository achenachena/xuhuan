import { PrismaClient } from "@prisma/client";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const prisma = new PrismaClient();

const encounters = [
  {
    slug: "training-drone",
    name: "Training Drone",
    level: 2,
    maxHealth: 90,
    attack: 22,
    defense: 18,
    speed: 12,
    critRate: 0.08,
    critDamage: 0.35
  },
  {
    slug: "echo-warlord",
    name: "Echo Warlord",
    level: 5,
    maxHealth: 180,
    attack: 42,
    defense: 28,
    speed: 16,
    critRate: 0.12,
    critDamage: 0.6
  }
] as const;

const seedEncounters = async (): Promise<void> => {
  console.log("🎯 Seeding encounters...");
  await Promise.all(
    encounters.map((encounter) =>
      prisma.encounter.upsert({
        where: { slug: encounter.slug },
        update: {
          name: encounter.name,
          level: encounter.level,
          maxHealth: encounter.maxHealth,
          attack: encounter.attack,
          defense: encounter.defense,
          speed: encounter.speed,
          critRate: encounter.critRate,
          critDamage: encounter.critDamage
        },
        create: encounter
      })
    )
  );
  console.log("✅ Encounters seeded");
};

const seedPlayer = async (): Promise<void> => {
  console.log("👤 Seeding demo player...");
  await prisma.player.upsert({
    where: { id: "demo-player" },
    update: {
      username: "DemoPilot",
      level: 3,
      energy: 120
    },
    create: {
      id: "demo-player",
      username: "DemoPilot",
      level: 3,
      experience: 120,
      credits: 4200,
      energy: 120
    }
  });
  console.log("✅ Demo player seeded");
};

const seedCharacters = async (): Promise<void> => {
  console.log("🌟 Seeding characters...");

  const configPath = resolve("./config/character-roster.json");

  if (existsSync(configPath)) {
    console.log(`📋 Loading characters from config: ${configPath}`);
    try {
      const fileContent = readFileSync(configPath, "utf-8");
      const characters = JSON.parse(fileContent);

      if (!Array.isArray(characters)) {
        throw new Error("Config file must contain an array of characters");
      }

      for (const character of characters) {
        await prisma.character.upsert({
          where: { slug: character.slug },
          update: character,
          create: character
        });
        console.log(`✓ Upserted character: ${character.name}`);
      }
      console.log(`✅ ${characters.length} characters seeded from config`);
    } catch (error) {
      console.error("❌ Failed to load characters from config:", error);
      console.log("⚠️  Continuing without character data");
    }
  } else {
    console.log(`⚠️  No character config found at ${configPath}`);
    console.log("⚠️  Skipping character seeding. Run seed-from-config.ts to seed characters.");
  }
};

const main = async (): Promise<void> => {
  await seedEncounters();
  await seedPlayer();
  await seedCharacters();
};

void main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("Failed to seed database", error);
    await prisma.$disconnect();
    process.exit(1);
  });

