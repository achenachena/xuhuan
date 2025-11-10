import { PrismaClient } from "@prisma/client";

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
};

const seedPlayer = async (): Promise<void> => {
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
};

const main = async (): Promise<void> => {
  await seedEncounters();
  await seedPlayer();
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

