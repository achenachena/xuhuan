"use client";

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";

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
  const sessionLanguage = useRef<Language | null>(null);
  const getSnapshot = useCallback(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (isLanguage(saved)) return saved;
    } catch { /* Storage is optional; the game remains playable without it. */ }
    return sessionLanguage.current ?? initialLanguage;
  }, [initialLanguage]);
  const getServerSnapshot = useCallback(() => initialLanguage, [initialLanguage]);
  const activeLanguage = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    document.documentElement.lang = activeLanguage;
  }, [activeLanguage]);

  const setLanguage = useCallback((nextLanguage: Language) => {
    sessionLanguage.current = nextLanguage;
    try { window.localStorage.setItem(storageKey, nextLanguage); }
    catch { /* Keep the language choice for this visit. */ }
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
