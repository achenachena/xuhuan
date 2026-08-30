import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

const apiURL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8080";

// This journey mutates the single development player. Retrying it in the same
// worker would no longer exercise onboarding and the first tutorial.
test.describe.configure({ retries: 0 });

type Content = {
  version: "v3";
  protocol: "action-v2";
  locale: "en" | "zh-CN";
  characters: Array<{ slug: string; name: string }>;
  chapters: Array<{
    slug: string;
    order: number;
    character_slug: string | null;
    finale: boolean;
  }>;
  events: Array<{ slug: string; options: Array<{ slug: string }> }>;
  scenes: Array<{
    slug: string;
    title: string;
    messages: Array<{ text: string }>;
    options: Array<{ slug: string; label: string }>;
  }>;
};

type Encounter = {
  slug: string;
  seed: string;
  kind: string;
  duration_ticks: number;
  max_ticks: number;
  objective: { kind: string; target: number };
  hazards: string[];
};

type Run = {
  id: string;
  mode: "campaign" | "daily";
  version: number;
  status: "active" | "completed" | "abandoned";
  outcome: "cleared" | "failed" | "abandoned" | null;
  state: {
    phase: "map" | "encounter" | "reward" | "event" | "rest" | "completed";
    chapter_slug: string;
    health: number;
    max_health: number;
    score: number;
    rerolls_remaining: number;
    map: {
      nodes: Array<{ id: string; layer: number; type: string; status: string }>;
    };
    encounter?: Encounter;
    reward?: { module_choices: string[]; rerolled: boolean };
    current_event_slug?: string;
    modules: Array<{ slug: string; level: number }>;
    plugins: string[];
    narrative_modifier: { boss_variant: string };
    runtime_config: Record<string, unknown>;
  };
};

type Game = {
  protocol: "action-v2";
  content_version: "v3";
  progress: {
    version: number;
    current_chapter_slug: string;
    highest_noise_level: number;
    daily_unlocked: boolean;
  };
  campaign_run: Run | null;
  daily_run: Run | null;
  daily_result?: {
    date: string;
    character_slug: string;
    score: number;
    streak: number;
  } | null;
  pending_scene_slug: string | null;
};

type JourneyCoverage = {
  readonly routeTypes: Set<string>;
  readonly storySlugs: Set<string>;
  readonly campaignStarts: Set<string>;
  rewardChoice: boolean;
  reroll: boolean;
  event: boolean;
  rest: boolean;
  safeMap: boolean;
  safeInterstitial: boolean;
  dailyStart: boolean;
};

const getGame = async (request: APIRequestContext): Promise<Game> => {
  const response = await request.get(`${apiURL}/v2/game`);
  if (!response.ok()) {
    throw new Error(`GET /v2/game failed: ${await response.text()}`);
  }
  return (await response.json()) as Game;
};

const activeRun = (game: Game, mode: Run["mode"]): Run | null =>
  mode === "daily" ? game.daily_run : game.campaign_run;

const simulateTelegramHost = (page: Page) =>
  page.evaluate(() => {
    document.documentElement.dataset.telegramHost = "true";
    document.documentElement.dataset.telegramFullscreen = "true";
  });

const choosePendingStoriesInBrowser = async (
  page: Page,
  request: APIRequestContext,
  content: Content,
  coverage: JourneyCoverage,
): Promise<Game> => {
  let game = await getGame(request);
  for (let step = 0; step < 12 && game.pending_scene_slug; step += 1) {
    const scene = content.scenes.find(
      (item) => item.slug === game.pending_scene_slug,
    );
    const option = scene?.options[0]?.slug;
    if (!scene || !option) {
      throw new Error(`Invalid pending scene ${game.pending_scene_slug}`);
    }
    const previousVersion = game.progress.version;
    await page.reload({ waitUntil: "domcontentloaded" });
    const surface = page.getByTestId("story-scene");
    await expect(surface).toHaveAttribute("data-scene-slug", scene.slug);
    await expect(page.getByTestId(`story-choice-${option}`)).toBeVisible();
    await page.getByTestId(`story-choice-${option}`).click();
    await expect
      .poll(async () => {
        const current = await getGame(request);
        return (
          current.progress.version > previousVersion &&
          current.pending_scene_slug !== scene.slug
        );
      })
      .toBe(true);
    coverage.storySlugs.add(scene.slug);
    game = await getGame(request);
  }
  return game;
};

