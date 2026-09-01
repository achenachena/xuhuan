import { ImageResponse } from "next/og";

import {
  getPublicDailyResult,
  getPublicGameContent,
} from "@/lib/api/public";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const OpenGraphImage = async ({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) => {
  const { id: runID } = await params;
  const [result, content] = await Promise.all([
    getPublicDailyResult(runID),
    getPublicGameContent("en"),
  ]);
  const character = result
    ? (content?.characters.find((item) => item.id === result.character_slug)
        ?.name ?? "UNKNOWN PILOT")
    : "UNKNOWN PILOT";
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 72px",
        color: "#e0f2fe",
        background:
          "linear-gradient(135deg,#020617 0%,#071d32 54%,#241047 100%)",
        fontFamily: "monospace",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, letterSpacing: 6, color: "#67e8f9" }}>
        <span>XUHUAN // DAILY ANOMALY</span>
        <span>{result?.date ?? "SIGNAL LOST"}</span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 28, color: "#94a3b8", letterSpacing: 4 }}>SCORE</span>
          <span style={{ marginTop: 6, fontSize: 142, fontWeight: 900, lineHeight: 1, color: "#a5f3fc" }}>
            {result?.score.toLocaleString("en-CA") ?? "—"}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 14, fontSize: 34 }}>
          <span style={{ color: "#c4b5fd" }}>{character}</span>
          <span>STREAK · {result?.streak ?? 0}</span>
        </div>
      </div>
      <div style={{ height: 10, width: "100%", display: "flex", background: "linear-gradient(90deg,#67e8f9,#a78bfa,#f472b6)" }} />
    </div>,
    size,
  );
};

export default OpenGraphImage;
