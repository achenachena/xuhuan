import type { Metadata } from "next";

import LanguageToggle from "@/components/language-toggle";
import { BrowserDemo } from "@/features/portfolio/browser-demo";

export const metadata: Metadata = {
  title: "Play Xuhuan",
  description: "Play a short browser session of Xuhuan.",
  alternates: { canonical: "/demo" },
};

const DemoPage = () => (
  <>
    <BrowserDemo />
    <LanguageToggle />
  </>
);

export default DemoPage;
