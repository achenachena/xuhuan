import { createHmac, randomUUID } from "node:crypto";
import { appendFileSync, writeFileSync } from "node:fs";

const apiBaseURL = (process.env.API_BASE_URL ?? "").replace(/\/+$/, "");
const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
const smokeRunID = process.env.SMOKE_RUN_ID ?? "";
const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
const expectedTelegramUserID =
  process.env.EXPECTED_SMOKE_TELEGRAM_USER_ID ?? "";
const telegramInitDataFile = process.env.TELEGRAM_INIT_DATA_FILE ?? "";
if (!/^\d+$/.test(smokeRunID)) {
  throw new Error("SMOKE_RUN_ID must be the numeric GitHub run ID");
}
if (!/^8\d{15}$/.test(expectedTelegramUserID)) {
  throw new Error("EXPECTED_SMOKE_TELEGRAM_USER_ID is invalid");
}
if (!telegramInitDataFile) {
  throw new Error("TELEGRAM_INIT_DATA_FILE is required");
}
const telegramUserID = Number(expectedTelegramUserID);
if (!Number.isSafeInteger(telegramUserID)) {
  throw new Error("Synthetic Telegram user ID is outside JavaScript's safe range");
}
const telegramUser = {
  id: telegramUserID,
  first_name: "Production",
  language_code: "en",
};

const cleanupIdentity = {
  synthetic_telegram_user_id: telegramUser.id,
};
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `synthetic_telegram_user_id=${cleanupIdentity.synthetic_telegram_user_id}\n`,
    "utf8",
  );
}
console.log(JSON.stringify({ status: "prepared", ...cleanupIdentity }));

if (!apiBaseURL.startsWith("https://")) {
  throw new Error("API_BASE_URL must be a production HTTPS URL");
}
if (!botToken || botToken === "replace-out-of-band") {
  throw new Error("TELEGRAM_BOT_TOKEN is required");
}

const createInitData = () => {
  const values = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `production-smoke-${smokeRunID}`,
    user: JSON.stringify(telegramUser),
  });
  const check = [...values.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  values.set("hash", createHmac("sha256", secret).update(check).digest("hex"));
  return values.toString();
};

const initData = createInitData();
writeFileSync(telegramInitDataFile, initData, {
  encoding: "utf8",
  flag: "wx",
  mode: 0o600,
});
let requestCount = 0;
let rateLimitWaits = 0;

