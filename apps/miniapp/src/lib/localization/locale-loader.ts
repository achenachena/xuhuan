import type { LocaleBundle } from "@/lib/localization/locale-bundle";
import { env } from "@/lib/env";

type LoadLocaleParams = {
  readonly language?: string;
  readonly signal?: AbortSignal;
};

const validateLocaleBundle = (candidate: unknown): candidate is LocaleBundle => {
  if (!candidate || typeof candidate !== "object") {
    return false;
  }
  return Object.values(candidate as Record<string, unknown>).every((value) => typeof value === "string");
};

const loadBundledLocale = async (language: string): Promise<LocaleBundle> => {
  if (language.toLowerCase().startsWith("en")) {
    return (await import("@/lib/localization/locales/en")).default;
  }
  return (await import("@/lib/localization/locales/zh-CN")).default;
};

const loadLocaleBundle = async (params: LoadLocaleParams): Promise<LocaleBundle> => {
  const language = params.language?.toLowerCase().startsWith("en") ? "en" : "zh-CN";
  const baseUrl = env.NEXT_PUBLIC_LOCALE_BASE_URL;
  if (!baseUrl) {
    return loadBundledLocale(language);
  }
  try {
    const url = new URL(`${language}.json`, `${baseUrl.replace(/\/+$/, "")}/`);
    const response = await fetch(url.toString(), {
      cache: "no-store",
      signal: params.signal
    });
    if (!response.ok) {
      throw new Error(`Failed to load locale bundle (${response.status})`);
    }
    const data = await response.json();
    if (!validateLocaleBundle(data)) {
      throw new Error("Invalid locale bundle format");
    }
    return data;
  } catch (error) {
    if (params.signal?.aborted) {
      throw error;
    }
    return loadBundledLocale(language);
  }
};

export default loadLocaleBundle;
