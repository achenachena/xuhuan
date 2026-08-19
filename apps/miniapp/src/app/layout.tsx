import type { Metadata } from "next";

import "./globals.css";
import TelegramWebAppProvider from "@/components/providers/telegram-webapp-provider";
import LocaleProvider from "@/components/providers/locale-provider";
import { AudioProvider } from "@/components/providers/audio-provider";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "虚环：仅一人在线",
  description: "A server-authoritative story card roguelite for Telegram."
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover" as const
};

const RootLayout = ({ children }: { children: React.ReactNode }) => {
  const defaultLanguage = env.NEXT_PUBLIC_DEFAULT_LANGUAGE;
  return (
    <html lang={defaultLanguage}>
      <head>
        <meta name="telegram-mini-app" content="true" />
      </head>
      <body className="min-h-screen bg-telegram-bg text-telegram-text transition-colors">
        <LocaleProvider language={defaultLanguage}>
          <TelegramWebAppProvider>
            <AudioProvider>{children}</AudioProvider>
          </TelegramWebAppProvider>
        </LocaleProvider>
      </body>
    </html>
  );
};

export default RootLayout;
