import { expect, test } from "@playwright/test";

// Observe the real WASM boundary without adding a production test API.
const observeRuns = async (page: import("@playwright/test").Page) => {
  await page.addInitScript(() => {
    let invoke: ((request: string) => string) | undefined;
    Object.defineProperty(window, "xuhuanCampaign", {
      configurable: true,
      get: () => invoke,
      set: (engine: (request: string) => string) => {
        invoke = request => {
          const result = engine(request);
          const run = JSON.parse(result).game?.campaign_run;
          if (run) document.documentElement.dataset.observedRun = JSON.stringify(run);
          return result;
        };
      },
    });
  });
};
const run = (page: import("@playwright/test").Page) => page.locator("html").getAttribute("data-observed-run").then(value => JSON.parse(value!));

test("each visit starts fresh, ignores old saves, and language changes keep the current run", async ({ page, context }) => {
  await observeRuns(page);
  const protectedRequests: string[] = [];
  page.on("request", request => { if (/\/v2\/(game|runs|story)/.test(request.url())) protectedRequests.push(request.url()); });
  await page.goto("/");
  await expect(page.getByTestId("shooter-canvas")).toBeVisible();
  const first = await run(page);
  expect(first.state.chapter_slug).toBe("seventh-dock");
  await page.getByRole("button", { name: "Switch language to Chinese" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  expect((await run(page)).id).toBe(first.id);
  await page.evaluate(() => localStorage.setItem("xuhuan.campaign.v1", "{old-invalid-save"));
  await page.reload();
  await expect(page.getByTestId("shooter-canvas")).toBeVisible();
  const restarted = await run(page);
  expect(restarted.id).not.toBe(first.id);
  expect(restarted.state.segment_index).toBe(0);
  expect(restarted.state.chapter_slug).toBe("seventh-dock");
  expect(await page.evaluate(() => localStorage.getItem("xuhuan.campaign.v1"))).toBe("{old-invalid-save");
  const second = await context.newPage();
  await observeRuns(second);
  await second.goto("/play");
  await expect(second.getByTestId("shooter-canvas")).toBeVisible();
  expect((await run(second)).id).not.toBe(restarted.id);
  expect(protectedRequests).toEqual([]);
});

test("browser campaign works with site storage blocked", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException("Blocked", "SecurityError"); };
    Storage.prototype.setItem = () => { throw new DOMException("Blocked", "SecurityError"); };
  });
  await page.goto("/play");
  await expect(page.getByTestId("shooter-canvas")).toBeVisible();
  await page.getByRole("button", { name: "Switch language to Chinese" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.getByTestId("shooter-canvas")).toBeVisible();
  await expect(page.locator("aside[role=alert]")).toHaveCount(0);
});

test("a real battle advances this session and reload starts a new run", async ({ page }) => {
  test.setTimeout(90_000);
  await observeRuns(page);
  await page.clock.install();
  await page.goto("/play");
  await expect(page.getByTestId("shooter-canvas")).toBeVisible();
  const first = await run(page);
  await page.clock.runFor(80_000);
  await expect.poll(async () => (await run(page)).version).toBeGreaterThan(first.version);
  await page.reload();
  await expect(page.getByTestId("shooter-canvas")).toBeVisible();
  expect((await run(page)).id).not.toBe(first.id);
  expect((await run(page)).state.segment_index).toBe(0);
});
