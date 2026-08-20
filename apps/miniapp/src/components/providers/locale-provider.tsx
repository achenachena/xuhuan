"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";

import LocaleContext from "@/components/providers/locale-context";

type Language = "en" | "zh-CN";
type Props = { readonly children: ReactNode; readonly language?: Language };

const storageKey = "xuhuan.locale.v1";
const localeChangeEvent = "xuhuan:locale-change";
const isLanguage = (value: string | null): value is Language => value === "en" || value === "zh-CN";

const subscribe = (onStoreChange: () => void): (() => void) => {
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey) onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(localeChangeEvent, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(localeChangeEvent, onStoreChange);
  };
};

const LocaleProvider = ({ children, language }: Props) => {
  const initialLanguage = language ?? "en";
  const getSnapshot = useCallback(() => {
    const saved = window.localStorage.getItem(storageKey);
    return isLanguage(saved) ? saved : initialLanguage;
  }, [initialLanguage]);
  const getServerSnapshot = useCallback(() => initialLanguage, [initialLanguage]);
  const activeLanguage = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    document.documentElement.lang = activeLanguage;
  }, [activeLanguage]);

  const setLanguage = useCallback((nextLanguage: Language) => {
    window.localStorage.setItem(storageKey, nextLanguage);
    window.dispatchEvent(new Event(localeChangeEvent));
  }, []);
  const value = useMemo(
    () => ({ language: activeLanguage, setLanguage }),
    [activeLanguage, setLanguage],
  );
  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
};

export default LocaleProvider;
