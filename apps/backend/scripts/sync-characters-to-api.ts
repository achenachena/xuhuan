#!/usr/bin/env tsx
/**
 * Sync characters from local config to production database via Admin API
 *
 * Usage:
 *   ADMIN_TOKEN=xxx API_URL=https://your-api.railway.app tsx scripts/sync-characters-to-api.ts
 *
 * Or with npm script:
 *   ADMIN_TOKEN=xxx API_URL=https://your-api.railway.app npm run sync:characters
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

const uploadCharacter = async (
  character: CharacterConfig,
  apiUrl: string,
  adminToken: string
): Promise<void> => {
  const response = await fetch(`${apiUrl}/admin/characters`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": adminToken
    },
    body: JSON.stringify(character)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`Failed to upload ${character.name}: ${errorData.error || response.statusText}`);
  }

  const data = await response.json();
  return data;
};

const main = async (): Promise<void> => {
  const apiUrl = process.env.API_URL;
  const adminToken = process.env.ADMIN_TOKEN;
  const configPath = process.env.CHARACTER_CONFIG_PATH || "./config/character-roster.json";

  if (!apiUrl) {
    throw new Error("API_URL environment variable is required");
  }

  if (!adminToken) {
    throw new Error("ADMIN_TOKEN environment variable is required");
  }

  console.log(`🌟 Loading characters from: ${configPath}`);
  const characters = loadCharacterConfig(configPath);
  console.log(`📋 Found ${characters.length} characters to upload`);
  console.log(`🎯 Target API: ${apiUrl}`);
  console.log("");

  let successCount = 0;
  let failureCount = 0;

  for (const character of characters) {
    try {
      await uploadCharacter(character, apiUrl, adminToken);
      console.log(`✅ Uploaded: ${character.name}`);
      successCount++;
    } catch (error) {
      console.error(`❌ Failed: ${character.name}`);
      if (error instanceof Error) {
        console.error(`   ${error.message}`);
      }
      failureCount++;
    }
  }

  console.log("");
  console.log(`✨ Sync complete: ${successCount} succeeded, ${failureCount} failed`);

  if (failureCount > 0) {
    process.exit(1);
  }
};

main().catch((error) => {
  console.error("❌ Error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
