import type { Metadata } from "next";

import "./globals.css";
import TelegramWebAppProvider from "@/components/providers/telegram-webapp-provider";
import LocaleProvider from "@/components/providers/locale-provider";
import { AudioProvider } from "@/components/providers/audio-provider";

export const metadata: Metadata = {
  title: "Xuhuan: Only One Online",
  description: "A server-authoritative one-thumb action roguelite for Telegram."
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover" as const
};

const RootLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <html lang="en">
      <head>
        <meta name="telegram-mini-app" content="true" />
      </head>
      <body className="min-h-screen bg-telegram-bg text-telegram-text transition-colors">
        <LocaleProvider language="en">
          <TelegramWebAppProvider>
            <AudioProvider>{children}</AudioProvider>
          </TelegramWebAppProvider>
        </LocaleProvider>
      </body>
    </html>
  );
};

export default RootLayout;
