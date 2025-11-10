import { config } from "dotenv";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  TELEGRAM_ALLOWED_ORIGINS: z
    .string()
    .optional()
    .transform((value) => value?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? [])
});

type LoadedEnv = z.infer<typeof envSchema> & { readonly VERSION: string };

const loadEnv = (): LoadedEnv => {
  config();
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment variables: ${parsed.error.message}`);
  }
  return {
    ...parsed.data,
    VERSION: process.env.npm_package_version ?? "0.0.0"
  };
};

export const env = loadEnv();

export type Env = typeof env;

