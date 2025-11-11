import { put } from '@vercel/blob';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Upload character assets to Vercel Blob and generate configuration
 * 
 * Usage:
 * 1. Place your asset files in a local directory (e.g., ./assets/)
 * 2. Set BLOB_READ_WRITE_TOKEN environment variable
 * 3. Run: BLOB_READ_WRITE_TOKEN=xxx tsx scripts/upload-assets.ts ./assets
 */

const ASSET_PAIRS = [
  { slug: 'nana7mi', name: '七海Nana7mi', portrait: 'nana7mi-portrait', model: 'nana7mi-model' },
  { slug: 'xingtong', name: '星瞳', portrait: 'xingtong-portrait', model: 'xingtong-model' },
  { slug: 'jiaran', name: '嘉然', portrait: 'jiaran-portrait', model: 'jiaran-model' },
  { slug: 'bella', name: '贝拉', portrait: 'bella-portrait', model: 'bella-model' },
  { slug: 'lulu', name: 'lulu', portrait: 'lulu-portrait', model: 'lulu-model' },
  { slug: 'xiangwan', name: '向晚', portrait: 'xiangwan-portrait', model: 'xiangwan-model' },
  { slug: 'nailu', name: '奶绿', portrait: 'nailu-portrait', model: 'nailu-model' }
];

type UploadResult = {
  readonly slug: string;
  readonly name: string;
  readonly portraitUrl: string;
  readonly modelUrl: string;
};

const findFileWithExtension = (dir: string, baseName: string): string | null => {
  const extensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
  const files = readdirSync(dir);
  
  for (const ext of extensions) {
    const fileName = `${baseName}${ext}`;
    if (files.includes(fileName)) {
      return fileName;
    }
  }
  
  return null;
};

const uploadAsset = async (filePath: string, fileName: string): Promise<string> => {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  
  if (!token) {
    throw new Error('BLOB_READ_WRITE_TOKEN environment variable is required');
  }
  
  const fileBuffer = readFileSync(filePath);
  const blob = new Blob([fileBuffer]);
  
  console.log(`  Uploading ${fileName}...`);
  
  const result = await put(fileName, blob, {
    access: 'public',
    token
  });
  
  console.log(`  ✓ Uploaded: ${result.url}`);
  return result.url;
};

const uploadCharacterAssets = async (assetsDir: string): Promise<readonly UploadResult[]> => {
  const results: UploadResult[] = [];
  
  for (const character of ASSET_PAIRS) {
    console.log(`\n📸 Processing ${character.name}...`);
    
    // Find portrait file
    const portraitFile = findFileWithExtension(assetsDir, character.portrait);
    if (!portraitFile) {
      console.error(`  ✗ Portrait not found for ${character.name} (looking for ${character.portrait}.*)`);
      continue;
    }
    
    // Find model file
    const modelFile = findFileWithExtension(assetsDir, character.model);
    if (!modelFile) {
      console.error(`  ✗ Model not found for ${character.name} (looking for ${character.model}.*)`);
      continue;
    }
    
    // Upload both files
    const portraitUrl = await uploadAsset(join(assetsDir, portraitFile), portraitFile);
    const modelUrl = await uploadAsset(join(assetsDir, modelFile), modelFile);
    
    results.push({
      slug: character.slug,
      name: character.name,
      portraitUrl,
      modelUrl
    });
  }
  
  return results;
};

const generateUpdateSQL = (results: readonly UploadResult[]): string => {
  const updates = results.map((char) => {
    return `UPDATE "Character" SET "portraitUrl" = '${char.portraitUrl}', "spriteUrl" = '${char.modelUrl}' WHERE slug = '${char.slug}';`;
  });
  
  return updates.join('\n');
};

const main = async (): Promise<void> => {
  const assetsDir = process.argv[2];
  
  if (!assetsDir) {
    console.error('Usage: BLOB_READ_WRITE_TOKEN=xxx tsx scripts/upload-assets.ts <assets-directory>');
    process.exit(1);
  }
  
  console.log('🚀 Starting asset upload to Vercel Blob...\n');
  console.log(`Assets directory: ${assetsDir}`);
  console.log(`Expected files: ${ASSET_PAIRS.length * 2} total (portrait + model for each character)\n`);
  
  try {
    const results = await uploadCharacterAssets(assetsDir);
    
    console.log('\n✨ Upload complete!\n');
    console.log('📊 Summary:');
    console.log(`  Uploaded: ${results.length * 2} files`);
    console.log(`  Characters: ${results.length}/${ASSET_PAIRS.length}\n`);
    
    if (results.length > 0) {
      console.log('📝 Database Update SQL:');
      console.log('Copy and paste this into your SQL client or Prisma Studio:\n');
      console.log(generateUpdateSQL(results));
      console.log('\n');
    }
    
    if (results.length < ASSET_PAIRS.length) {
      console.error('⚠️  Some characters were skipped due to missing files');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Upload failed:', error);
    process.exit(1);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

