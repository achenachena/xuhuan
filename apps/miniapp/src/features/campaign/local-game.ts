import type { GameLocale } from "@/features/game/game-copy";
import type { ShooterContent, ShooterGameSnapshot, ShooterRunCommandResponse } from "@/lib/api/types";

export const localSaveKey = "xuhuan.campaign.v1";
export class LocalSaveError extends Error {}

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
  if (response.error === "local_save_invalid") throw new LocalSaveError("localSaveInvalid");
  if (response.error) throw new Error(response.error);
  return response;
};
export const localContent = async (locale: GameLocale): Promise<ShooterContent> => {
  await loadEngine();
  return invoke({ action: "content", locale }).content!;
};
export const readLocalSave = (): string | null => {
  try { return localStorage.getItem(localSaveKey); }
  catch { throw new LocalSaveError("localSaveUnavailable"); }
};

export const localAction = async (request: object): Promise<EngineResponse> => {
  await loadEngine();
  if (!navigator.locks) throw new LocalSaveError("localSaveUnavailable");
  // A Web Lock covers the entire read/advance/write so two tabs cannot silently
  // overwrite each other's progress. This is a local lock, not player identity.
  return navigator.locks.request(localSaveKey, () => {
    const raw = readLocalSave();
    let save: unknown = null;
    if (raw !== null) {
      try { save = JSON.parse(raw); }
      catch { throw new LocalSaveError("localSaveInvalid"); }
      if (!save) throw new LocalSaveError("localSaveInvalid");
    }
    const response = invoke({ ...request, save });
    try { localStorage.setItem(localSaveKey, JSON.stringify(response.save)); }
    catch { throw new LocalSaveError("localSaveUnavailable"); }
    return response;
  });
};
export const resetLocalSave = async (): Promise<void> => {
  if (!navigator.locks) throw new LocalSaveError("localSaveUnavailable");
  await navigator.locks.request(localSaveKey, () => {
    try { localStorage.removeItem(localSaveKey); }
    catch { throw new LocalSaveError("localSaveUnavailable"); }
  });
};
