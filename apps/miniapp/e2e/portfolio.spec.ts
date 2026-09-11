import { expect, test } from "@playwright/test";

test.describe("public browser game", () => {
  test("starts gameplay at the root without a landing page or protected API calls", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const protectedRequests: string[] = [];
    page.on("request", (request) => {
      if (/\/v2\/(game|runs|story)/.test(request.url())) protectedRequests.push(request.url());
    });

    await page.goto("/");

    await expect(page.getByTestId("game-entry")).toBeVisible();
    await expect(page.getByTestId("shooter-canvas")).toBeVisible();
    await expect(page.locator('[data-game-surface="true"] [role="status"]')).toHaveCount(0);
    await expect(page.getByRole("heading")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /demo|GitHub|Telegram/i })).toHaveCount(0);
    expect(protectedRequests).toEqual([]);
  });

  test("starts the static browser demo without API writes", async ({ page }) => {
    const protectedRequests: string[] = [];
    page.on("request", (request) => {
      if (/\/v2\/(game|runs|story)/.test(request.url())) protectedRequests.push(request.url());
    });

    await page.goto("/demo", { waitUntil: "networkidle" });
    await expect(page.locator("canvas")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Portfolio Demo")).toHaveCount(0);
    await expect(page.locator('[data-game-surface="true"] [role="status"]')).toHaveCount(0);
    expect(protectedRequests).toEqual([]);
  });

  test("follows a continuously held mouse, ignores Y, and stops on release", async ({ page }) => {
    await page.goto("/demo");
    const surface = page.getByTestId("shooter-control-surface");
    await expect(surface).toBeVisible();
    await expect(page.locator('[data-game-surface="true"] [role="status"]')).toHaveCount(0);
    const bounds = await surface.boundingBox();
    if (!bounds) throw new Error("Battlefield bounds unavailable");
    expect(bounds.width / bounds.height).toBeCloseTo(9 / 16, 3);
    expect(bounds.height).toBeGreaterThan(400);
    const startX = bounds.x + bounds.width / 2;
    const startY = bounds.y + bounds.height * 0.72;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await expect(surface).toHaveAttribute("data-pointer-active", "true");
    for (const distance of [12, 24, 36]) {
      await page.mouse.move(startX + distance, startY, { steps: 3 });
      const position = Number(await surface.getAttribute("data-control-x"));
      expect(position).toBeCloseTo(1_800 + distance / bounds.width * 3_600, 0);
      await expect(surface).toHaveAttribute("data-pointer-active", "true");
    }
    const heldX = await surface.getAttribute("data-control-x");
    await page.mouse.move(startX + 36, startY - 120);
    await expect(surface).toHaveAttribute("data-control-x", heldX!);
    await page.mouse.up();
    await page.mouse.move(startX - 30, startY);
    await expect(surface).toHaveAttribute("data-control-x", heldX!);
    await expect(surface).toHaveAttribute("data-pointer-active", "false");
  });

  test("survives twenty real touch drags and a language switch without restarting", async ({ page, context }) => {
    await page.goto("/demo");
    const surface = page.getByTestId("shooter-control-surface");
    await expect(surface).toBeVisible();
    await expect(page.locator('[data-game-surface="true"] [role="status"]')).toHaveCount(0);
    const bounds = await surface.boundingBox();
    if (!bounds) throw new Error("Battlefield bounds unavailable");
    const canvas = await page.getByTestId("shooter-canvas").elementHandle();
    const client = await context.newCDPSession(page);
    const x = bounds.x + bounds.width / 2;
    for (let index = 0; index < 20; index += 1) {
      await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ id: 1, x, y: bounds.y + bounds.height * 0.57 }] });
      await expect(surface).toHaveAttribute("data-pointer-active", "true");
      await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ id: 1, x: x + 1, y: bounds.y + bounds.height * 0.85 }] });
      await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    }
    await expect(surface).toHaveAttribute("data-pointer-active", "false");
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const previousX = await surface.getAttribute("data-control-x");
    await page.locator("[data-language-toggle]").click();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    expect(await canvas?.evaluate((element) => element.isConnected)).toBe(true);
    await expect(surface).toHaveAttribute("data-control-x", previousX!);
    await client.detach();
  });
});

test("engineering evidence is readable on phone and desktop without protected API calls", async ({ page }) => {
  const protectedRequests: string[] = [];
  page.on("request", request => { if (/\/v2\/(game|runs|story)/.test(request.url())) protectedRequests.push(request.url()); });
  await page.goto("/engineering");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Turn enemies into fans");
  await expect(page.getByRole("link", { name: "Reproduce this experiment" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator("video").first().evaluate(async (video: HTMLVideoElement) => { video.muted = true; await video.play(); });
  await expect.poll(() => page.locator("video").first().evaluate((video: HTMLVideoElement) => video.videoWidth)).toBeGreaterThan(0);
  await page.locator("footer").scrollIntoViewIfNeeded();
  await expect(page.locator("footer")).toBeInViewport();
  expect(protectedRequests).toEqual([]);
  await page.getByRole("link", { name: "Play the demo" }).click();
  await expect(page.getByTestId("shooter-canvas")).toBeVisible();
});

test("a completed real demo exports a local PNG and resets its result on replay", async ({ page }) => {
  test.setTimeout(90_000);
  const protectedRequests: string[] = [];
  page.on("request", request => { if (/\/v2\/(game|runs|story)/.test(request.url())) protectedRequests.push(request.url()); });
  await page.clock.install();
  await page.goto("/demo");
  await expect(page.getByTestId("shooter-canvas")).toBeVisible();
  await expect(page.locator('[data-game-surface="true"] [role="status"]')).toHaveCount(0);
  await page.clock.runFor(41_000);
  if (await page.getByTestId("demo-option-double-take").isVisible()) {
    await page.getByTestId("demo-option-double-take").click();
    await page.clock.runFor(46_000);
  }
  await expect(page.getByTestId("demo-end-actions")).toBeVisible();
  await expect(page.getByTestId("demo-reversals")).toContainText(/\d/);
  await page.getByRole("button", { name: "Switch language to Chinese" }).click();
  await expect(page.getByTestId("demo-end-actions").getByRole("heading")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByTestId("demo-end-actions").getByRole("button").nth(1).click();
  expect((await download).suggestedFilename()).toBe("xuhuan-battle-card.png");
  await page.getByTestId("demo-end-actions").getByRole("button").first().click();
  await expect(page.getByTestId("demo-end-actions")).toHaveCount(0);
  await expect(page.getByTestId("shooter-canvas")).toBeVisible();
  expect(protectedRequests).toEqual([]);
});
