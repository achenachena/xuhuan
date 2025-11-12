import type { LocaleBundle } from "@/lib/localization/locale-bundle";

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

const loadLocaleBundle = async (params: LoadLocaleParams): Promise<LocaleBundle> => {
  const language = params.language ?? "zh-CN";
  const baseUrl = process.env.NEXT_PUBLIC_LOCALE_BASE_URL;
  if (!baseUrl) {
    throw new Error("Missing NEXT_PUBLIC_LOCALE_BASE_URL");
  }
  const url = `${baseUrl.replace(/\/+$/, "")}/${language}.json`;
  const response = await fetch(url, {
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
};

export default loadLocaleBundle;

