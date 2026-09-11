import { gameText, type GameLocale } from "@/features/game/game-copy";

export type BattleCard = { readonly won: boolean; readonly health: number; readonly reversals: number };

export const renderBattleCard = (result: BattleCard, language: GameLocale): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = 1080; canvas.height = 1080;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");
  ctx.fillStyle = "#080d18"; ctx.fillRect(0, 0, 1080, 1080);
  ctx.strokeStyle = "#67e8f9"; ctx.lineWidth = 4; ctx.strokeRect(48, 48, 984, 984);
  ctx.fillStyle = "#67e8f9"; ctx.font = "bold 28px monospace";
  ctx.fillText("XUHUAN / ONLY ONE ONLINE", 96, 140);
  ctx.fillStyle = "#ffffff"; ctx.font = "bold 42px sans-serif";
  ctx.fillText(gameText(language, result.won ? "demoWon" : "demoLost"), 96, 270, 888);
  ctx.font = "28px sans-serif"; ctx.fillStyle = "#cbd5e1";
  ctx.fillText(gameText(language, "demoReversals"), 96, 390);
  ctx.fillText(gameText(language, "demoHearts"), 590, 390, 390);
  ctx.font = "bold 110px monospace"; ctx.fillStyle = "#67e8f9";
  ctx.fillText(String(result.reversals), 96, 530);
  ctx.fillStyle = "#f9a8d4"; ctx.fillText(`${result.health}/3`, 590, 530);
  // A small cheering robot is drawn locally; exported cards never fetch remote art.
  ctx.fillStyle = "#67e8f9"; ctx.fillRect(455, 610, 170, 120);
  ctx.fillStyle = "#080d18"; ctx.fillRect(485, 640, 25, 25); ctx.fillRect(570, 640, 25, 25);
  ctx.fillRect(510, 690, 60, 12);
  ctx.fillStyle = "#f9a8d4"; ctx.fillRect(390, 595, 20, 100); ctx.fillRect(670, 595, 20, 100);
  ctx.font = "27px sans-serif"; ctx.fillStyle = "#cbd5e1";
  ctx.fillText(gameText(language, "demoTagline"), 96, 825, 888);
  ctx.fillText(gameText(language, "demoDuration"), 96, 875, 888);
  ctx.font = "bold 32px monospace"; ctx.fillStyle = "#67e8f9";
  ctx.fillText("xuhuan-miniapp.vercel.app", 96, 970);
  return canvas;
};

export const saveBattleCard = async (result: BattleCard, language: GameLocale): Promise<void> => {
  await document.fonts?.ready;
  const canvas = renderBattleCard(result, language);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Image encoding failed")), "image/png");
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = "xuhuan-battle-card.png";
  document.body.append(link);
  try { link.click(); }
  finally {
    link.remove();
    // Allow the browser to consume the download before releasing its backing blob.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
};
