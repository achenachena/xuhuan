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
    await expect(page.getByRole("link", { name: "Play 60-second demo", exact: true }).first()).toHaveAttribute("href", "/demo");
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
    await expect(page.getByRole("heading", { name: "Portfolio Demo" })).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("start-browser-demo").click();
    await expect(page.locator("canvas")).toBeVisible();
    await page.waitForTimeout(500);
    expect(protectedRequests).toEqual([]);
  });
});
