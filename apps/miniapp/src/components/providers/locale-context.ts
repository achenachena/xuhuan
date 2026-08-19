import { createContext } from "react";

export type LocaleContextValue = {
  readonly language: string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export default LocaleContext;
