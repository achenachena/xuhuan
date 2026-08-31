import type { Metadata } from "next";
import { notFound } from "next/navigation";

import DailyResultView from "@/app/daily/[id]/daily-result-view";
import {
  getPublicDailyResult,
  getPublicGameContent,
} from "@/lib/api/public";

type DailyPageProps = {
  readonly params: Promise<{ id: string }>;
};

export const generateMetadata = async ({
  params,
}: DailyPageProps): Promise<Metadata> => {
  const { id: runID } = await params;
  const [result, content] = await Promise.all([
    getPublicDailyResult(runID),
    getPublicGameContent("en"),
  ]);
  if (!result) return { title: "Xuhuan Daily Signal" };
  const character =
    content?.characters.find(
      (item) => item.id === result.character_slug,
    )?.name ?? result.character_slug;
  const description = `${character} recovered ${result.score} points with a ${result.streak}-clear streak.`;
  return {
    title: `Xuhuan Daily · ${result.score}`,
    description,
    openGraph: { title: "Xuhuan Daily Signal", description },
    twitter: {
      card: "summary_large_image",
      title: "Xuhuan Daily Signal",
      description,
    },
  };
};

const DailyResultPage = async ({ params }: DailyPageProps) => {
  const { id: runID } = await params;
  const [result, english, chinese] = await Promise.all([
    getPublicDailyResult(runID),
    getPublicGameContent("en"),
    getPublicGameContent("zh-CN"),
  ]);
  if (!result) notFound();
  if (!english || !chinese) throw new Error("V4 content is unavailable");
  const labels = Object.fromEntries(
    [english, chinese].map((content) => [
      content.locale,
      {
        characters: Object.fromEntries(
          content.characters.map((item) => [item.id, item.name]),
        ),
        effects: Object.fromEntries(
          content.show_effects.map((item) => [item.id, item.name]),
        ),
        companions: Object.fromEntries(
          content.companions.map((item) => [item.id, item.name]),
        ),
      },
    ]),
  ) as Record<"en" | "zh-CN", {
    characters: Record<string, string>;
    effects: Record<string, string>;
    companions: Record<string, string>;
  }>;
  return <DailyResultView result={result} labels={labels} />;
};

export default DailyResultPage;
