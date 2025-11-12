import { useContext } from "react";

import LocaleContext from "@/components/providers/locale-context";
import type { LocaleContextValue } from "@/components/providers/locale-context";

const useLocale = (): LocaleContextValue => {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return context;
};

export default useLocale;

