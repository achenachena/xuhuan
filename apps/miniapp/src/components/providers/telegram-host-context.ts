"use client";

import { createContext } from "react";

export type HostKind = "detecting" | "telegram" | "browser";

const TelegramHostContext = createContext<HostKind>("detecting");

export default TelegramHostContext;
