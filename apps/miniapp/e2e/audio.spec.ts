import { expect, test } from "@playwright/test";

declare global {
  interface Window { audioProbe?: { context: AudioContext; analyser: AnalyserNode } }
}

test("first gameplay gesture starts audible music and the battle mute control works", async ({ page }) => {
  await page.addInitScript(() => {
    const NativeAudio = window.AudioContext;
    window.AudioContext = class extends NativeAudio {
      constructor(options?: AudioContextOptions) {
        super(options);
        const analyser = this.createAnalyser();
        analyser.connect(this.destination);
        window.audioProbe = { context: this, analyser };
      }
      createGain() {
        const gain = super.createGain();
        gain.connect(window.audioProbe!.analyser);
        return gain;
      }
    };
  });
  await page.goto("/play");
  await expect(page.getByTestId("shooter-canvas")).toBeVisible({ timeout: 20_000 });
  expect(await page.evaluate(() => Boolean(window.audioProbe))).toBe(false);
  await page.getByTestId("shooter-control-surface").click({ position: { x: 100, y: 300 } });
  const peak = () => page.evaluate(async () => {
    if (!window.audioProbe) return 0;
    const data = new Float32Array(window.audioProbe.analyser.fftSize);
    // Cover a complete 240 ms beat: an instantaneous sample can land in a rest.
    let maximum = 0;
    const until = performance.now() + 300;
    do {
      window.audioProbe.analyser.getFloatTimeDomainData(data);
      maximum = Math.max(maximum, data.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0));
      await new Promise(resolve => requestAnimationFrame(resolve));
    } while (performance.now() < until);
    return maximum;
  });
  await expect.poll(peak).toBeGreaterThan(0.005);
  await page.getByRole("button", { name: "Mute sound", exact: true }).click();
  await expect.poll(peak).toBeLessThan(0.0001);
  await page.getByRole("button", { name: "Unmute sound", exact: true }).click();
  await expect.poll(peak).toBeGreaterThan(0.005);
});
