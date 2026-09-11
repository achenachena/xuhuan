import type { Metadata } from "next";

import "./globals.css";
import TelegramWebAppProvider from "@/components/providers/telegram-webapp-provider";
import LocaleProvider from "@/components/providers/locale-provider";
import { AudioProvider } from "@/components/providers/audio-provider";

export const metadata: Metadata = {
  metadataBase: new URL("https://xuhuan-miniapp.vercel.app"),
  title: "Xuhuan: Only One Online",
  description: "Turn enemies into fans. Bring the music back. A 90-second browser shooter. No signup.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Xuhuan: Only One Online",
    description: "Turn enemies into fans. Bring the music back. A 90-second browser shooter. No signup.",
    url: "/",
    siteName: "Xuhuan: Only One Online",
    type: "website",
    images: [
      {
        url: "/game/v4/reversal/stage.webp",
        width: 720,
        height: 1280,
        alt: "Xuhuan pixel livestream studio at the Seventh Dock",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Xuhuan: Only One Online",
    description: "Play instantly. Continue the full campaign in your browser or Telegram.",
    images: [{
      url: "/game/v4/reversal/stage.webp",
      width: 720,
      height: 1280,
      alt: "Xuhuan pixel livestream studio at the Seventh Dock",
    }],
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
