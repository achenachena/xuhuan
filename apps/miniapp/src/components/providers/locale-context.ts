import { createContext } from "react";

export type LocaleContextValue = {
  readonly language: "en" | "zh-CN";
  readonly setLanguage: (language: "en" | "zh-CN") => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export default LocaleContext;
