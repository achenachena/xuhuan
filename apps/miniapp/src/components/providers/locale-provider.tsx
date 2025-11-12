"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import localeRegistry from "@/lib/localization/locale-registry";
import loadLocaleBundle from "@/lib/localization/locale-loader";
import type { LocaleBundle } from "@/lib/localization/locale-bundle";
import LocaleContext from "@/components/providers/locale-context";

type LocaleProviderProps = {
  readonly children: ReactNode;
  readonly language?: string;
};

type LoaderState = {
  readonly language: string;
  readonly bundle: LocaleBundle | null;
  readonly isReady: boolean;
};

const LocaleProvider = ({ children, language }: LocaleProviderProps) => {
  const [state, setState] = useState<LoaderState>({
    language: language ?? "zh-CN",
    bundle: null,
    isReady: false
  });
  useEffect(() => {
    const controller = new AbortController();
    const executeLoad = async () => {
      try {
        const bundle = await loadLocaleBundle({
          language: language ?? "zh-CN",
          signal: controller.signal
        });
        localeRegistry.setBundle(bundle, language ?? "zh-CN");
        setState({
          language: language ?? "zh-CN",
          bundle,
          isReady: true
        });
      } catch (error) {
        console.error("Failed to load locale bundle", error);
        setState({
          language: language ?? "zh-CN",
          bundle: null,
          isReady: false
        });
      }
    };
    executeLoad().catch((error) => {
      console.error("Failed to execute locale load", error);
    });
    return () => {
      controller.abort();
    };
  }, [language]);
  const value = useMemo(() => {
    return {
      language: state.language,
      isReady: state.isReady,
      translate: localeRegistry.getText
    };
  }, [state.isReady, state.language]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
};

export default LocaleProvider;

