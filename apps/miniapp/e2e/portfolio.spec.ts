import { expect, test } from "@playwright/test";

test.describe("public browser portfolio", () => {
  test("renders recruiter links without calling protected game APIs", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const protectedRequests: string[] = [];
    page.on("request", (request) => {
      if (/\/v2\/(game|runs|story)/.test(request.url())) protectedRequests.push(request.url());
    });

    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Keep the last impossible livestream online." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Play 90-second demo", exact: true }).first()).toHaveAttribute("href", "/demo");
    await expect(page.getByRole("link", { name: "Open full game in Telegram" })).toHaveAttribute("href", "https://t.me/xuhuangamebot");
    await expect(page.getByRole("link", { name: "View source on GitHub" })).toHaveAttribute("href", "https://github.com/achenachena/xuhuan");
    await page.waitForTimeout(250);
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
    await page.waitForTimeout(500);
    expect(protectedRequests).toEqual([]);
  });

  test("follows a continuously held mouse, ignores Y, and stops on release", async ({ page }) => {
    await page.goto("/demo");
    const surface = page.getByTestId("shooter-control-surface");
    await expect(surface).toBeVisible();
    await expect(page.locator('[data-game-surface="true"] [role="status"]')).toHaveCount(0);
    const bounds = await surface.boundingBox();
    if (!bounds) throw new Error("Battlefield bounds unavailable");
    expect(bounds.width).toBeGreaterThan(280);
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
