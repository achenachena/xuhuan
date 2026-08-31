import en from "@/locales/en.json";
import zhCN from "@/locales/zh-CN.json";

export type GameLocale = "en" | "zh-CN";

const copy = { en, "zh-CN": zhCN } as const;

export type GameCopyKey = keyof typeof en;
export const gameText = (locale: GameLocale, key: GameCopyKey): string =>
  copy[locale][key];

export const formatGameText = (
  locale: GameLocale,
  key: GameCopyKey,
  values: Readonly<Record<string, string | number>>,
): string =>
  Object.entries(values).reduce(
    (message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
    gameText(locale, key),
  );
