import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CHARACTERS = [
  {
    slug: "sakura-hime",
    name: "Sakura Hime",
    vtuberArchetype: "idol",
    bio: "Charming idol who fights with the power of her fans. Her melodious voice can heal allies or devastate enemies with sonic waves.",
    portraitBlobPath: "https://placeholder.blob.vercel-storage.com/sakura-hime-portrait.png",
    modelBlobPath: "https://placeholder.blob.vercel-storage.com/sakura-hime-model.png",
    baseHealth: 100,
    baseAttack: 28,
    baseDefense: 22,
    baseSpeed: 18,
    baseCritRate: 0.12,
    baseCritDamage: 0.45,
    specialMoveName: "Idol's Encore",
    specialMoveDesc: "Unleashes a powerful sound wave that damages enemies and builds combo meter faster",
    specialMoveType: "sound",
    rarity: "epic",
    colorTheme: "#FF69B4" // Hot pink
  },
  {
    slug: "kuro-yami",
    name: "Kuro Yami",
    vtuberArchetype: "gamer",
    bio: "Pro gamer with lightning reflexes. Master of combos and precise timing, she never misses a frame-perfect input.",
    portraitBlobPath: "https://placeholder.blob.vercel-storage.com/kuro-yami-portrait.png",
    modelBlobPath: "https://placeholder.blob.vercel-storage.com/kuro-yami-model.png",
    baseHealth: 90,
    baseAttack: 35,
    baseDefense: 18,
    baseSpeed: 20,
    baseCritRate: 0.18,
    baseCritDamage: 0.60,
    specialMoveName: "Rage Quit Combo",
    specialMoveDesc: "Button mash fury that chains multiple hits with increasing damage",
    specialMoveType: "lightning",
    rarity: "legendary",
    colorTheme: "#9D4EDD" // Purple
  },
  {
    slug: "mizuki-nami",
    name: "Mizuki Nami",
    vtuberArchetype: "seiso",
    bio: "Sweet and innocent... or is she? Her angelic demeanor hides devastating power. Don't be fooled by appearances.",
    portraitBlobPath: "https://placeholder.blob.vercel-storage.com/mizuki-nami-portrait.png",
    modelBlobPath: "https://placeholder.blob.vercel-storage.com/mizuki-nami-model.png",
    baseHealth: 110,
    baseAttack: 26,
    baseDefense: 28,
    baseSpeed: 15,
    baseCritRate: 0.10,
    baseCritDamage: 0.40,
    specialMoveName: "Seiso Beam",
    specialMoveDesc: "Purifying light that deals massive damage and breaks through blocks",
    specialMoveType: "water",
    rarity: "rare",
    colorTheme: "#87CEEB" // Sky blue
  },
  {
    slug: "akane-blaze",
    name: "Akane Blaze",
    vtuberArchetype: "chaotic",
    bio: "Unpredictable agent of chaos. Every fight is a gamble - high risk, high reward. Embraces the madness.",
    portraitBlobPath: "https://placeholder.blob.vercel-storage.com/akane-blaze-portrait.png",
    modelBlobPath: "https://placeholder.blob.vercel-storage.com/akane-blaze-model.png",
    baseHealth: 85,
    baseAttack: 40,
    baseDefense: 15,
    baseSpeed: 22,
    baseCritRate: 0.20,
    baseCritDamage: 0.70,
    specialMoveName: "Chaos Inferno",
    specialMoveDesc: "Explosive attack with random damage multiplier between 1.5x and 3.0x",
    specialMoveType: "fire",
    rarity: "legendary",
    colorTheme: "#FF4500" // Orange red
  },
  {
    slug: "luna-eclipse",
    name: "Luna Eclipse",
    vtuberArchetype: "apex-predator",
    bio: "Top of the food chain. A calculating hunter who never wastes a move. Her presence alone intimidates opponents.",
    portraitBlobPath: "https://placeholder.blob.vercel-storage.com/luna-eclipse-portrait.png",
    modelBlobPath: "https://placeholder.blob.vercel-storage.com/luna-eclipse-model.png",
    baseHealth: 105,
    baseAttack: 32,
    baseDefense: 24,
    baseSpeed: 19,
    baseCritRate: 0.15,
    baseCritDamage: 0.55,
    specialMoveName: "Shadow Devour",
    specialMoveDesc: "Dark energy drain that damages enemy and heals self for 30% of damage dealt",
    specialMoveType: "shadow",
    rarity: "epic",
    colorTheme: "#4B0082" // Indigo
  },
  {
    slug: "hoshi-star",
    name: "Hoshi Star",
    vtuberArchetype: "artist",
    bio: "Paints the battlefield with light. Every move is a brushstroke of brilliance. Her art inspires hope and fear.",
    portraitBlobPath: "https://placeholder.blob.vercel-storage.com/hoshi-star-portrait.png",
    modelBlobPath: "https://placeholder.blob.vercel-storage.com/hoshi-star-model.png",
    baseHealth: 95,
    baseAttack: 30,
    baseDefense: 20,
    baseSpeed: 17,
    baseCritRate: 0.16,
    baseCritDamage: 0.50,
    specialMoveName: "Starlight Canvas",
    specialMoveDesc: "Artistic explosion that creates lingering star effects, dealing damage over time",
    specialMoveType: "star",
    rarity: "rare",
    colorTheme: "#FFD700" // Gold
  }
];

const seedCharacters = async (): Promise<void> => {
  console.log("🌟 Seeding VTuber characters...");

  for (const character of CHARACTERS) {
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
    await seedCharacters();
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
