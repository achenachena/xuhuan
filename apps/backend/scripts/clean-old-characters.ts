import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const NEW_CHARACTER_SLUGS = [
  'nana7mi',    // 七海Nana7mi
  'xingtong',   // 星瞳
  'jiaran',     // 嘉然
  'bella',      // 贝拉
  'lulu',       // lulu
  'xiangwan',   // 向晚
  'nailu'       // 奶绿
];

const cleanOldCharacters = async (): Promise<void> => {
  console.log('🗑️  Cleaning old placeholder characters...\n');
  
  // Get all current characters
  const allCharacters = await prisma.character.findMany({
    select: {
      slug: true,
      name: true
    },
    orderBy: {
      name: 'asc'
    }
  });
  
  console.log(`📊 Current characters in database: ${allCharacters.length}`);
  allCharacters.forEach((char) => {
    const isNew = NEW_CHARACTER_SLUGS.includes(char.slug);
    console.log(`  ${isNew ? '✓' : '✗'} ${char.name} (${char.slug})`);
  });
  
  // Find characters to delete
  const toDelete = allCharacters.filter(
    (char) => !NEW_CHARACTER_SLUGS.includes(char.slug)
  );
  
  if (toDelete.length === 0) {
    console.log('\n✨ No old characters to delete. Database is clean!');
    return;
  }
  
  console.log(`\n🗑️  Deleting ${toDelete.length} old characters:`);
  toDelete.forEach((char) => {
    console.log(`  - ${char.name} (${char.slug})`);
  });
  
  // Delete old characters
  const result = await prisma.character.deleteMany({
    where: {
      slug: {
        notIn: NEW_CHARACTER_SLUGS
      }
    }
  });
  
  console.log(`\n✅ Deleted ${result.count} old characters`);
  
  // Show remaining characters
  const remaining = await prisma.character.findMany({
    select: {
      slug: true,
      name: true
    },
    orderBy: {
      name: 'asc'
    }
  });
  
  console.log(`\n📋 Remaining characters: ${remaining.length}`);
  remaining.forEach((char) => {
    console.log(`  ✓ ${char.name} (${char.slug})`);
  });
};

const main = async (): Promise<void> => {
  try {
    await cleanOldCharacters();
  } catch (error) {
    console.error('❌ Error cleaning characters:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

