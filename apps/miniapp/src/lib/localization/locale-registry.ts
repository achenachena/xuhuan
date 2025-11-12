import type { LocaleBundle } from "@/lib/localization/locale-bundle";

type InterpolationMap = Record<string, string>;

const createLocaleRegistry = () => {
  let currentBundle: LocaleBundle | null = null;
  let currentLanguage = "zh-CN";
  const replacePlaceholders = (template: string, params: InterpolationMap | undefined): string => {
    if (!params) {
      return template;
    }
    return template.replace(/\{(\w+)\}/g, (_match, token: string) => {
      if (Object.prototype.hasOwnProperty.call(params, token)) {
        return params[token] ?? "";
      }
      return "";
    });
  };
  const setBundle = (bundle: LocaleBundle, language: string): void => {
    currentBundle = bundle;
    currentLanguage = language;
  };
  const getText = (key: string, params?: InterpolationMap): string => {
    if (!currentBundle) {
      return key;
    }
    if (!currentBundle[key]) {
      return key;
    }
    return replacePlaceholders(currentBundle[key], params);
  };
  const getLanguage = (): string => {
    return currentLanguage;
  };
  return {
    getLanguage,
    getText,
    setBundle
  };
};

const localeRegistry = createLocaleRegistry();

export default localeRegistry;