const command = async (
  request: APIRequestContext,
  run: Run,
  body: Record<string, unknown>,
): Promise<Run> => {
  const response = await request.post(`${apiURL}/v2/runs/${run.id}/commands`, {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data: { ...body, expected_version: run.version },
  });
  if (!response.ok()) {
    throw new Error(
      `${String(body.type)} failed in ${run.state.phase} (${response.status()}): ${await response.text()}`,
    );
  }
  return ((await response.json()) as { run: Run }).run;
};

const startCampaignInBrowser = async (
  page: Page,
  request: APIRequestContext,
  chapterSlug: string,
  characterSlug: string | null,
  coverage: JourneyCoverage,
): Promise<Run> => {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId(`chapter-${chapterSlug}`).click();
  if (characterSlug) {
    const pilot = page.getByTestId(`pilot-${characterSlug}`);
    if ((await pilot.count()) > 0) await pilot.click();
  }
  await expect(page.getByTestId("start-campaign")).toBeEnabled();
  await page.getByTestId("start-campaign").click();
  await expect
    .poll(async () => (await getGame(request)).campaign_run?.state.chapter_slug)
    .toBe(chapterSlug);
  coverage.campaignStarts.add(chapterSlug);
  const run = (await getGame(request)).campaign_run;
  if (!run) throw new Error(`Browser did not start campaign ${chapterSlug}`);
  return run;
};

const startDailyInBrowser = async (
  page: Page,
  request: APIRequestContext,
  coverage: JourneyCoverage,
): Promise<Run> => {
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("start-daily")).toBeEnabled();
  await page.getByTestId("start-daily").click();
  await expect
    .poll(async () => (await getGame(request)).daily_run?.mode)
    .toBe("daily");
  coverage.dailyStart = true;
  const run = (await getGame(request)).daily_run;
  if (!run) throw new Error("Browser did not start the daily run");
  return run;
};

const clickRunCommandInBrowser = async (
  page: Page,
  request: APIRequestContext,
  run: Run,
  testID: string,
  coverage: JourneyCoverage,
): Promise<Run> => {
  await page.reload({ waitUntil: "domcontentloaded" });
  const control = page.getByTestId(testID);
  await expect(control).toBeVisible();

  if (run.state.phase === "map" && !coverage.safeMap) {
    await simulateTelegramHost(page);
    const headerContent = await page
      .locator('[data-testid="route-map-header"] > div')
      .first()
      .boundingBox();
    expect(headerContent?.y).toBeGreaterThanOrEqual(84);
    coverage.safeMap = true;
  } else if (
    ["reward", "event", "rest"].includes(run.state.phase) &&
    !coverage.safeInterstitial
  ) {
    await simulateTelegramHost(page);
    const header = await page
      .locator('[data-testid="interstitial-screen"] > header')
      .boundingBox();
    expect(header?.y).toBeGreaterThanOrEqual(84);
    coverage.safeInterstitial = true;
  }

  await control.click();
  await expect
    .poll(async () => activeRun(await getGame(request), run.mode)?.version ?? -1)
    .toBeGreaterThan(run.version);
  const updated = activeRun(await getGame(request), run.mode);
  if (!updated || updated.id !== run.id) {
    throw new Error(`${testID} did not update run ${run.id}`);
  }
  return updated;
};

const append = (
  controls: number[],
  direction: number,
  count: number,
  useWarp: boolean,
): void => {
  for (let index = 0; index < count; index += 1) {
    const skill = useWarp && controls.length % 121 === 0 ? 0x40 : 0;
    controls.push((direction & 0x0f) | 0x30 | skill);
  }
};

