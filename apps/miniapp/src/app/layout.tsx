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

const RootLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <html lang="en" className={roboto.variable}>
      <body className="min-h-screen bg-telegram-bg text-telegram-text transition-colors">
        <TelegramWebAppProvider>{children}</TelegramWebAppProvider>
      </body>
    </html>
  );
};

export default RootLayout;

