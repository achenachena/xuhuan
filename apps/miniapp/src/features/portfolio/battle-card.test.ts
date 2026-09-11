import { afterEach, describe, expect, it, vi } from "vitest";
import { renderBattleCard, saveBattleCard } from "@/features/portfolio/battle-card";
const context = () => ({ fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn() });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("local battle card", () => {
  it("renders the actual outcome and stats without a network request", () => {
    const ctx = context();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const card = renderBattleCard({ won: false, reversals: 7, health: 0 }, "zh-CN");
    expect(card.width).toBe(1080); expect(card.height).toBe(1080);
    const lines = ctx.fillText.mock.calls.map(args => args[0]);
    expect(lines).toContain("7"); expect(lines).toContain("0/3");
    expect(lines).toContain("xuhuan-miniapp.vercel.app");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("downloads a PNG and releases the temporary URL", async () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context() as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(callback => callback(new Blob(["png"], { type: "image/png" })));
    const create = vi.fn(() => "blob:local-card"), revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function(this: HTMLAnchorElement) {
      expect(this.download).toBe("xuhuan-battle-card.png");
      expect(this.href).toBe("blob:local-card");
    });
    await saveBattleCard({ won: true, health: 2, reversals: 8 }, "en");
    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector("a[download]")).toBeNull();
    await vi.runAllTimersAsync();
    expect(revoke).toHaveBeenCalledWith("blob:local-card");
  });
  it("reports encoding failure rather than creating a broken download", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context() as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(callback => callback(null));
    await expect(saveBattleCard({ won: true, health: 3, reversals: 1 }, "en")).rejects.toThrow("Image encoding failed");
  });
});
