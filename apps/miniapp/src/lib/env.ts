import { z } from "zod";

const urlOrPathValidator = z
  .string()
  .refine(
    (val) => {
      if (!val) {
        return true; // Optional
      }
      // Allow absolute URLs or relative paths starting with /
      return val.startsWith("http://") || val.startsWith("https://") || val.startsWith("/");
    },
    {
      message: "Must be a valid URL or a path starting with /"
    }
  )
  .optional();

const envSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url().optional(),
  // Base URL for all audio files (if all files are in the same location)
  NEXT_PUBLIC_AUDIO_BASE_URL: urlOrPathValidator,
  // BGM URL - single BGM for all pages (select, battle, reward)
  NEXT_PUBLIC_AUDIO_BGM: urlOrPathValidator,
  // Legacy BGM URLs (deprecated, kept for backward compatibility)
  NEXT_PUBLIC_AUDIO_SELECT_BGM: urlOrPathValidator,
  NEXT_PUBLIC_AUDIO_BATTLE_BGM: urlOrPathValidator,
  // Individual audio file URLs (override base URL if provided)
  NEXT_PUBLIC_AUDIO_LIGHT_ATTACK: urlOrPathValidator,
  NEXT_PUBLIC_AUDIO_HEAVY_ATTACK: urlOrPathValidator,
  NEXT_PUBLIC_AUDIO_SPECIAL_MOVE: urlOrPathValidator,
  NEXT_PUBLIC_AUDIO_BLOCK: urlOrPathValidator,
  NEXT_PUBLIC_AUDIO_DAMAGE: urlOrPathValidator,
  NEXT_PUBLIC_AUDIO_VICTORY: urlOrPathValidator,
  NEXT_PUBLIC_AUDIO_DEFEAT: urlOrPathValidator,
  NEXT_PUBLIC_AUDIO_COMBO: urlOrPathValidator
});

export const env = envSchema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_AUDIO_BASE_URL: process.env.NEXT_PUBLIC_AUDIO_BASE_URL,
  NEXT_PUBLIC_AUDIO_BGM: process.env.NEXT_PUBLIC_AUDIO_BGM,
  NEXT_PUBLIC_AUDIO_SELECT_BGM: process.env.NEXT_PUBLIC_AUDIO_SELECT_BGM,
  NEXT_PUBLIC_AUDIO_BATTLE_BGM: process.env.NEXT_PUBLIC_AUDIO_BATTLE_BGM,
  NEXT_PUBLIC_AUDIO_LIGHT_ATTACK: process.env.NEXT_PUBLIC_AUDIO_LIGHT_ATTACK,
  NEXT_PUBLIC_AUDIO_HEAVY_ATTACK: process.env.NEXT_PUBLIC_AUDIO_HEAVY_ATTACK,
  NEXT_PUBLIC_AUDIO_SPECIAL_MOVE: process.env.NEXT_PUBLIC_AUDIO_SPECIAL_MOVE,
  NEXT_PUBLIC_AUDIO_BLOCK: process.env.NEXT_PUBLIC_AUDIO_BLOCK,
  NEXT_PUBLIC_AUDIO_DAMAGE: process.env.NEXT_PUBLIC_AUDIO_DAMAGE,
  NEXT_PUBLIC_AUDIO_VICTORY: process.env.NEXT_PUBLIC_AUDIO_VICTORY,
  NEXT_PUBLIC_AUDIO_DEFEAT: process.env.NEXT_PUBLIC_AUDIO_DEFEAT,
  NEXT_PUBLIC_AUDIO_COMBO: process.env.NEXT_PUBLIC_AUDIO_COMBO
});

export type MiniAppEnv = typeof env;
