"use client";

import { useContext } from "react";

import TelegramHostContext from "@/components/providers/telegram-host-context";

const useTelegramHost = () => useContext(TelegramHostContext);

export default useTelegramHost;
