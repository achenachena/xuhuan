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

const envSchema = z.object({
  NEXT_PUBLIC_API_URL: externalURLValidator
});

export const env = envSchema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL
});
