import type { Metadata } from "next";

import LanguageToggle from "@/components/language-toggle";
import { BrowserDemo } from "@/features/portfolio/browser-demo";

export const metadata: Metadata = {
  title: "Playable Browser Demo | Xuhuan",
  description: "Play a short, anonymous browser demo of Xuhuan. No login, install, or saved progress.",
  alternates: { canonical: "/demo" },
};

const DemoPage = () => (
  <>
    <BrowserDemo />
    <LanguageToggle />
  </>
);

export default DemoPage;
