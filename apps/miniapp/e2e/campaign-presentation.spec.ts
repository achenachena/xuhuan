import { expect, test } from "@playwright/test";

const key = "xuhuan.campaign.v1";

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

test("saved intermission becomes a compact choice and Continue starts the next chapter", async ({ page }) => {
  await page.goto("/play");
  await expect(page.getByTestId("shooter-canvas")).toBeVisible({ timeout: 20_000 });
  // Use bounded synthetic results to reach the persisted scene, not to measure gameplay.
  await page.evaluate(key => {
    let save = JSON.parse(localStorage.getItem(key)!);
    for (let step = 0; step < 10 && save.campaign.run.state.phase !== "story"; step++) {
      const run = save.campaign.run;
      const command = run.state.phase === "segment"
        ? { type: "complete_segment", segment_outcome: { won: true, health: 3, score: 100 } }
        : { type: "choose_show_option", option_id: run.state.pending_show_options[0] };
      const response = JSON.parse(window.xuhuanCampaign!(JSON.stringify({ action: "command", save, mode: "campaign", id: run.id, expected_version: run.version, command })));
      if (response.error) throw new Error(response.error);
      save = response.save;
    }
    localStorage.setItem(key, JSON.stringify(save));
  }, key);
  await page.reload();
  const card = page.getByTestId("intermission-story");
  await expect(card).toBeVisible();
  await expect(page.getByText("STAGE CLEAR", { exact: true })).toBeVisible();
  await expect(card.locator("details")).not.toHaveAttribute("open");
  await page.setViewportSize({ width: 1440, height: 900 });
  expect((await card.boundingBox())!.width).toBeLessThanOrEqual(384);
  const choice = page.locator('[data-testid^="story-option-"]').first();
  const optionID = (await choice.getAttribute("data-testid"))!.replace("story-option-", "");
  await choice.click();
  await expect(page.getByTestId("return-to-hub")).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).campaign.run.state.selected_choice_ids, key)).toContain(optionID);
  await expect(page.getByTestId("replay-run")).toHaveCount(0);
  await page.getByTestId("return-to-hub").click();
  await expect(page.getByTestId("shooter-canvas")).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).campaign.run.state.chapter_slug, key)).not.toBe("seventh-dock");
});
