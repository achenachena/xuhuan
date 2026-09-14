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

test("visual story choice keeps its ID and retries only next-character start", async ({ page }) => {
  // Prepare a genuine cleared Boss via WASM commands; this tests navigation,
  // not combat timing. There is no production fixture or accelerated FPS claim.
  await page.addInitScript(() => {
    let invoke: ((request: string) => string) | undefined;
    let prepared = false, failedStart = false, choices = 0;
    Object.defineProperty(window, "xuhuanCampaign", { configurable: true, get: () => invoke,
      set: (engine: (request: string) => string) => { invoke = raw => {
        const request = JSON.parse(raw);
        if (request.action === "start" && request.chapter_slug === "always-cheerful" && !failedStart) {
          failedStart = true; return JSON.stringify({ error: "Temporary stage-start failure" });
        }
        if (request.command?.type === "choose_intermission_reply") { choices++; document.documentElement.dataset.storyWrites = String(choices); }
        let response = JSON.parse(engine(raw));
        if (!prepared && request.action === "start" && response.game?.campaign_run) {
          prepared = true;
          while (response.game.campaign_run.state.phase !== "story") {
            const run = response.game.campaign_run;
            const command = run.state.phase === "show_choice" ? { type: "choose_show_option", option_id: run.state.pending_show_options[0] }
              : { type: "complete_segment", segment_outcome: { won: true, health: 3, score: 100 } };
            response = JSON.parse(engine(JSON.stringify({ action: "command", save: response.save, mode: "campaign", id: run.id, expected_version: run.version, command })));
          }
        }
        if (response.game?.campaign_run) document.documentElement.dataset.observedRun = JSON.stringify(response.game.campaign_run);
        return JSON.stringify(response);
      }; },
    });
  });
  await page.goto("/play");
  const choice = page.getByTestId("story-option-keep-seven-second-voice");
  await expect(choice).toBeVisible();
  await expect(choice.locator('[data-story-action="seal"]')).toBeVisible();
  await expect(page.getByTestId("story-option-delete-learned-reply").locator('[data-story-action="erase"]')).toBeVisible();
  await expect(page.locator("details")).not.toHaveAttribute("open");
  await page.getByRole("button", { name: "Switch language to Chinese" }).click();
  await expect(choice).toContainText("封存录音");
  await page.locator("[data-language-toggle]").click();
  await choice.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Retry next stage →" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-story-writes", "1");
  await page.getByRole("button", { name: "Retry next stage →" }).tap();
  await expect(page.getByTestId("shooter-canvas")).toBeVisible();
  const next = await run(page);
  expect(next.state.chapter_slug).toBe("always-cheerful");
  expect(next.state.show_effects).toEqual([]);
  expect(next.state.selected_choice_ids).toContain("keep-seven-second-voice");
  await expect(page.locator("html")).toHaveAttribute("data-story-writes", "1");
});
