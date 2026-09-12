import { expect, test, type Page, type Route } from "@playwright/test";

import type {
  ShooterContent,
  ShooterGameRun,
  ShooterGameSnapshot,
  ShooterRunState,
} from "../src/lib/api/types";
import {
  createV4Game,
  createV4Run,
  v4BaseState,
  v4Content,
  v4Runtime,
} from "../src/test/v4-fixtures";

test.describe.configure({ timeout: 60_000 });

const cors = {
  "access-control-allow-origin": "*",
  "content-type": "application/json",
};

const runtimeBoss = (bossID: string) => ({
  id: bossID as NonNullable<typeof v4Runtime.boss>["id"],
  health: 90,
  score: 2_000,
  stages: [
    {
      id: "opening",
      health_threshold: 100,
      move_pattern: "anchor",
      shot_pattern: "aimed",
      fire_interval: 30,
      projectile_speed: 34,
      damage: 1,
      telegraph_ticks: 10,
      special: "show-lock",
    },
    {
      id: "middle",
      health_threshold: 66,
      move_pattern: "sweep",
      shot_pattern: "fan",
      fire_interval: 26,
      projectile_speed: 36,
      damage: 1,
      telegraph_ticks: 9,
      special: "show-lock",
    },
    {
      id: "final",
      health_threshold: 33,
      move_pattern: "mirror",
      shot_pattern: "ring",
      fire_interval: 22,
      projectile_speed: 38,
      damage: 1,
      telegraph_ticks: 8,
      special: "show-lock",
    },
  ],
});

const segmentState = (
  chapterSlug: string,
  segmentIndex: number,
  bossID?: string,
) => {
  const durationTicks = bossID ? 180 : 90;
  return {
    segment_slug: `${chapterSlug}-${bossID ? "boss" : segmentIndex + 1}`,
    segment_index: segmentIndex,
    seed: `${chapterSlug}-${segmentIndex}`,
    duration_ticks: durationTicks,
    ...(bossID ? { boss_id: bossID } : { wave_id: "test-wave" }),
    reward_stage: (["weapon", "companion", "rescue"] as const)[
      Math.min(2, segmentIndex)
    ],
    background_url: `/game/v4/backgrounds/${chapterSlug}.webp`,
    runtime_config: {
      ...v4Runtime,
      seed: `${chapterSlug}-${segmentIndex}`,
      duration_ticks: durationTicks,
      ...(bossID ? { boss: runtimeBoss(bossID) } : {}),
    },
  };
};

// Fixed first-chapter responses exercise the Telegram client contract. Campaign
// rules and all chapter/ending combinations are covered by Go and shipped WASM.
const campaignResponses = (): ShooterGameRun[] => {
  const states: ShooterRunState[] = [];
  for (let index = 0; index < 3; index++) {
    states.push(
      { ...v4BaseState, segment_index: index, segment: segmentState("seventh-dock", index) },
      { ...v4BaseState, segment_index: index, phase: "show_choice", segment: undefined,
        pending_show_options: ["double-take", "safety-chat"] },
    );
  }
  states.push(
    { ...v4BaseState, segment_index: 3, segment: segmentState("seventh-dock", 3, "optimal-nana") },
    { ...v4BaseState, phase: "story", segment: undefined,
      story: { scene_id: "seventh-dock-intermission", choice_ids: ["keep-voice"] } },
    { ...v4BaseState, phase: "completed", segment: undefined, score: 3_200, selected_choice_ids: ["keep-voice"] },
  );
  return states.map((state, index) => createV4Run({ state, version: index + 1,
    ...(state.phase === "completed" ? { status: "completed", outcome: "cleared" } : {}),
  }));
};

type InstallOptions = {
  readonly content?: ShooterContent;
  readonly game?: ShooterGameSnapshot;
  readonly mismatched?: boolean;
  readonly responses?: ShooterGameRun[];
};

