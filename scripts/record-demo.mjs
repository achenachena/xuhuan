import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
const require = createRequire(new URL("../apps/miniapp/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const output = process.argv[2] ?? "/tmp/xuhuan-demo-capture";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 740 }, deviceScaleFactor: 2 });
  // Recording-only audio tap. This is injected into this browser, never shipped in the game.
  await page.addInitScript(() => {
    const connect = AudioNode.prototype.connect;
    const captures = new WeakMap();
    AudioNode.prototype.connect = function (...args) {
      if (args[0] instanceof AudioDestinationNode) {
        let capture = captures.get(this.context);
        if (!capture) {
          capture = this.context.createMediaStreamDestination();
          captures.set(this.context, capture);
        }
        connect.call(this, capture);
        window.__recordingAudio = capture.stream;
      }
      return connect.apply(this, args);
    };
  });
  await page.goto(baseURL + "/demo");
  await page.locator('[data-game-surface="true"] [role="status"]').waitFor({ state: "hidden" });
  const surface = page.getByTestId("shooter-control-surface");
  const box = await surface.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * .8);
  await page.mouse.down();
  const recording = page.evaluate(async () => {
    const canvas = document.querySelector('[data-testid="shooter-canvas"]');
    if (!window.__recordingAudio) throw new Error("Recording audio tap is unavailable");
    const stream = canvas.captureStream(30);
    window.__recordingAudio.getAudioTracks().forEach(track => stream.addTrack(track));
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9,opus" });
    const chunks = [];
    recorder.ondataavailable = event => chunks.push(event.data);
    const done = new Promise(resolve => { recorder.onstop = resolve; });
    recorder.start();
    await new Promise(resolve => setTimeout(resolve, 18_000));
    recorder.stop(); await done;
    return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
  });
  await page.waitForTimeout(5_000);
  await page.getByTestId("shooter-canvas").screenshot({ path: output + "/poster.png" });
  await writeFile(output + "/gameplay.webm", Buffer.from(await recording));
  console.log("Recorded 18 seconds of unmodified gameplay with live Web Audio.");
} finally { await browser.close(); }
