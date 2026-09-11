import { expect, test } from "@playwright/test";

const key = "xuhuan.campaign.v1";
const readSave = (page: import("@playwright/test").Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), key);

test("browser campaign starts without authentication and preserves the room and language across reload", async ({ page }) => {
  const protectedRequests: string[] = [];
  const errors: string[] = [];
  const campaignDownloads: string[] = [];
  page.on("request", request => { if (request.url().includes("/campaign/v1/")) campaignDownloads.push(request.url()); });
  page.on("request", request => { if (/\/v2\/(game|runs|story)/.test(request.url())) protectedRequests.push(request.url()); });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/demo");
  await expect(page.getByTestId("shooter-canvas")).toBeVisible();
  expect(campaignDownloads).toEqual([]);
  await page.getByRole("link", { name: "Play full campaign" }).click();
  await expect(page).toHaveURL(/\/play$/);
  await expect.poll(() => readSave(page)).not.toBeNull();
  await expect(page.getByTestId("shooter-canvas")).toBeVisible({ timeout: 20_000 });
  const before = await readSave(page);
  expect(before.campaign.run.state.chapter_slug).toBe("seventh-dock");
  await page.getByRole("button", { name: "Switch language to Chinese" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await page.reload();
  await expect(page.getByTestId("shooter-canvas")).toBeVisible({ timeout: 20_000 });
  const after = await readSave(page);
  expect(after.campaign).toEqual(before.campaign);
  expect(protectedRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test("a real browser battle saves its result before advancing or replaying", async ({ page }) => {
  test.setTimeout(90_000);
  await page.clock.install();
  await page.goto("/play");
  await expect(page.getByTestId("shooter-canvas")).toBeVisible();
  await expect(page.locator('[data-game-surface="true"] [role="status"]')).toHaveCount(0);
  const before = await readSave(page);
  await page.clock.runFor(80_000);
  await expect.poll(async () => (await readSave(page)).campaign.run.version).toBeGreaterThan(before.campaign.run.version);
  const completed = (await readSave(page)).campaign;
  await page.reload();
  await expect.poll(async () => (await readSave(page)).campaign.run.version).toBe(completed.run.version);
  expect((await readSave(page)).campaign).toEqual(completed);
});

test("corrupt saves are preserved until the player explicitly resets them", async ({ page }) => {
  await page.goto("/play");
  await expect(page.getByTestId("shooter-canvas")).toBeVisible({ timeout: 20_000 });
  await page.evaluate(key => localStorage.setItem(key, "{broken"), key);
  await page.reload();
  await expect(page.locator("aside[role=alert]")).toContainText("has not been overwritten");
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe("{broken");
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "Reset local save" }).click();
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe("{broken");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Reset local save" }).click();
  await expect(page.getByTestId("shooter-canvas")).toBeVisible();
});

test("blocked storage explains the failure without claiming to save", async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException("Quota exceeded", "QuotaExceededError"); }; });
  await page.goto("/play");
  await expect(page.locator("aside[role=alert]")).toContainText("Progress could not be saved", { timeout: 20_000 });
  await expect(page.getByRole("button", { name: "GO LIVE", exact: true })).toHaveCount(0);
});

test("another tab observes the same saved room instead of overwriting it", async ({ page, context }) => {
  await page.goto("/play");
  await expect(page.getByTestId("shooter-canvas")).toBeVisible({ timeout: 20_000 });
  const second = await context.newPage();
  await second.goto("/play");
  await expect(second.getByTestId("shooter-canvas")).toBeVisible({ timeout: 20_000 });
  await expect(second.getByTestId("shooter-canvas")).toBeVisible();
  expect((await readSave(second)).campaign.run.id).toBe((await readSave(page)).campaign.run.id);
});

test("shared browser rules complete all chapters and expose the unlocked daily hub", async ({ page }) => {
  await page.goto("/play");
  await expect(page.getByTestId("shooter-canvas")).toBeVisible({ timeout: 20_000 });
  // Synthetic bounded room results test the shipped WASM and persistence format,
  // not gameplay difficulty or human completion rates.
  const ending = await page.evaluate(key => {
    const invoke = (request: object) => JSON.parse(window.xuhuanCampaign!(JSON.stringify(request)));
    const chapters = invoke({ action: "content", locale: "en" }).content.chapters;
    let save = JSON.parse(localStorage.getItem(key)!);
    save.campaign = null;
    const act = (request: object) => {
      const response = invoke({ ...request, save });
      if (response.error) throw new Error(response.error);
      save = response.save;
    };
    for (const chapter of chapters) {
      act({ action: "start", mode: "campaign", id: crypto.randomUUID(), chapter_slug: chapter.id, character_slug: chapter.featured_character === "player-choice" ? "nana7mi" : chapter.featured_character });
      for (let step = 0; step < 20 && save.campaign.run.status === "active"; step++) {
        const run = save.campaign.run;
        const state = run.state;
        const command = state.phase === "segment" ? { type: "complete_segment", segment_outcome: { won: true, health: 3, score: 100 } }
          : state.phase === "show_choice" ? { type: "choose_show_option", option_id: state.pending_show_options[0] }
          : { type: "choose_intermission_reply", scene_id: state.story.scene_id, option_id: state.story.choice_ids[0] };
        act({ action: "command", mode: "campaign", id: run.id, expected_version: run.version, command });
      }
      if (save.campaign.run.outcome !== "cleared") throw new Error("Chapter did not complete");
      if (chapter.id !== "zero-channel") act({ action: "hub" });
    }
    localStorage.setItem(key, JSON.stringify(save));
    return save.progress.ending;
  }, key);
  expect(ending).toBeTruthy();
  await page.reload();
  await page.getByRole("button", { name: "Chapters & loadout" }).click();
  await expect(page.getByRole("button", { name: "Daily Aftershow" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Daily Aftershow" }).click();
  await expect(page.getByTestId("shooter-canvas")).toBeVisible();
  expect((await readSave(page)).daily.run.mode).toBe("daily");
});