const installAPI = async (
  page: Page,
  { content = v4Content, game = createV4Game(), mismatched = false, responses = [] }: InstallOptions = {},
) => {
  // Match Telegram's documented launch parameters so the real SDK exposes a
  // non-empty initData value. API responses remain intercepted below; this is
  // a host fixture, not an alternate production authentication path.
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      "__telegram__initParams",
      JSON.stringify({
        tgWebAppData: "query_id=e2e&hash=verified-by-test-api",
        tgWebAppVersion: "8.0",
        tgWebAppPlatform: "android",
      }),
    );
  });
  let snapshot = game;

  const replaceRun = (run: ShooterGameRun) => {
    snapshot =
      run.mode === "daily"
        ? { ...snapshot, daily_run: run }
        : { ...snapshot, campaign_run: run };
  };

  await page.route("**/v2/**", async (route: Route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          ...cors,
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "GET,POST",
        },
      });
      return;
    }
    const url = new URL(request.url());
    if (url.pathname === "/v2/content/v4") {
      const locale = url.searchParams.get("locale") === "zh-CN" ? "zh-CN" : "en";
      await route.fulfill({ headers: cors, json: { ...content, locale } });
      return;
    }
    if (url.pathname === "/v2/game") {
      await route.fulfill({
        headers: cors,
        json: mismatched ? { ...snapshot, protocol: "unsupported-v0" } : snapshot,
      });
      return;
    }
    if (url.pathname === "/v2/runs" && request.method() === "POST") {
      const run = responses.shift();
      expect(run, "unexpected start request").toBeDefined();
      replaceRun(run!);
      await route.fulfill({ status: 201, headers: cors, json: run });
      return;
    }
    if (/^\/v2\/runs\/[^/]+\/commands$/.test(url.pathname)) {
      const current = snapshot.campaign_run ?? snapshot.daily_run;
      const expectedCommand = current?.state.phase === "segment" ? "complete_segment"
        : current?.state.phase === "show_choice" ? "choose_show_option" : "choose_intermission_reply";
      expect(request.postDataJSON().type).toBe(expectedCommand);
      const next = responses.shift();
      expect(next, "unexpected command request").toBeDefined();
      replaceRun(next!);
      await route.fulfill({ headers: cors, json: { run: next, events: [] } });
      return;
    }
    await route.fulfill({
      status: 404,
      headers: cors,
      json: {
        error: { code: "not_found", message: "not found", request_id: "e2e" },
      },
    });
  });
};

const chooseLeftGate = async (page: Page) => {
  const gate = page.getByTestId("shooter-gate-battlefield");
  await expect(gate).toBeVisible({ timeout: 8_000 });
  const box = await gate.boundingBox();
  expect(box).not.toBeNull();
  const copyLayerBox = await page
    .getByTestId("shooter-gate-copy-layer")
    .boundingBox();
  const viewport = page.viewportSize();
  expect(copyLayerBox).not.toBeNull();
  expect(copyLayerBox!.x).toBeGreaterThanOrEqual(box!.x);
  expect(copyLayerBox!.x + copyLayerBox!.width).toBeLessThanOrEqual(
    viewport!.width,
  );
  const copy = page.getByTestId("shooter-gate-copy-layer").getByRole("button");
  await expect(copy).toHaveCount(2);
  for (let index = 0; index < 2; index += 1) {
    const option = copy.nth(index);
    await expect(option).toBeEnabled();
    await expect(option).toHaveAccessibleName(/.+/);
    const optionBox = await option.boundingBox();
    expect(optionBox).not.toBeNull();
    expect(optionBox!.x).toBeGreaterThanOrEqual(box!.x);
    expect(optionBox!.x + optionBox!.width).toBeLessThanOrEqual(
      box!.x + box!.width + 1,
    );
    expect(optionBox!.width).toBeGreaterThanOrEqual(48);
    expect(optionBox!.height).toBeGreaterThanOrEqual(48);
    expect(optionBox!.y).toBeGreaterThanOrEqual(box!.y);
    expect(optionBox!.y + optionBox!.height).toBeLessThanOrEqual(box!.y + box!.height);

  }
  await copy.first().tap();
  await expect(gate).toHaveCount(0, { timeout: 5_000 });
};