const requestJSON = async (
  path,
  { method = "GET", body, idempotencyKey, authenticate = true, locale = "en" } = {},
) => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    requestCount += 1;
    let response;
    try {
      response = await fetch(`${apiBaseURL}${path}`, {
        method,
        signal: AbortSignal.timeout(20_000),
        headers: {
          Accept: "application/json",
          "Accept-Language": locale,
          ...(authenticate ? { "X-Telegram-Init-Data": initData } : {}),
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      if (attempt === 7) throw error;
      await sleep(Math.min(2 ** attempt * 500, 8_000));
      continue;
    }

    if (response.ok) {
      return {
        body: await response.json(),
        replayed: response.headers.get("idempotency-replayed") === "true",
      };
    }
    const responseBody = await response.text();
    if (response.status === 429) {
      rateLimitWaits += 1;
      const retryAfter = Number.parseInt(
        response.headers.get("retry-after") ?? "1",
        10,
      );
      await sleep(Math.min(Math.max(retryAfter, 1), 65) * 1000 + 250);
      continue;
    }
    if (response.status >= 500 && attempt < 7) {
      await sleep(Math.min(2 ** attempt * 500, 8_000));
      continue;
    }
    throw new Error(
      `${method} ${path} failed (${response.status}): ${responseBody.slice(0, 500)}`,
    );
  }
  throw new Error(`${method} ${path} exhausted retries`);
};

const post = (path, body, key = randomUUID()) =>
  requestJSON(path, { method: "POST", body, idempotencyKey: key });

const getGame = async () => (await requestJSON("/v2/game")).body;

const command = async (run, body) =>
  (
    await post(`/v2/runs/${encodeURIComponent(run.id)}/commands`, {
      ...body,
      expected_version: run.version,
    })
  ).body;

const appendControls = (controls, direction, count, useWarp) => {
  for (let index = 0; index < count; index += 1) {
    const warp = useWarp && controls.length % 121 === 0 ? 0x40 : 0;
    controls.push((direction & 0x0f) | 0x30 | warp);
  }
};

const objectiveControls = (encounter) => {
  const controls = [];
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
    ];
    while (controls.length < encounter.max_ticks) {
      for (const [direction, count] of sweep) {
        appendControls(controls, direction, count, false);
      }
      if (encounter.kind === "tutorial") {
        controls.push(0x44);
      }
    }
  } else if (encounter.objective.kind === "stabilize") {
    appendControls(controls, 12, 48, false);
    while (controls.length < encounter.max_ticks) {
      for (const direction of [0, 4, 8, 12]) {
        appendControls(controls, direction, 4, false);
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

const actionTrace = (encounter) => {
  const controls = objectiveControls(encounter);
  const bytes = [];
  for (let index = 0; index < controls.length; ) {
    let count = 1;
    while (
      index + count < controls.length &&
      controls[index + count] === controls[index] &&
      count < 255
    ) {
      count += 1;
    }
    bytes.push(controls[index], count);
    index += count;
  }
  return {
    encoding: "rle8-v1",
    ticks: controls.length,
    data: Buffer.from(bytes).toString("base64url"),
  };
};

const routeCoverage = new Set();

const choosePendingStory = async (game, content, verifyReplay = false) => {
  if (!game.pending_scene_slug) return game;
  const scene = content.scenes.find(
    (item) => item.slug === game.pending_scene_slug,
  );
  const option = scene?.options?.[0]?.slug;
  if (!scene || !option) {
    throw new Error(`Invalid pending scene ${game.pending_scene_slug}`);
  }
  const payload = {
    scene_slug: scene.slug,
    option_slug: option,
    expected_version: game.progress.version,
  };
  const key = randomUUID();
  const first = await post("/v2/story/choices", payload, key);
  if (verifyReplay) {
    const replay = await post("/v2/story/choices", payload, key);
    if (
      !replay.replayed ||
      replay.body.progress.version !== first.body.progress.version
    ) {
      throw new Error("Story idempotency replay failed");
    }
  }
  return {
    ...game,
    progress: first.body.progress,
    pending_scene_slug: first.body.pending_scene_slug,
  };
};

const drainPendingStories = async (game, content, verifyFirst = false) => {
  let current = game;
  for (let step = 0; step < 16 && current.pending_scene_slug; step += 1) {
    current = await choosePendingStory(
      current,
      content,
      verifyFirst && step === 0,
    );
  }
  if (current.pending_scene_slug) {
    throw new Error("Pending story chain exceeded its safety bound");
  }
  return current;
};

const finishRun = async (initial, content) => {
  let run = initial;
  let rerolled = false;
  for (let step = 0; step < 72 && run.status === "active"; step += 1) {
    let response;
    switch (run.state.phase) {
      case "encounter":
        response = await command(run, {
          type: "complete_encounter",
          trace: actionTrace(run.state.encounter),
        });
        break;
      case "reward":
        if (!rerolled && run.state.rerolls_remaining > 0) {
          response = await command(run, { type: "reroll_module_reward" });
          rerolled = true;
        } else {
          response = await command(run, {
            type: "choose_module_reward",
            choice_slug: run.state.reward?.module_choices?.[0] ?? "",
          });
        }
        break;
      case "map": {
        const priority = {
          rest: 0,
          story: 1,
          event: 2,
          combat: 3,
          elite: 4,
          boss: 5,
        };
        const available = run.state.map.nodes.filter(
          (item) => item.status === "available",
        );
        const recovery =
          run.state.health * 100 <= run.state.max_health * 55
            ? available.find((item) => item.type === "rest")
            : undefined;
        const missingType = ["elite", "event", "rest"].find(
          (type) =>
            !routeCoverage.has(type) &&
            available.some((item) => item.type === type),
        );
        const node =
          recovery ??
          (missingType
            ? available.find((item) => item.type === missingType)
            : [...available].sort(
                (left, right) =>
                  (priority[left.type] ?? 8) - (priority[right.type] ?? 8),
              )[0]);
        if (!node) throw new Error("Active map has no available node");
        routeCoverage.add(node.type);
        response = await command(run, { type: "choose_node", node_id: node.id });
        break;
      }
      case "event": {
        const event = content.events.find(
          (item) => item.slug === run.state.current_event_slug,
        );
        if (!event?.options?.[0]) {
          throw new Error(`Invalid event ${run.state.current_event_slug}`);
        }
        response = await command(run, {
          type: "resolve_event",
          choice_slug: event.options[0].slug,
        });
        break;
      }
      case "rest":
        response = await command(run, { type: "rest", operation: "repair" });
        break;
      case "completed":
        return run;
      default:
        throw new Error(`Unsupported phase ${run.state.phase}`);
    }

    run = response.run;
    if (
      response.events.some((event) =>
        [
          "story_scene_ready",
          "tutorial_completed",
          "chapter_cleared",
        ].includes(event.kind),
      )
    ) {
      await drainPendingStories(await getGame(), content);
    }
  }
  if (run.status === "active") {
    throw new Error(`Run ${run.id} exceeded its command safety bound`);
  }
  return run;
};

const assertAnonymous = (value) => {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const forbidden of [
    "telegram",
    "player_id",
    "display_name",
    "username",
    "first_name",
    "last_name",
    "completed_at",
  ]) {
    if (serialized.includes(forbidden)) {
      throw new Error(`Public daily result exposed forbidden field ${forbidden}`);
    }
  }
};

const validateContent = (content, locale) => {
  const expected = {
    characters: 7,
    kits: 7,
    modules: 68,
    plugins: 20,
    enemies: 36,
    encounters: 47,
    events: 28,
    scenes: 34,
    chapters: 8,
  };
  if (
    content.version !== "v3" ||
    content.protocol !== "action-v2" ||
    content.locale !== locale
  ) {
    throw new Error(`Invalid ${locale} Action V3 content handshake`);
  }
  for (const [key, count] of Object.entries(expected)) {
    if (content[key]?.length !== count) {
      throw new Error(`${locale} content ${key} expected ${count}`);
    }
  }
  const campaign = content.chapters.filter((chapter) => !chapter.finale);
  const finale = content.chapters.filter((chapter) => chapter.finale);
  if (campaign.length !== 7 || finale.length !== 1 || finale[0].slug !== "zero-channel") {
    throw new Error("The complete seven-chapter campaign and finale are missing");
  }
};

const startCampaign = async (chapter, characterSlug) =>
  (
    await post("/v2/runs", {
      mode: "campaign",
      chapter_slug: chapter.slug,
      character_slug: characterSlug,
      noise_level: 0,
    })
  ).body;

const clearWithRetries = async (start, content, label, verifyRecovery = false) => {
  let result;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const run = await start();
    if (attempt === 1 && verifyRecovery) {
      const recovered = (
        await requestJSON(`/v2/runs/${encodeURIComponent(run.id)}`)
      ).body;
      if (recovered.id !== run.id || recovered.version !== run.version) {
        throw new Error(`${label} recovery failed`);
      }
      result = await finishRun(recovered, content);
    } else {
      result = await finishRun(run, content);
    }
    if (result.outcome === "cleared") return result;
  }
  throw new Error(`${label} did not clear within three attempts`);
};

const runSmoke = async () => {
  console.log("Starting authenticated production Action V3 smoke test.");
  const { body: content } = await requestJSON("/v2/content/v3?locale=en", {
    authenticate: false,
    locale: "en",
  });
  const { body: chineseContent } = await requestJSON(
    "/v2/content/v3?locale=zh-CN",
    { authenticate: false, locale: "zh-CN" },
  );
  validateContent(content, "en");
  validateContent(chineseContent, "zh-CN");

  let game = await drainPendingStories(await getGame(), content, true);
  const orderedChapters = [...content.chapters].sort(
    (left, right) => left.order - right.order,
  );
  const campaignChapters = orderedChapters.filter((chapter) => !chapter.finale);

  for (const chapter of campaignChapters) {
    game = await drainPendingStories(await getGame(), content);
    if (game.progress.current_chapter_slug !== chapter.slug) {
      throw new Error(
        `Expected campaign chapter ${chapter.slug}, got ${game.progress.current_chapter_slug}`,
      );
    }
    await clearWithRetries(
      () => startCampaign(chapter, chapter.character_slug),
      content,
      `Campaign chapter ${chapter.slug}`,
      true,
    );
    game = await drainPendingStories(await getGame(), content);
  }

  const finale = orderedChapters.find((chapter) => chapter.finale);
  if (!finale || game.progress.current_chapter_slug !== finale.slug) {
    throw new Error("Zero Channel did not unlock after seven memories");
  }
  const finalePilot = campaignChapters[0].character_slug;
  await clearWithRetries(
    () => startCampaign(finale, finalePilot),
    content,
    "Zero Channel",
  );
  game = await drainPendingStories(await getGame(), content);
  if (!game.progress.ending || !game.progress.daily_unlocked) {
    throw new Error("Finale did not project an ending and unlock Daily Anomaly");
  }

  const dailyResult = await clearWithRetries(
    async () => {
      const daily = (await post("/v2/runs", { mode: "daily" })).body;
      if (daily.mode !== "daily" || !daily.daily_date) {
        throw new Error("Server did not select a dated daily route");
      }
      return daily;
    },
    content,
    "Daily Anomaly",
  );
  const settled = await getGame();
  if (
    settled.daily_run !== null ||
    !settled.daily_result ||
    settled.daily_result.score !== dailyResult.state.score
  ) {
    throw new Error("Daily result did not persist cleanly");
  }

  const publicResult = (
    await requestJSON(`/v2/daily/results/${encodeURIComponent(dailyResult.id)}`, {
      authenticate: false,
    })
  ).body;
  assertAnonymous(publicResult);
  if (
    publicResult.date !== settled.daily_result.date ||
    publicResult.score !== settled.daily_result.score ||
    publicResult.character_slug !== settled.daily_result.character_slug
  ) {
    throw new Error("Public daily result does not match the persisted result");
  }

  return {
    ending: game.progress.ending,
    highestNoise: game.progress.highest_noise_level,
    dailyScore: publicResult.score,
    dailyStreak: publicResult.streak,
  };
};

const result = await runSmoke();
console.log(
  JSON.stringify({
    status: "ok",
    protocol: "action-v2",
    content_version: "v3",
    authenticated_as: "synthetic-production-smoke-user",
    ...cleanupIdentity,
    ending: result.ending,
    highest_noise_level: result.highestNoise,
    daily_score: result.dailyScore,
    daily_streak: result.dailyStreak,
    requests: requestCount,
    rate_limit_waits: rateLimitWaits,
  }),
);
