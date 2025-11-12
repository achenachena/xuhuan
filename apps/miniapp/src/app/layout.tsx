import type { Metadata } from "next";
import { Roboto } from "next/font/google";

import "./globals.css";
import TelegramWebAppProvider from "@/components/providers/telegram-webapp-provider";

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto",
  display: "swap"
});

export const metadata: Metadata = {
  title: "虚环 Mini",
  description: "A Telegram mini app roguelike experience inspired by 虚环."
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
    <html lang="en" className={roboto.variable}>
      <head>
        <meta name="telegram-mini-app" content="true" />
      </head>
      <body className="min-h-screen bg-telegram-bg text-telegram-text transition-colors">
        <TelegramWebAppProvider>{children}</TelegramWebAppProvider>
      </body>
    </html>
  );
};

export default RootLayout;

