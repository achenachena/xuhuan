import type { Metadata } from "next";
import LanguageToggle from "@/components/language-toggle";
import { BrowserCampaign } from "@/features/campaign/browser-campaign";

export const metadata: Metadata = {
  title: "Play the full campaign — Xuhuan",
  description: "Play all eight chapters in your browser. No signup. Progress saves on this device.",
  alternates: { canonical: "/play" },
};
const PlayPage = () => <><BrowserCampaign /><LanguageToggle /></>;
export default PlayPage;