test("pixel rescue is keyboard-operable and never steals a held drag @small-screen", async ({ page }) => {
  const run = createV4Run({
    state: {
      ...v4BaseState,
      segment: {
        ...v4BaseState.segment!,
        duration_ticks: 900,
        runtime_config: {
          ...v4Runtime,
          duration_ticks: 900,
          starting_rescue_charge: 100,
          wave: { id: "rescue-control-check", spawns: [] },
        },
      },
    },
  });
  await installAPI(page, { game: createV4Game({ campaign_run: run }) });
  await page.goto("/");
  const surface = page.getByTestId("shooter-control-surface");
  const rescue = page.getByRole("button", { name: "Rescue ready", exact: true });
  await expect(surface).toBeVisible();
  await expect(page.locator('[data-game-surface="true"] [role="status"]')).toHaveCount(0);
  await expect(rescue).toBeEnabled();
  await expect(rescue).toHaveAttribute("aria-disabled", "false");
  const buttonBox = await rescue.boundingBox();
  const fieldBox = await surface.boundingBox();
  expect(buttonBox).not.toBeNull();
  expect(fieldBox).not.toBeNull();
  expect(buttonBox!.width).toBeGreaterThanOrEqual(48);
  expect(buttonBox!.height).toBeGreaterThanOrEqual(48);
  expect(buttonBox!.width).toBeLessThanOrEqual(68);
  expect(buttonBox!.height).toBeLessThanOrEqual(68);
  expect(buttonBox!.x + buttonBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(buttonBox!.y + buttonBox!.height).toBeLessThanOrEqual(page.viewportSize()!.height);

  await page.mouse.move(fieldBox!.x + fieldBox!.width / 2, fieldBox!.y + fieldBox!.height * 0.8);
  await page.mouse.down();
  await expect(surface).toHaveAttribute("data-pointer-active", "true");
  await page.mouse.move(buttonBox!.x + buttonBox!.width / 2, buttonBox!.y + buttonBox!.height / 2);
  await expect(surface).toHaveAttribute("data-pointer-active", "true");
  await page.mouse.up();
  await expect(rescue).toBeEnabled();
  const heldX = await surface.getAttribute("data-control-x");

  await rescue.focus();
  await page.keyboard.press("Enter");
  const charging = page.getByTestId("rescue-button");
  await expect(charging).toBeDisabled();
  await expect(charging).toHaveAttribute("aria-disabled", "true");
  await expect(charging).toHaveAttribute("data-state", "charging");
  await expect(charging).toHaveAttribute("title", "HYPE: 0%");
  await expect(surface).toHaveAttribute("data-control-x", heldX!);
  expect(await charging.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe("none");

  await page.mouse.move(buttonBox!.x + buttonBox!.width / 2, buttonBox!.y + buttonBox!.height / 2);
  await page.mouse.down();
  await expect(surface).toHaveAttribute("data-pointer-active", "true");
  await page.mouse.move(buttonBox!.x + 8, buttonBox!.y + buttonBox!.height / 2);
  await page.mouse.up();
  await expect(surface).toHaveAttribute("data-pointer-active", "false");
  expect(Number(await surface.getAttribute("data-control-x"))).toBeLessThan(Number(heldX));
});

test("Telegram campaign restores and reaches all three gates @small-screen", async ({ page }) => {
  await installAPI(page, { responses: campaignResponses() });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByTestId("chapter-intro-feed")).toBeVisible();
  await page.getByRole("button", { name: "Switch language to Chinese" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await page.locator('[data-language-toggle="true"]').click();
  await page.getByTestId("start-campaign").click();

  await page.evaluate(() => {
    const root = document.documentElement;
    root.dataset.telegramHost = "true";
    root.dataset.telegramFullscreen = "true";
    root.style.setProperty("--xuhuan-tg-content-safe-top", "20px");
    root.style.setProperty("--xuhuan-tg-content-safe-bottom", "8px");
    root.style.setProperty("--xuhuan-tg-content-safe-left", "7px");
    root.style.setProperty("--xuhuan-tg-content-safe-right", "9px");
  });

  const hud = page.getByTestId("shooter-hud");
  const surface = page.getByTestId("shooter-control-surface");
  const canvas = page.getByTestId("shooter-canvas");
  await expect(surface).toBeVisible();
  const battlefield = page.getByTestId("shooter-battlefield");
  const originalSegment = await battlefield.getAttribute("data-segment-slug");
  await page.reload();
  await expect(page.getByTestId("shooter-battlefield")).toHaveAttribute(
    "data-segment-slug",
    originalSegment!,
  );
  await page.evaluate(() => {
    const root = document.documentElement;
    root.dataset.telegramHost = "true";
    root.dataset.telegramFullscreen = "true";
    root.style.setProperty("--xuhuan-tg-content-safe-top", "20px");
    root.style.setProperty("--xuhuan-tg-content-safe-bottom", "8px");
    root.style.setProperty("--xuhuan-tg-content-safe-left", "7px");
    root.style.setProperty("--xuhuan-tg-content-safe-right", "9px");
  });

  const hudBox = await hud.boundingBox();
  const surfaceBox = await surface.boundingBox();
  const canvasBox = await canvas.boundingBox();
  const languageBox = await page
    .locator('[data-language-toggle="true"]')
    .boundingBox();
  const viewport = page.viewportSize();
  expect(hudBox?.height).toBeLessThanOrEqual(49);
  expect(hudBox!.x).toBeGreaterThanOrEqual(14);
  expect(hudBox!.x + hudBox!.width).toBeLessThanOrEqual(viewport!.width - 16);
  expect(languageBox!.x).toBeGreaterThanOrEqual(hudBox!.x);
  expect(languageBox!.x + languageBox!.width).toBeLessThanOrEqual(
    hudBox!.x + hudBox!.width,
  );
  expect(surfaceBox!.y).toBeGreaterThanOrEqual(hudBox!.y + hudBox!.height - 1);
  expect(canvasBox!.x).toBeCloseTo(surfaceBox!.x, 0);
  expect(canvasBox!.y).toBeCloseTo(surfaceBox!.y, 0);
  expect(canvasBox!.width).toBeCloseTo(surfaceBox!.width, 0);
  expect(canvasBox!.height).toBeCloseTo(surfaceBox!.height, 0);
  expect(canvasBox!.width).toBeLessThanOrEqual(viewport!.width);
  expect(canvasBox!.width / canvasBox!.height).toBeCloseTo(9 / 16, 3);
  expect(canvasBox!.height).toBeGreaterThan(viewport!.height * 0.78);

  const movePointer = async (
    type: string,
    x: number,
    y: number,
    pointerId = 7,
  ) =>
    surface.dispatchEvent(type, {
      pointerId,
      pointerType: "touch",
      isPrimary: true,
      clientX: surfaceBox!.x + x,
      clientY: surfaceBox!.y + y,
      bubbles: true,
    });
  await movePointer("pointerdown", surfaceBox!.width / 2, surfaceBox!.height * 0.8);
  await movePointer("pointermove", surfaceBox!.width * 0.2, surfaceBox!.height * 0.85);
  const heldX = await surface.getAttribute("data-control-x");
  await movePointer("pointermove", surfaceBox!.width * 0.2, 1);
  expect(await surface.getAttribute("data-control-x")).toBe(heldX);
  await movePointer("pointerup", surfaceBox!.width * 0.2, 1);
  await movePointer("pointermove", surfaceBox!.width * 0.8, surfaceBox!.height * 0.8);
  expect(await surface.getAttribute("data-control-x")).toBe(heldX);

  for (let index = 0; index < 20; index += 1) {
    await movePointer(
      "pointerdown",
      surfaceBox!.width / 2,
      surfaceBox!.height * 0.7,
      20 + index,
    );
    await movePointer(
      "pointermove",
      surfaceBox!.width / 2,
      surfaceBox!.height + 100,
      20 + index,
    );
    await movePointer(
      "pointerup",
      surfaceBox!.width / 2,
      surfaceBox!.height + 100,
      20 + index,
    );
  }
  await expect(surface).toBeVisible();

  for (let gateIndex = 0; gateIndex < 3; gateIndex += 1) {
    await chooseLeftGate(page);
    await expect(page.getByTestId("shooter-canvas")).toBeVisible({ timeout: 3_000 });
  }
  await expect(hud).toContainText("BOSS");
  await expect(page.getByTestId("intermission-story")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("story-option-keep-voice").click();
  await expect(page.getByTestId("run-conclusion")).toBeVisible();
});

test("daily runs through a normal segment, gate, boss, and persisted result", async ({ page }) => {
  const campaign = campaignResponses();
  const responses = [campaign[0]!, campaign[1]!, campaign[6]!, campaign[8]!].map((run, index) => ({
    ...run, mode: "daily" as const, version: index + 1, daily_date: "2026-08-31",
  }));
  const game = createV4Game();
  await installAPI(page, { game: { ...game, progress: { ...game.progress, daily_unlocked: true } }, responses });
  await page.goto("/");
  await page.getByTestId("start-daily").click();
  await expect(page.getByTestId("shooter-canvas")).toBeVisible();
  await chooseLeftGate(page);
  await expect(page.getByTestId("shooter-hud")).toContainText("BOSS");
  await expect(page.getByTestId("run-conclusion")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("3,200")).toBeVisible();
  await page.reload();
  await expect(page.getByText("3,200")).toBeVisible();
});

// Ending selection rules are tested in Go; one browser case covers presentation.
test("renders the saved finale ending", async ({ page }) => {
  const chapter = v4Content.chapters[0]!;
  const ending = { id: "open-archive" as const, title: "Open Archive", summary: "Let every imperfect version remain.", messages: [] };
  const content = { ...v4Content, chapters: [{ ...chapter, id: "zero-channel", endings: [ending] }] };
  const completed = createV4Run({ status: "completed", outcome: "cleared", state: {
    ...v4BaseState, phase: "completed", chapter_slug: "zero-channel", segment: undefined,
    ending_id: ending.id, selected_choice_ids: [ending.id],
  } });
  await installAPI(page, { content, game: createV4Game({ campaign_run: completed }) });
  await page.goto("/");
  await expect(page.getByText(ending.title)).toBeVisible();
  await expect(page.getByText(ending.summary).first()).toBeVisible();
});

test("protocol mismatch never initializes a canvas", async ({ page }) => {
  await installAPI(page, { mismatched: true });
  await page.goto("/");
  await expect(page.getByTestId("protocol-maintenance")).toBeVisible();
  await expect(page.getByTestId("shooter-canvas")).toHaveCount(0);
});