const objectiveControls = (encounter: Encounter): number[] => {
  const controls: number[] = [];
  if (encounter.kind === "tutorial" || encounter.objective.kind === "recover") {
    const sweep = [
      [12, 26],
      [8, 25],
      [4, 5],
      [0, 50],
      [8, 50],
      [12, 31],
      [0, 50],
      [8, 25],
      [12, 41],
      [0, 25],
      [4, 4],
      [8, 25],
      [12, 4],
      [0, 25],
      [4, 41],
      [8, 50],
      [0, 50],
      [4, 31],
      [8, 50],
      [0, 25],
      [12, 5],
      [4, 26],
    ] as const;
    while (controls.length < encounter.max_ticks) {
      for (const [direction, count] of sweep) {
        append(controls, direction, count, false);
      }
      if (encounter.kind === "tutorial") controls.push(0x44);
    }
  } else if (encounter.objective.kind === "stabilize") {
    append(controls, 12, 48, false);
    while (controls.length < encounter.max_ticks) {
      for (const direction of [0, 4, 8, 12]) {
        append(controls, direction, 4, false);
      }
    }
  } else {
    for (let tick = 0; tick < encounter.max_ticks; tick += 1) {
      const direction = Math.floor((tick + 4) / 21) % 16;
      const warp = (tick + 4) % 149 === 0 ? 0x40 : 0;
      controls.push(direction | 0x30 | warp);
    }
  }
  return controls.slice(0, encounter.max_ticks);
};

const actionTrace = (encounter: Encounter) => {
  const controls = objectiveControls(encounter);
  const bytes: number[] = [];
  for (let index = 0; index < controls.length; ) {
    let count = 1;
    while (
      index + count < controls.length &&
      controls[index + count] === controls[index] &&
      count < 255
    ) {
      count += 1;
    }
    bytes.push(controls[index]!, count);
    index += count;
  }
  return {
    encoding: "rle8-v1",
    ticks: controls.length,
    data: Buffer.from(bytes).toString("base64url"),
  };
};

const finishRun = async (
  page: Page,
  request: APIRequestContext,
  initial: Run,
  content: Content,
  coverage: JourneyCoverage,
): Promise<Run> => {
  let run = initial;
  let rerolled = false;
  let lastEncounterContext: Record<string, unknown> | null = null;
  const reportFailure = () => {
    if (run.outcome !== "failed") return;
    console.error(
      "FAILED_RUN_DIAGNOSTIC",
      JSON.stringify({
        chapter: run.state.chapter_slug,
        score: run.state.score,
        last_encounter: lastEncounterContext,
      }),
    );
  };
  for (let step = 0; step < 64 && run.status === "active"; step += 1) {
    switch (run.state.phase) {
      case "encounter": {
        const encounter = run.state.encounter;
        if (!encounter) throw new Error("Encounter state is missing");
        lastEncounterContext = {
          encounter,
          health: run.state.health,
          max_health: run.state.max_health,
          modules: run.state.modules,
          plugins: run.state.plugins,
          narrative_modifier: run.state.narrative_modifier,
          runtime_config: run.state.runtime_config,
        };
        run = await command(request, run, {
          type: "complete_encounter",
          trace: actionTrace(encounter),
        });
        break;
      }
      case "reward":
        if (!rerolled && run.state.rerolls_remaining > 0) {
          run = await clickRunCommandInBrowser(
            page,
            request,
            run,
            "reroll-module-reward",
            coverage,
          );
          rerolled = true;
          coverage.reroll = true;
        } else {
          const choice = run.state.reward?.module_choices[0];
          if (!choice) throw new Error("Reward has no module choice");
          run = await clickRunCommandInBrowser(
            page,
            request,
            run,
            `module-reward-${choice}`,
            coverage,
          );
          coverage.rewardChoice = true;
        }
        break;
      case "map": {
        const available = run.state.map.nodes.filter(
          (node) => node.status === "available",
        );
        const priority: Record<string, number> = {
          rest: 0,
          story: 1,
          event: 2,
          combat: 3,
          elite: 4,
          boss: 5,
        };
        const recovery =
          run.state.health * 100 <= run.state.max_health * 55
            ? available.find((node) => node.type === "rest")
            : undefined;
        const missingUIType = ["elite", "event", "rest"].find(
          (type) =>
            !coverage.routeTypes.has(type) &&
            available.some((node) => node.type === type),
        );
        const selected =
          recovery ??
          (missingUIType
            ? available.find((node) => node.type === missingUIType)
            : [...available].sort(
                (left, right) =>
                  (priority[left.type] ?? 8) - (priority[right.type] ?? 8),
              )[0]);
        if (!selected) throw new Error("Map has no available node");
        run = await clickRunCommandInBrowser(
          page,
          request,
          run,
          `route-node-${selected.id}`,
          coverage,
        );
        coverage.routeTypes.add(selected.type);
        break;
      }
      case "event": {
        const event = content.events.find(
          (item) => item.slug === run.state.current_event_slug,
        );
        const choice = event?.options[0]?.slug;
        if (!choice) {
          throw new Error(`Invalid event ${run.state.current_event_slug}`);
        }
        run = await clickRunCommandInBrowser(
          page,
          request,
          run,
          `event-choice-${choice}`,
          coverage,
        );
        coverage.event = true;
        break;
      }
      case "rest":
        run = await clickRunCommandInBrowser(
          page,
          request,
          run,
          "rest-repair",
          coverage,
        );
        coverage.rest = true;
        break;
      case "completed":
        reportFailure();
        return run;
    }

    const game = await choosePendingStoriesInBrowser(
      page,
      request,
      content,
      coverage,
    );
    const current = activeRun(game, run.mode);
    if (current?.id === run.id) run = current;
  }
  reportFailure();
  return run;
};

