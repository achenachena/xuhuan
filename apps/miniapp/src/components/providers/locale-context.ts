import { createContext } from "react";

type Translate = (key: string, params?: Record<string, string>) => string;

export type LocaleContextValue = {
  readonly language: string;
  readonly isReady: boolean;
  readonly translate: Translate;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export default LocaleContext;

