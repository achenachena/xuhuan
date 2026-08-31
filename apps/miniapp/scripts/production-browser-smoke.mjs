import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { chromium, devices } from "@playwright/test";

import {
  chooseSmokeShowOption,
  chooseSmokeStoryOption,
  createAuthoritySmokeTrace,
} from "./smoke-trace-helper.mjs";

const exactOrigin = (raw, label) => {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash || url.username || url.password) throw new Error(`${label} must be a plain HTTPS origin`);
  return url.origin;
};
const miniAppOrigin = exactOrigin(process.env.MINIAPP_BASE_URL ?? "", "MINIAPP_BASE_URL");
const apiOrigin = exactOrigin(process.env.API_BASE_URL ?? "", "API_BASE_URL");
const initData = readFileSync(process.env.TELEGRAM_INIT_DATA_FILE ?? "", "utf8");
if (!initData || initData.length > 8_192 || /[\r\n]/u.test(initData)) throw new Error("Synthetic Telegram initData is invalid");
const parsedUser = JSON.parse(new URLSearchParams(initData).get("user") ?? "null");
if (!Number.isSafeInteger(parsedUser?.id)) throw new Error("Synthetic Telegram identity is missing");

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const requestJSON = async (path, { method = "GET", body, key } = {}) => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    let response;
    try {
      response = await fetch(`${apiOrigin}${path}`, {
        method,
        signal: AbortSignal.timeout(25_000),
        headers: {
          Accept: "application/json",
          "Accept-Language": "en",
          "X-Telegram-Init-Data": initData,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(key ? { "Idempotency-Key": key } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      if (attempt === 7) throw error;
      await sleep(Math.min(500 * 2 ** attempt, 8_000));
      continue;
    }
    const text = await response.text();
    if (response.ok) return text ? JSON.parse(text) : null;
    if (response.status === 429) {
      const retryAfter = Math.min(
        65,
        Math.max(1, Number(response.headers.get("retry-after") ?? 1)),
      );
      await sleep(retryAfter * 1_000 + 250);
      continue;
    }
    if (response.status >= 500 && attempt < 7) {
      await sleep(Math.min(500 * 2 ** attempt, 8_000));
      continue;
    }
    throw new Error(
      `${method} ${path} failed (${response.status}): ${text.slice(0, 400)}`,
    );
  }
  throw new Error(`${method} ${path} exhausted retries`);
};
const command = async (run, body) => (await requestJSON(`/v2/runs/${encodeURIComponent(run.id)}/commands`, { method: "POST", key: randomUUID(), body: { ...body, expected_version: run.version } })).run;
const getActiveCampaign = async () => (await requestJSON("/v2/game")).campaign_run;

const pixel7 = devices["Pixel 7"];
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome", headless: true });
try {
  // The API smoke immediately precedes this browser flow with the same
  // synthetic identity. Wait for one authenticated request to succeed, then
  // leave request capacity for the page's own initial /v2/game request.
  await getActiveCampaign();
  await sleep(1_250);
  const context = await browser.newContext({
    viewport: pixel7.viewport,
    userAgent: pixel7.userAgent,
    deviceScaleFactor: pixel7.deviceScaleFactor,
    isMobile: pixel7.isMobile,
    hasTouch: true,
    locale: "en-CA",
  });
  await context.addInitScript(({ signedInitData }) => {
    window.sessionStorage.setItem("__telegram__initParams", JSON.stringify({
      tgWebAppData: signedInitData,
      tgWebAppPlatform: "ios",
      tgWebAppVersion: "8.0",
      tgWebAppThemeParams: JSON.stringify({ bg_color: "#02050e", text_color: "#f8fafc", hint_color: "#94a3b8", button_color: "#22d3ee", button_text_color: "#020617" }),
    }));
    Object.defineProperty(window, "TelegramWebviewProxy", { configurable: true, value: { postEvent: () => undefined } });
  }, { signedInitData: initData });

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto(miniAppOrigin, { waitUntil: "domcontentloaded", timeout: 45_000 });
  if (!response?.ok()) throw new Error("Production Mini App document failed");
  const marker = page.locator('[data-release-marker="CONTENT-V4 / SHOOTER-V1"]');
  await marker.waitFor({ state: "attached" });
  await page.getByTestId("start-campaign").waitFor({ state: "visible", timeout: 45_000 });
  if ((await page.locator("html").getAttribute("data-telegram-host")) !== "true") throw new Error("Telegram host adapter did not initialize");

  const chineseContent = page.waitForResponse((item) => {
    const url = new URL(item.url());
    return url.origin === apiOrigin && url.pathname === "/v2/content/v4" && url.searchParams.get("locale") === "zh-CN";
  });
  await page.getByRole("button", { name: "Switch language to Chinese" }).click();
  const localized = await chineseContent;
  if (!localized.ok() || (await localized.json()).protocol !== "shooter-v1") throw new Error("Chinese V4 content handshake failed");
  if ((await page.locator("html").getAttribute("lang")) !== "zh-CN") throw new Error("Locale did not persist in the document");
  await page.locator('[data-language-toggle="true"]').click();

  const finaleCompanion = page.getByTestId("companion-xingtong-assist");
  await finaleCompanion.waitFor({ state: "visible", timeout: 30_000 });
  await finaleCompanion.click();
  if ((await finaleCompanion.getAttribute("aria-pressed")) !== "true") {
    throw new Error("Finale companion selection did not persist in the Hub");
  }
  await page.getByTestId("start-campaign").click();
  const surface = page.getByTestId("shooter-control-surface");
  await surface.waitFor({ state: "visible", timeout: 30_000 });
  const hud = page.getByTestId("shooter-hud");
  const [hudBox, surfaceBox, canvasBox, languageBox] = await Promise.all([
    hud.boundingBox(),
    surface.boundingBox(),
    page.getByTestId("shooter-canvas").boundingBox(),
    page.locator('[data-language-toggle="true"]').boundingBox(),
  ]);
  if (!hudBox || hudBox.height > 48.5 || !surfaceBox || surfaceBox.y < hudBox.y + hudBox.height - 1) throw new Error("HUD overlaps the playable field");
  if (!canvasBox || Math.abs(canvasBox.x - surfaceBox.x) > 1 || Math.abs(canvasBox.y - surfaceBox.y) > 1 || Math.abs(canvasBox.width - surfaceBox.width) > 1 || Math.abs(canvasBox.height - surfaceBox.height) > 1 || canvasBox.height < pixel7.viewport.height * 0.55) throw new Error("Canvas does not fill the safe playable field");
  if (!languageBox || languageBox.y < hudBox.y || languageBox.y + languageBox.height > hudBox.y + hudBox.height + 1) throw new Error("Language switch is outside the compact HUD");

  const dispatch = async (type, x, y, pointerId = 7) => surface.dispatchEvent(type, { pointerId, pointerType: "touch", isPrimary: true, clientX: surfaceBox.x + x, clientY: surfaceBox.y + y, bubbles: true });
  await dispatch("pointerdown", surfaceBox.width / 2, surfaceBox.height * 0.8);
  await dispatch("pointermove", surfaceBox.width * 0.25, surfaceBox.height * 0.85);
  const heldX = await surface.getAttribute("data-control-x");
  await dispatch("pointermove", surfaceBox.width * 0.25, 1);
  if ((await surface.getAttribute("data-control-x")) !== heldX) throw new Error("Vertical pointer movement changed horizontal control");
  await dispatch("pointerup", surfaceBox.width * 0.25, 1);
  await dispatch("pointermove", surfaceBox.width * 0.75, surfaceBox.height * 0.9);
  if ((await surface.getAttribute("data-control-x")) !== heldX || (await surface.getAttribute("data-pointer-active")) !== "false") throw new Error("Released pointer kept moving the pilot");
  for (let index = 0; index < 20; index += 1) {
    await dispatch("pointerdown", surfaceBox.width * 0.5, surfaceBox.height * 0.7, 20 + index);
    await dispatch("pointermove", surfaceBox.width * 0.5, surfaceBox.height + 80, 20 + index);
    await dispatch("pointerup", surfaceBox.width * 0.5, surfaceBox.height + 80, 20 + index);
  }
  if (new URL(page.url()).origin !== miniAppOrigin || !(await surface.isVisible())) throw new Error("Downward drags dismissed the Mini App");

  let run = await getActiveCampaign();
  if (!run?.state.segment) throw new Error("Browser did not start a campaign segment");
  run = await command(run, { type: "complete_segment", trace: createAuthoritySmokeTrace(run.state.segment.runtime_config) });
  const preferredGate = chooseSmokeShowOption(run.state.pending_show_options);
  const preferredGateIndex = run.state.pending_show_options.indexOf(preferredGate);
  await sleep(1_250);
  await page.reload({ waitUntil: "domcontentloaded" });
  const gate = page.getByTestId("shooter-gate-surface");
  await gate.waitFor({ state: "visible", timeout: 30_000 });
  const gateBox = await gate.boundingBox();
  if (!gateBox) throw new Error("Gate field has no layout");
  const gateCanvasBox = await page.getByTestId("shooter-gate-canvas").boundingBox();
  if (!gateCanvasBox || Math.abs(gateCanvasBox.x - gateBox.x) > 1 || Math.abs(gateCanvasBox.y - gateBox.y) > 1 || Math.abs(gateCanvasBox.width - gateBox.width) > 1 || Math.abs(gateCanvasBox.height - gateBox.height) > 1) throw new Error("Gate canvas does not fill its control field");
  await gate.dispatchEvent("pointerdown", { pointerId: 51, pointerType: "touch", clientX: gateBox.x + gateBox.width / 2, clientY: gateBox.y + gateBox.height * 0.8, bubbles: true });
  const gateX = preferredGateIndex === 1 ? 0.85 : 0.15;
  await gate.dispatchEvent("pointermove", { pointerId: 51, pointerType: "touch", clientX: gateBox.x + gateBox.width * gateX, clientY: gateBox.y + gateBox.height * 0.8, bubbles: true });
  await page.waitForTimeout(600);
  await gate.dispatchEvent("pointerup", { pointerId: 51, pointerType: "touch", clientX: gateBox.x + gateBox.width * gateX, clientY: gateBox.y + gateBox.height * 0.8, bubbles: true }).catch(() => undefined);
  await page.waitForTimeout(500);

  run = await getActiveCampaign();
  for (let step = 0; step < 16 && run?.status === "active" && !run.state.segment?.boss_id; step += 1) {
    if (run.state.phase === "segment") run = await command(run, { type: "complete_segment", trace: createAuthoritySmokeTrace(run.state.segment.runtime_config) });
    else if (run.state.phase === "show_choice") run = await command(run, { type: "choose_show_option", option_id: chooseSmokeShowOption(run.state.pending_show_options) });
    else if (run.state.phase === "story") run = await command(run, { type: "choose_intermission_reply", scene_id: run.state.story.scene_id, option_id: chooseSmokeStoryOption(run.state.story.choice_ids) });
    else break;
  }
  if (!run?.state.segment?.boss_id) throw new Error("Campaign did not reach its Boss");
  await sleep(1_250);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId("shooter-canvas").waitFor({ state: "visible" });
  if (!(await hud.textContent())?.includes("BOSS")) throw new Error("Boss HUD is not explicit");

  run = await command(run, { type: "complete_segment", trace: createAuthoritySmokeTrace(run.state.segment.runtime_config) });
  if (run.state.phase === "story") {
    await sleep(1_250);
    await page.reload({ waitUntil: "domcontentloaded" });
    const choice = page.locator('[data-testid^="story-option-"]').first();
    await choice.waitFor({ state: "visible" });
    await choice.click();
  }

  const mismatch = await context.newPage();
  await mismatch.route(`${apiOrigin}/v2/game`, async (route) => {
    const original = await route.fetch();
    const body = await original.json();
    await route.fulfill({ response: original, json: { ...body, protocol: "unsupported-v0" } });
  });
  await mismatch.goto(miniAppOrigin, { waitUntil: "domcontentloaded" });
  await mismatch.getByTestId("protocol-maintenance").waitFor({ state: "visible" });
  if (await mismatch.getByTestId("shooter-canvas").count()) throw new Error("Canvas initialized during protocol mismatch");
  await mismatch.close();

  if (errors.length) throw new Error(`Production browser errors: ${errors.join("; ")}`);
  await page.evaluate(() => window.sessionStorage.removeItem("__telegram__initParams"));
  await context.close();
} finally {
  await browser.close();
}

console.log(JSON.stringify({ status: "ok", protocol: "shooter-v1", content_version: "v4", pointer_hold: true, y_ignored: true, release_stops: true, downward_drag_safe: true, gate: true, boss: true, locale: true, maintenance_handshake: true }));
