import { z } from "zod";

const isProduction = process.env.NODE_ENV === "production";

const isSafeExternalURL = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || (!isProduction && url.protocol === "http:")) &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
};

const optionalString = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const externalURLValidator = optionalString(
  z.string().refine(isSafeExternalURL, "Must be a safe HTTP(S) URL")
);

const urlOrPathValidator = optionalString(
  z.string().refine(
    (value) => (value.startsWith("/") && !value.startsWith("//")) || isSafeExternalURL(value),
    "Must be a safe HTTP(S) URL or an absolute path"
  )
);

const envSchema = z.object({
  NEXT_PUBLIC_API_URL: externalURLValidator,
  NEXT_PUBLIC_DEV_AUTH_TOKEN: optionalString(z.string().min(16)).refine(
    (value) => !isProduction || value === undefined,
    "Development authentication cannot be enabled in production"
  ),
  // Base URL for all audio files (if all files are in the same location)
  NEXT_PUBLIC_AUDIO_BASE_URL: urlOrPathValidator,
  // BGM URL - single BGM for all pages (select, battle, reward)
  NEXT_PUBLIC_AUDIO_BGM: urlOrPathValidator,
  // Individual audio file URLs (override base URL if provided)
  NEXT_PUBLIC_AUDIO_SPECIAL_MOVE: urlOrPathValidator,
  NEXT_PUBLIC_AUDIO_DAMAGE: urlOrPathValidator,
  NEXT_PUBLIC_AUDIO_VICTORY: urlOrPathValidator,
  NEXT_PUBLIC_AUDIO_DEFEAT: urlOrPathValidator
});

export const env = envSchema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_DEV_AUTH_TOKEN: process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN,
  NEXT_PUBLIC_AUDIO_BASE_URL: process.env.NEXT_PUBLIC_AUDIO_BASE_URL,
  NEXT_PUBLIC_AUDIO_BGM: process.env.NEXT_PUBLIC_AUDIO_BGM,
  NEXT_PUBLIC_AUDIO_SPECIAL_MOVE: process.env.NEXT_PUBLIC_AUDIO_SPECIAL_MOVE,
  NEXT_PUBLIC_AUDIO_DAMAGE: process.env.NEXT_PUBLIC_AUDIO_DAMAGE,
  NEXT_PUBLIC_AUDIO_VICTORY: process.env.NEXT_PUBLIC_AUDIO_VICTORY,
  NEXT_PUBLIC_AUDIO_DEFEAT: process.env.NEXT_PUBLIC_AUDIO_DEFEAT
});
