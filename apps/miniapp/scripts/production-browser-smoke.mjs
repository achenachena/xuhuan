import { readFileSync } from "node:fs";

import { chromium, devices } from "@playwright/test";

const miniAppURL = process.env.MINIAPP_BASE_URL ?? "";
const apiBaseURL = process.env.API_BASE_URL ?? "";
const telegramInitDataFile = process.env.TELEGRAM_INIT_DATA_FILE ?? "";
const browserChannel = process.env.PLAYWRIGHT_CHANNEL ?? "chrome";

const exactHTTPSOrigin = (rawValue, label) => {
  let value;
  try {
    value = new URL(rawValue);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (
    value.protocol !== "https:" ||
    value.username ||
    value.password ||
    value.pathname !== "/" ||
    value.search ||
    value.hash
  ) {
    throw new Error(`${label} must be a plain HTTPS origin`);
  }
  return value.origin;
};

const miniAppOrigin = exactHTTPSOrigin(miniAppURL, "MINIAPP_BASE_URL");
const apiOrigin = exactHTTPSOrigin(apiBaseURL, "API_BASE_URL");
if (!telegramInitDataFile) {
  throw new Error("TELEGRAM_INIT_DATA_FILE is required");
}
const initData = readFileSync(telegramInitDataFile, "utf8");
if (!initData || initData.length > 8192 || /[\r\n]/u.test(initData)) {
  throw new Error("Synthetic Telegram initData file is invalid");
}

const initDataUser = (() => {
  try {
    return JSON.parse(new URLSearchParams(initData).get("user") ?? "null");
  } catch {
    return null;
  }
})();
if (!Number.isSafeInteger(initDataUser?.id)) {
  throw new Error("Synthetic Telegram initData has no valid user");
}

const isSnapshotResponse = async (response, locale) => {
  const url = new URL(response.url());
  return (
    response.request().method() === "GET" &&
    url.origin === apiOrigin &&
    url.pathname === "/v2/game" &&
    (await response.request().headerValue("accept-language")) === locale
  );
};

const assertAuthenticatedSnapshot = async (response) => {
  if (!response.ok()) {
    throw new Error(`Production game snapshot returned HTTP ${response.status()}`);
  }
  const authentication = await response
    .request()
    .headerValue("x-telegram-init-data");
  if (authentication !== initData) {
    throw new Error("Production frontend omitted the signed Telegram identity");
  }
  const snapshot = await response.json();
  if (
    snapshot?.protocol !== "action-v2" ||
    snapshot?.content_version !== "v3" ||
    !snapshot.progress
  ) {
    throw new Error("Production frontend received an invalid game snapshot");
  }
};

const pixel7 = devices["Pixel 7"];
const browser = await chromium.launch({ channel: browserChannel, headless: true });
try {
  const context = await browser.newContext({
    viewport: pixel7.viewport,
    userAgent: pixel7.userAgent,
    deviceScaleFactor: pixel7.deviceScaleFactor,
    isMobile: pixel7.isMobile,
    hasTouch: pixel7.hasTouch,
    locale: "en-CA",
  });
  await context.addInitScript(
    ({ signedInitData }) => {
      // The Telegram SDK consumes these launch parameters before the app's
      // dynamic SDK import. No URL, cookie, app storage, or server session
      // carries the signed identity.
      if (window.location.protocol === "https:") {
        window.sessionStorage.setItem(
          "__telegram__initParams",
          JSON.stringify({
            tgWebAppData: signedInitData,
            tgWebAppPlatform: "ios",
            tgWebAppVersion: "7.10",
            tgWebAppThemeParams: JSON.stringify({
              bg_color: "#050914",
              text_color: "#f8fafc",
              hint_color: "#94a3b8",
              button_color: "#22d3ee",
              button_text_color: "#020617",
            }),
          }),
        );
      }
      Object.defineProperty(window, "TelegramWebviewProxy", {
        configurable: true,
        value: { postEvent: () => undefined },
      });
    },
    { signedInitData: initData },
  );

  const page = await context.newPage();
  let pageErrorCount = 0;
  page.on("pageerror", () => {
    pageErrorCount += 1;
  });
  const initialSnapshotPromise = page.waitForResponse(
    (response) => isSnapshotResponse(response, "en"),
    { timeout: 45_000 },
  );
  const documentResponse = await page.goto(miniAppOrigin, {
    timeout: 45_000,
    waitUntil: "domcontentloaded",
  });
  if (!documentResponse?.ok()) {
    throw new Error("Promoted production Mini App did not load successfully");
  }
  if (new URL(page.url()).origin !== miniAppOrigin) {
    throw new Error("Promoted production Mini App redirected to another origin");
  }
  await assertAuthenticatedSnapshot(await initialSnapshotPromise);
  await page.getByTestId("start-campaign").waitFor({
    state: "visible",
    timeout: 45_000,
  });
  if ((await page.locator("html").getAttribute("data-telegram-host")) !== "true") {
    throw new Error("Production frontend did not initialize the Telegram host bridge");
  }

  const localizedSnapshotPromise = page.waitForResponse(
    (response) => isSnapshotResponse(response, "zh-CN"),
    { timeout: 45_000 },
  );
  const localizedContentPromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "GET" &&
      url.origin === apiOrigin &&
      url.pathname === "/v2/content/v3" &&
      url.searchParams.get("locale") === "zh-CN"
    );
  }, { timeout: 45_000 });
  await page
    .getByRole("button", { name: "Switch language to Chinese" })
    .click();
  const [localizedSnapshot, localizedContent] = await Promise.all([
    localizedSnapshotPromise,
    localizedContentPromise,
  ]);
  await assertAuthenticatedSnapshot(localizedSnapshot);
  if (!localizedContent.ok()) {
    throw new Error("Production frontend could not load Chinese V3 content");
  }
  const localizedCatalog = await localizedContent.json();
  if (
    localizedCatalog?.version !== "v3" ||
    localizedCatalog?.protocol !== "action-v2" ||
    localizedCatalog?.locale !== "zh-CN"
  ) {
    throw new Error("Production frontend received invalid Chinese V3 content");
  }
  await page
    .locator('button[aria-label]')
    .filter({ hasText: /^EN$/u })
    .waitFor({ state: "visible", timeout: 45_000 });
  if ((await page.locator("html").getAttribute("lang")) !== "zh-CN") {
    throw new Error("Production frontend did not apply the selected locale");
  }
  if (pageErrorCount !== 0) {
    throw new Error("Production frontend raised an uncaught browser error");
  }

  // The imported SDK retains launch data in memory for this page. Remove its
  // persistence before closing the isolated browser context.
  await page.evaluate(() => {
    window.sessionStorage.removeItem("__telegram__initParams");
  });
  await context.close();
} finally {
  await browser.close();
}

console.log(
  JSON.stringify({
    status: "ok",
    surface: "promoted-production-miniapp",
    protocol: "action-v2",
    content_version: "v3",
    authenticated_snapshot: true,
    localized_interaction: true,
  }),
);
