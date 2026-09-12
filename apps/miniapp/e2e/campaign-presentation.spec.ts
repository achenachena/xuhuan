import { expect, test } from "@playwright/test";

test("battlefield preserves portrait geometry and pointer alignment on desktop, landscape and phones", async ({ page }) => {
  await page.goto("/play");
  const canvas = page.getByTestId("shooter-canvas");
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "GO LIVE", exact: true })).toHaveCount(0);
  for (const viewport of [{ width: 1440, height: 900 }, { width: 900, height: 420 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(async () => {
      const box = (await canvas.boundingBox())!;
      return Math.abs(box.width / box.height - 9 / 16);
    }).toBeLessThan(0.001);
    const box = (await canvas.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.getByTestId("shooter-control-surface").boundingBox()).toEqual(box);
  }
});
