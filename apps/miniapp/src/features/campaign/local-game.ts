import type { GameLocale } from "@/features/game/game-copy";
import type { ShooterContent, ShooterGameSnapshot, ShooterRunCommandResponse } from "@/lib/api/types";

type EngineResponse = {
  save?: unknown;
  game?: ShooterGameSnapshot;
  content?: ShooterContent;
  result?: ShooterRunCommandResponse;
  error?: string;
};
type GoRuntime = { importObject: WebAssembly.Imports; run: (instance: WebAssembly.Instance) => Promise<void> };
declare global {
  interface Window {
    Go?: new () => GoRuntime;
    xuhuanCampaign?: (request: string) => string;
  }
}
let engine: Promise<void> | undefined;
const loadEngine = (): Promise<void> => {
  if (!engine) engine = (async () => {
    if (!window.Go) await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/campaign/v1/wasm_exec.js";
      script.onload = () => resolve();
      script.onerror = () => { script.remove(); reject(new Error("Campaign runtime unavailable")); };
      document.head.append(script);
    });
    if (!window.Go) throw new Error("Campaign runtime unavailable");
    const go = new window.Go();
    const response = await fetch("/campaign/v1/campaign.wasm");
    if (!response.ok) throw new Error("Campaign rules unavailable");
    const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), go.importObject);
    // The Go callback is registered synchronously before its main goroutine waits.
    void go.run(instance).catch(() => { window.xuhuanCampaign = undefined; engine = undefined; });
    if (!window.xuhuanCampaign) throw new Error("Campaign initialization failed");
  })().catch(error => { engine = undefined; throw error; });
  return engine;
};

const invoke = (request: object): EngineResponse => {
  if (!window.xuhuanCampaign) throw new Error("Campaign runtime unavailable");
  const response = JSON.parse(window.xuhuanCampaign(JSON.stringify(request))) as EngineResponse;
  if (response.error) throw new Error(response.error);
  return response;
};
export const localContent = async (locale: GameLocale): Promise<ShooterContent> => {
  await loadEngine();
  return invoke({ action: "content", locale }).content!;
};
// Each mounted game owns its progress. Reloading or opening another page starts fresh.
export const createLocalSession = () => {
  let save: unknown = null;
  return async (request: object, autoStart = false): Promise<EngineResponse> => {
    await loadEngine();
    let response = invoke({ ...request, save });
    if (autoStart && response.game && !response.game.campaign_run && !response.game.daily_run) {
      const content = invoke({ action: "content", locale: "en" }).content!;
      const chapter = content.chapters.find(chapter => chapter.id === response.game!.progress.current_chapter_slug)!;
      response = invoke({ action: "start", save: response.save, id: crypto.randomUUID(), mode: "campaign",
        chapter_slug: chapter.id, character_slug: chapter.featured_character === "player-choice" ? "nana7mi" : chapter.featured_character });
    }
    save = response.save;
    return response;
  };
};
