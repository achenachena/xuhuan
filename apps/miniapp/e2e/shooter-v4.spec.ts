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

const chapters = [
  ["seventh-dock", "No Sea at the Seventh Dock", "nana7mi", "optimal-nana"],
  ["always-cheerful", "Always Cheerful", "jiaran", "always-on-idol"],
  ["loss-hidden", "Loss Record Hidden", "xiangwan", "perfect-highlight"],
  ["captains-do-not-rest", "Captains Do Not Rest", "bella", "perfect-captain"],
  ["localization-failed", "Localization Failed", "lulu", "approved-translation"],
  ["which-is-original", "Which One Is Original", "xingtong", "physical-original"],
  ["laplace-florist", "The Laplace Florist Never Existed", "nailu", "reality-auditor"],
  ["zero-channel", "Zero Channel", "player-choice", "auto-archive-system"],
] as const;

const characterIDs = [
  "nana7mi",
  "jiaran",
  "xiangwan",
  "bella",
  "lulu",
  "xingtong",
  "nailu",
] as const;

const endingSpecs = [
  ["open-archive", "Open Archive", "Let every imperfect version remain."],
  ["shared-cut", "Shared Cut", "Keep one edit that everyone can revise."],
  ["quiet-signoff", "Quiet Sign-off", "End the stream without erasing the voices."],
] as const;

const fullContent = (): ShooterContent => {
  const character = v4Content.characters[0]!;
  const chapter = v4Content.chapters[0]!;
  return {
    ...v4Content,
    characters: characterIDs.map((id) => ({
      ...character,
      id,
      name: id,
      portrait_url: `/game/v4/players/${id}.webp`,
      sprite_url: `/game/v4/players/${id}.webp`,
    })),
    chapters: chapters.map(([id, title, featured, bossID], index) => ({
      ...chapter,
      id,
      order: index + 1,
      title,
      featured_character: featured,
      unlock_companion: `${featured}-assist`,
      background_url: `/game/v4/backgrounds/${id}.webp`,
      segments: [0, 1, 2].map((segmentIndex) => ({
        ...chapter.segments[0]!,
        id: `${id}-${segmentIndex + 1}`,
        background_url: `/game/v4/backgrounds/${id}.webp`,
      })),
      boss: {
        ...chapter.boss,
        id: bossID,
        sprite_url: `/game/v4/bosses/${bossID}.webp`,
      },
      endings:
        id === "zero-channel"
          ? endingSpecs.map(([endingID, endingTitle, summary]) => ({
              id: endingID,
              title: endingTitle,
              summary,
              messages: [{ sender_id: "system", sender: "System", text: summary }],
            }))
          : [],
    })),
  };
};

