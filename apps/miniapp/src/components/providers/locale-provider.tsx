"use client";

import { useMemo, type ReactNode } from "react";

import LocaleContext from "@/components/providers/locale-context";

type Props = { readonly children: ReactNode; readonly language?: string };

const LocaleProvider = ({ children, language }: Props) => {
  const value = useMemo(() => ({ language: language ?? "zh-CN" }), [language]);
  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
};

export default LocaleProvider;
