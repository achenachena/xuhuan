import type { Metadata } from "next";

import "./globals.css";
import TelegramWebAppProvider from "@/components/providers/telegram-webapp-provider";
import LocaleProvider from "@/components/providers/locale-provider";
import { AudioProvider } from "@/components/providers/audio-provider";

export const metadata: Metadata = {
  metadataBase: new URL("https://xuhuan-miniapp.vercel.app"),
  title: "Xuhuan: Only One Online",
  description: "A one-thumb Telegram shooter with transactional Go progression and a playable browser portfolio demo.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Xuhuan: Only One Online",
    description: "Keep the last impossible livestream online in this production-deployed Go and Canvas 2D shooter.",
    url: "/",
    siteName: "Xuhuan: Only One Online",
    type: "website",
    images: [
      {
        url: "/game/v4/backgrounds/seventh-dock.webp",
        width: 1024,
        height: 1024,
        alt: "Xuhuan browser demo at the Seventh Dock",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Xuhuan: Only One Online",
    description: "A playable browser demo and production-deployed Telegram Mini App.",
    images: ["/game/v4/backgrounds/seventh-dock.webp"],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover" as const,
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