const fullyUnlockedGame = (): ShooterGameSnapshot => {
  const base = createV4Game();
  return {
    ...base,
    progress: {
      ...base.progress,
      current_chapter_slug: "zero-channel",
      daily_unlocked: true,
      chapters: chapters.map(([id]) => ({
        chapter_slug: id,
        highest_encore_level: 3,
        clears: id === "zero-channel" ? 0 : 1,
        best_score: 1_000,
        updated_at: "2026-08-31T00:00:00Z",
      })),
      unlocks: characterIDs.map((id) => ({
        type: "character" as const,
        content_slug: id,
        created_at: "2026-08-31T00:00:00Z",
      })),
    },
  };
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

const activeState = (
  chapterSlug: string,
  characterSlug: string,
  companionSlug: string | undefined,
): ShooterRunState => ({
  ...v4BaseState,
  chapter_slug: chapterSlug,
  character_slug: characterSlug,
  companion_slugs: companionSlug ? [companionSlug] : [],
  segment: segmentState(chapterSlug, 0),
});

type InstallOptions = {
  readonly content?: ShooterContent;
  readonly game?: ShooterGameSnapshot;
  readonly mismatched?: boolean;
};

const installAPI = async (
  page: Page,
  { content = v4Content, game = createV4Game(), mismatched = false }: InstallOptions = {},
) => {
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
      const body = request.postDataJSON() as {
        mode: "campaign" | "daily";
        chapter_slug?: string;
        character_slug?: string;
        companion_slug?: string;
      };
      const daily = body.mode === "daily";
      const chapterSlug = daily ? "seventh-dock" : (body.chapter_slug ?? "seventh-dock");
      const characterSlug = daily ? "nana7mi" : (body.character_slug ?? "nana7mi");
      const run = createV4Run({
        id: daily
          ? "10000000-0000-4000-8000-000000000009"
          : "10000000-0000-4000-8000-000000000001",
        mode: body.mode,
        ...(daily ? { daily_date: "2026-08-31" } : {}),
        state: activeState(
          chapterSlug,
          characterSlug,
          body.companion_slug,
        ),
      });
      replaceRun(run);
      await route.fulfill({ status: 201, headers: cors, json: run });
      return;
    }

    const runMatch = url.pathname.match(/^\/v2\/runs\/([^/]+)\/commands$/);
    const current =
      snapshot.campaign_run?.id === runMatch?.[1]
        ? snapshot.campaign_run
        : snapshot.daily_run?.id === runMatch?.[1]
          ? snapshot.daily_run
          : null;
    if (runMatch && current) {
      const command = request.postDataJSON() as {
        type: string;
        option_id?: string;
        scene_id?: string;
      };
      let next = current;
      if (command.type === "complete_segment" && current.state.segment?.boss_id) {
        if (current.mode === "daily") {
          next = createV4Run({
            ...current,
            status: "completed",
            outcome: "cleared",
            version: current.version + 1,
            state: {
              ...current.state,
              phase: "completed",
              segment: undefined,
              score: 2_400,
            },
          });
          snapshot = {
            ...snapshot,
            daily_result: {
              date: "2026-08-31",
              character_slug: current.state.character_slug,
              score: 2_400,
              show_effects: current.state.show_effects,
              companion_slugs: current.state.companion_slugs,
              streak: 1,
            },
          };
        } else {
          const ending = current.state.chapter_slug === "zero-channel";
          const chapter = content.chapters.find(
            (candidate) => candidate.id === current.state.chapter_slug,
          );
          next = createV4Run({
            ...current,
            version: current.version + 1,
            state: {
              ...current.state,
              phase: "story",
              segment: undefined,
              story: {
                scene_id: ending
                  ? "zero-channel-ending"
                  : `${current.state.chapter_slug}-intermission`,
                choice_ids: ending
                  ? endingSpecs.map(([id]) => id)
                  : (chapter?.story.intermission.choices.map((choice) => choice.id) ?? []),
              },
            },
          });
        }
      } else if (command.type === "complete_segment") {
        next = createV4Run({
          ...current,
          version: current.version + 1,
          state: {
            ...current.state,
            phase: "show_choice",
            segment: undefined,
            pending_show_options: ["double-take", "safety-chat"],
          },
        });
      } else if (command.type === "choose_show_option") {
        const nextIndex = current.state.segment_index + 1;
        const chapter = content.chapters.find(
          (candidate) => candidate.id === current.state.chapter_slug,
        );
        const goToBoss = current.mode === "daily" || nextIndex >= 3;
        next = createV4Run({
          ...current,
          version: current.version + 1,
          state: {
            ...current.state,
            phase: "segment",
            segment_index: goToBoss ? 3 : nextIndex,
            segment: segmentState(
              current.state.chapter_slug,
              goToBoss ? 3 : nextIndex,
              goToBoss ? chapter?.boss.id ?? "optimal-nana" : undefined,
            ),
            pending_show_options: [],
            show_effects: [
              ...current.state.show_effects,
              command.option_id ?? "double-take",
            ],
          },
        });
      } else if (command.type === "choose_intermission_reply") {
        const endingID = endingSpecs.find(
          ([id]) => id === command.option_id,
        )?.[0];
        next = createV4Run({
          ...current,
          status: "completed",
          outcome: "cleared",
          version: current.version + 1,
          state: {
            ...current.state,
            phase: "completed",
            story: undefined,
            score: 3_200,
            selected_choice_ids: [command.option_id ?? "keep-voice"],
            ...(endingID ? { ending_id: endingID } : {}),
          },
        });
      }
      replaceRun(next);
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

let nextGatePointerID = 80;

const chooseLeftGate = async (page: Page) => {
  const gate = page.getByTestId("shooter-gate-surface");
  await expect(gate).toBeVisible({ timeout: 8_000 });
  const box = await gate.boundingBox();
  expect(box).not.toBeNull();
  const copyLayerBox = await page
    .getByTestId("shooter-gate-copy-layer")
    .boundingBox();
  const viewport = page.viewportSize();
  expect(copyLayerBox).not.toBeNull();
  expect(copyLayerBox!.x).toBeGreaterThanOrEqual(7);
  expect(copyLayerBox!.x + copyLayerBox!.width).toBeLessThanOrEqual(
    viewport!.width - 7,
  );
  const copy = page.locator('[data-testid^="gate-option-"]');
  await expect(copy).toHaveCount(2);
  for (let index = 0; index < 2; index += 1) {
    const option = copy.nth(index);
    const optionBox = await option.boundingBox();
    expect(optionBox).not.toBeNull();
    expect(optionBox!.x).toBeGreaterThanOrEqual(box!.x);
    expect(optionBox!.x + optionBox!.width).toBeLessThanOrEqual(
      box!.x + box!.width + 1,
    );
    const sizes = await option.locator("h2, p").evaluateAll((elements) =>
      elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
    );
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(9);
  }
  nextGatePointerID += 1;
  const pointerId = nextGatePointerID;
  await gate.dispatchEvent("pointerdown", {
    pointerId,
    pointerType: "touch",
    isPrimary: true,
    clientX: box!.x + box!.width / 2,
    clientY: box!.y + box!.height * 0.8,
    bubbles: true,
  });
  await gate.dispatchEvent("pointermove", {
    pointerId,
    pointerType: "touch",
    isPrimary: true,
    clientX: box!.x + 10,
    clientY: box!.y + box!.height * 0.8,
    bubbles: true,
  });
  await expect(gate).toHaveAttribute("data-pointer-active", "true");
  const controlX = Number(await gate.getAttribute("data-control-x"));
  expect(controlX).toBeLessThanOrEqual(1_620);
  await expect(gate).toHaveCount(0, { timeout: 5_000 });
};

test("single-finger campaign restores and reaches all three gates", async ({ page }) => {
  await installAPI(page);
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
  expect(canvasBox!.width).toBeCloseTo(viewport!.width, 0);
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

test("all eight chapters are browseable and finale accepts every unlocked pilot", async ({
  page,
}) => {
  const content = fullContent();
  await installAPI(page, { content, game: fullyUnlockedGame() });
  await page.goto("/");
  await expect(page.getByText("ONLINE 8/8")).toBeVisible();
  for (const [id, title] of chapters) {
    await page.getByTestId(`chapter-${id}`).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }
  for (const id of characterIDs) {
    await expect(page.getByTestId(`pilot-${id}`)).toBeVisible();
  }
  await page.getByTestId("pilot-lulu").click();
  await expect(page.getByRole("img", { name: "lulu" })).toBeVisible();
  await expect(page.getByTestId("protocol-maintenance")).toHaveCount(0);
});

test("daily runs through a normal segment, gate, boss, and persisted result", async ({
  page,
}) => {
  await installAPI(page, { content: fullContent(), game: fullyUnlockedGame() });
  await page.goto("/");
  await page.getByTestId("start-daily").click();
  await expect(page.getByTestId("shooter-canvas")).toBeVisible();
  await chooseLeftGate(page);
  await expect(page.getByTestId("shooter-hud")).toContainText("BOSS");
  await expect(page.getByTestId("run-conclusion")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("2,400")).toBeVisible();
  await page.reload();
  await expect(page.getByText("2,400")).toBeVisible();
});

for (const [endingID, endingTitle, endingSummary] of endingSpecs) {
  test(`renders explicit finale ending ${endingID}`, async ({ page }) => {
    const content = fullContent();
    const completed = createV4Run({
      status: "completed",
      outcome: "cleared",
      state: {
        ...v4BaseState,
        phase: "completed",
        chapter_slug: "zero-channel",
        segment: undefined,
        ending_id: endingID,
        selected_choice_ids: [endingID],
        score: 4_200,
      },
    });
    await installAPI(page, {
      content,
      game: { ...fullyUnlockedGame(), campaign_run: completed },
    });
    await page.goto("/");
    await expect(page.getByText(endingTitle)).toBeVisible();
    await expect(page.getByText(endingSummary).first()).toBeVisible();
  });
}

test("protocol mismatch never initializes a canvas", async ({ page }) => {
  await installAPI(page, { mismatched: true });
  await page.goto("/");
  await expect(page.getByTestId("protocol-maintenance")).toBeVisible();
  await expect(page.getByTestId("shooter-canvas")).toHaveCount(0);
});