const clearCampaignChapterInBrowser = async (
  page: Page,
  request: APIRequestContext,
  content: Content,
  chapterSlug: string,
  characterSlug: string,
  coverage: JourneyCoverage,
): Promise<Run> => {
  let result: Run | null = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const run = await startCampaignInBrowser(
      page,
      request,
      chapterSlug,
      characterSlug,
      coverage,
    );
    result = await finishRun(page, request, run, content, coverage);
    if (result.outcome === "cleared") return result;
  }
  if (!result) throw new Error(`Campaign ${chapterSlug} did not start`);
  return result;
};

test("serves browser security headers", async ({ request }) => {
  const response = await request.get("/");
  expect(response.headers()["content-security-policy"]).toContain(
    "frame-ancestors",
  );
  expect(response.headers()["permissions-policy"]).toContain("camera=()");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-powered-by"]).toBeUndefined();
});

test("one tap starts Action V3, direct drag stops cleanly, and the run resumes safely", async ({
  page,
  request,
}) => {
  test.setTimeout(900_000);

  const englishResponse = await request.get(
    `${apiURL}/v2/content/v3?locale=en`,
  );
  const chineseResponse = await request.get(
    `${apiURL}/v2/content/v3?locale=zh-CN`,
  );
  expect(englishResponse.ok()).toBe(true);
  expect(chineseResponse.ok()).toBe(true);
  const content = (await englishResponse.json()) as Content;
  const chineseContent = (await chineseResponse.json()) as Content;
  expect(content).toMatchObject({ version: "v3", protocol: "action-v2", locale: "en" });
  expect(chineseContent).toMatchObject({
    version: "v3",
    protocol: "action-v2",
    locale: "zh-CN",
  });
  expect(content.characters).toHaveLength(7);
  expect(content.chapters).toHaveLength(8);
  expect(content.chapters.filter((chapter) => !chapter.finale)).toHaveLength(7);
  expect(content.chapters.some((chapter) => chapter.slug === "zero-channel")).toBe(true);

  const coverage: JourneyCoverage = {
    routeTypes: new Set(),
    storySlugs: new Set(),
    campaignStarts: new Set(),
    rewardChoice: false,
    reroll: false,
    event: false,
    rest: false,
    safeMap: false,
    safeInterstitial: false,
    dailyStart: false,
  };

  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  await expect(
    page.getByText("The stream has ended. Current viewers: 1."),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");

  await page
    .getByRole("button", { name: "Switch language to Chinese" })
    .dispatchEvent("click");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("xuhuan.locale.v1")))
    .toBe("zh-CN");
  await page
    .getByRole("button", { name: "切换为英文" })
    .dispatchEvent("click");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("xuhuan.locale.v1")))
    .toBe("en");

  await choosePendingStoriesInBrowser(page, request, content, coverage);
  const canvas = page.getByRole("img", { name: "Action encounter arena" });
  await expect(canvas).toBeVisible();

  await simulateTelegramHost(page);
  const hud = await page.getByTestId("combat-hud").boundingBox();
  const playfield = await page.getByTestId("action-playfield").boundingBox();
  const canvasBox = await canvas.boundingBox();
  expect(hud?.y).toBeGreaterThanOrEqual(84);
  expect(hud?.height).toBeLessThanOrEqual(70);
  expect(playfield?.y).toBeGreaterThanOrEqual(
    (hud?.y ?? 0) + (hud?.height ?? 0),
  );
  expect(playfield?.width).toBe(320);
  expect(playfield?.height).toBeGreaterThanOrEqual(390);
  expect(canvasBox).toEqual(playfield);
  await expect(page.getByText(/TRAINING 1\/3|TRAINING 2\/3/)).toBeVisible();
  const encounterViewport = await page.evaluate(() => ({
    clientHeight: document.documentElement.clientHeight,
    scrollHeight: document.documentElement.scrollHeight,
    bodyPosition: getComputedStyle(document.body).position,
    touchAction: getComputedStyle(document.documentElement).touchAction,
    overscroll: getComputedStyle(document.documentElement).overscrollBehavior,
  }));
  expect(encounterViewport.scrollHeight).toBeLessThanOrEqual(
    encounterViewport.clientHeight,
  );
  expect(encounterViewport.bodyPosition).toBe("fixed");
  expect(encounterViewport.touchAction).toBe("none");
  expect(encounterViewport.overscroll).toBe("none");

  const movement = page.getByRole("group", {
    name: "Drag movement and tap Warp control",
  });
  const box = await movement.boundingBox();
  if (!box) throw new Error("Movement control has no bounds");
  await page.mouse.move(box.x + 88, box.y + 104);
  await page.mouse.down();
  const reticle = movement.locator("[data-active]");
  await expect(reticle).toHaveAttribute("data-active", "false");
  await page.mouse.move(box.x + 178, box.y + 104, { steps: 6 });
  await expect(reticle).toHaveAttribute("data-active", "true");
  await page.mouse.up();
  await expect(reticle).toHaveAttribute("data-active", "false");

  const first = await getGame(request);
  expect(first.protocol).toBe("action-v2");
  expect(first.content_version).toBe("v3");
  expect(first.campaign_run?.state.phase).toBe("encounter");
  const runID = first.campaign_run!.id;

  await page.reload();
  await expect(page.getByRole("img", { name: "Action encounter arena" })).toBeVisible();
  const recovered = await getGame(request);
  expect(recovered.campaign_run?.id).toBe(runID);

  const result = await finishRun(
    page,
    request,
    recovered.campaign_run!,
    content,
    coverage,
  );
  expect(result.outcome).toBe("cleared");
  const finalGame = await getGame(request);
  expect(finalGame.progress.current_chapter_slug).toBe("always-cheerful");
  expect(finalGame.campaign_run).toBeNull();

  await page.setViewportSize({ width: 412, height: 839 });
  await page.reload();
  await expect(
    page.getByText("Always Cheerful", { exact: true }).first(),
  ).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

  const orderedChapters = [...content.chapters].sort(
    (left, right) => left.order - right.order,
  );
  const campaignChapters = orderedChapters.filter(
    (chapter) => !chapter.finale,
  );
  expect(campaignChapters).toHaveLength(7);
  const endingScenes = content.scenes.filter((scene) =>
    [
      "zero-authentic-ending",
      "zero-balanced-ending",
      "zero-retained-ending",
    ].includes(scene.slug),
  );
  // One campaign identity can project one ending at a time. Go tests cover all
  // metric projections; story-chat.test.tsx renders and submits all three
  // terminal scenes through the same browser-visible component.
  expect(endingScenes).toHaveLength(3);
  for (const scene of endingScenes) {
    expect(scene.title).not.toBe("");
    expect(scene.messages.length).toBeGreaterThanOrEqual(3);
    expect(scene.options[0]?.label).not.toBe("");
  }

  let campaignGame = finalGame;
  for (const chapter of campaignChapters.slice(1)) {
    expect(campaignGame.progress.current_chapter_slug).toBe(chapter.slug);
    if (!chapter.character_slug) {
      throw new Error(`Campaign chapter ${chapter.slug} has no pilot`);
    }
    const chapterResult = await clearCampaignChapterInBrowser(
      page,
      request,
      content,
      chapter.slug,
      chapter.character_slug,
      coverage,
    );
    expect(chapterResult.outcome, chapter.slug).toBe("cleared");
    campaignGame = await getGame(request);
  }

  const finale = orderedChapters.find((chapter) => chapter.finale);
  expect(finale?.slug).toBe("zero-channel");
  expect(campaignGame.progress.current_chapter_slug).toBe("zero-channel");
  const finaleResult = await clearCampaignChapterInBrowser(
    page,
    request,
    content,
    "zero-channel",
    "nana7mi",
    coverage,
  );
  expect(finaleResult.outcome).toBe("cleared");
  campaignGame = await getGame(request);
  expect(campaignGame.progress.daily_unlocked).toBe(true);

  const dailyResult = await finishRun(
    page,
    request,
    await startDailyInBrowser(page, request, coverage),
    content,
    coverage,
  );
  expect(dailyResult.outcome).toBe("cleared");
  const settled = await getGame(request);
  expect(settled.daily_run).toBeNull();
  expect(settled.daily_result?.score).toBe(dailyResult.state.score);

  const shareID = dailyResult.id;
  expect(shareID).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  const publicShareResponse = await request.get(
    `${apiURL}/v2/daily/results/${encodeURIComponent(shareID)}`,
  );
  expect(publicShareResponse.ok()).toBe(true);
  const publicShare = (await publicShareResponse.json()) as {
    score: number;
  };
  expect(publicShare.score).toBe(dailyResult.state.score);
  expect(publicShare).not.toHaveProperty("token");
  expect(JSON.stringify(publicShare).toLowerCase()).not.toContain("telegram");

  await page.goto(`/daily/${shareID}`);
  await expect(page.getByTestId("daily-share-result")).toBeVisible();
  await expect(page.getByText("Signal recovered")).toBeVisible();
  await expect(
    page.getByText(dailyResult.state.score.toLocaleString("en-CA"), {
      exact: true,
    }),
  ).toBeVisible();
  const dailyCharacter = content.characters.find(
    (character) => character.slug === settled.daily_result?.character_slug,
  );
  if (!dailyCharacter) throw new Error("Daily character is missing from content");
  await expect(page.getByText(dailyCharacter.name, { exact: true })).toBeVisible();
  await expect(page.getByText(dailyCharacter.slug, { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Switch language to Chinese" })
    .click();
  await expect(page.getByText("信号已回收")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("xuhuan.locale.v1")))
    .toBe("zh-CN");

  expect(coverage.rewardChoice).toBe(true);
  expect(coverage.reroll).toBe(true);
  expect(coverage.event).toBe(true);
  expect(coverage.rest).toBe(true);
  expect(coverage.safeMap).toBe(true);
  expect(coverage.safeInterstitial).toBe(true);
  expect(coverage.dailyStart).toBe(true);
  expect(coverage.campaignStarts.size).toBe(7);
  expect(coverage.routeTypes.has("event")).toBe(true);
  expect(coverage.routeTypes.has("rest")).toBe(true);
  expect(coverage.routeTypes.has("elite")).toBe(true);
  expect(coverage.routeTypes.has("boss")).toBe(true);
  expect(
    Array.from(coverage.storySlugs).some((slug) =>
      [
        "zero-authentic-ending",
        "zero-balanced-ending",
        "zero-retained-ending",
      ].includes(slug),
    ),
  ).toBe(true);
});
