import { createHmac, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

import {
  chooseSmokeShowOption,
  chooseSmokeStoryOption,
  createAuthoritySmokeTrace,
} from "./smoke-trace-helper.mjs";

const apiBaseURL = (process.env.API_BASE_URL ?? "").replace(/\/+$/, "");
const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
const smokeRunID = process.env.SMOKE_RUN_ID ?? "";
const expectedTelegramUserID = process.env.EXPECTED_SMOKE_TELEGRAM_USER_ID ?? "";
const telegramInitDataFile = process.env.TELEGRAM_INIT_DATA_FILE ?? "";
if (!apiBaseURL.startsWith("https://")) throw new Error("API_BASE_URL must be HTTPS");
if (!botToken || !/^\d+$/.test(smokeRunID) || !/^8\d{15}$/.test(expectedTelegramUserID) || !telegramInitDataFile) {
  throw new Error("Production smoke identity inputs are invalid");
}
const telegramUserID = Number(expectedTelegramUserID);
if (!Number.isSafeInteger(telegramUserID)) throw new Error("Synthetic Telegram user ID is unsafe");
const telegramUser = { id: telegramUserID, first_name: "Production", language_code: "en" };

console.log(JSON.stringify({ status: "prepared", synthetic_telegram_user_id: telegramUser.id }));

const values = new URLSearchParams({
  auth_date: String(Math.floor(Date.now() / 1_000)),
  query_id: `production-smoke-${smokeRunID}`,
  user: JSON.stringify(telegramUser),
});
const dataCheck = [...values.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("\n");
const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
values.set("hash", createHmac("sha256", secret).update(dataCheck).digest("hex"));
const initData = values.toString();
writeFileSync(telegramInitDataFile, initData, { encoding: "utf8", flag: "wx", mode: 0o600 });

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
let requestCount = 0;
let rateLimitWaits = 0;
const requestJSON = async (path, { method = "GET", body, key, authenticate = true, locale = "en" } = {}) => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    requestCount += 1;
    let response;
    try {
      response = await fetch(`${apiBaseURL}${path}`, {
        method,
        signal: AbortSignal.timeout(25_000),
        headers: {
          Accept: "application/json",
          "Accept-Language": locale,
          ...(authenticate ? { "X-Telegram-Init-Data": initData } : {}),
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(key ? { "Idempotency-Key": key } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      if (attempt === 7) throw error;
      await sleep(Math.min(500 * 2 ** attempt, 8_000));
      continue;
    }
    const text = await response.text();
    if (response.ok) return { body: text ? JSON.parse(text) : null, replayed: response.headers.get("idempotency-replayed") === "true" };
    if (response.status === 429) {
      rateLimitWaits += 1;
      await sleep(Math.min(65, Math.max(1, Number(response.headers.get("retry-after") ?? 1))) * 1_000 + 250);
      continue;
    }
    if (response.status >= 500 && attempt < 7) {
      await sleep(Math.min(500 * 2 ** attempt, 8_000));
      continue;
    }
    throw new Error(`${method} ${path} failed (${response.status}): ${text.slice(0, 500)}`);
  }
  throw new Error(`${method} ${path} exhausted retries`);
};

const post = (path, body, key = randomUUID()) => requestJSON(path, { method: "POST", body, key });
const command = async (run, body, key = randomUUID()) => post(`/v2/runs/${encodeURIComponent(run.id)}/commands`, { ...body, expected_version: run.version }, key);

const finishRun = async (initialRun, endingID, verifyReplay = false) => {
  let run = initialRun;
  let replayChecked = false;
  for (let step = 0; step < 24 && run.status === "active"; step += 1) {
    let response;
    if (run.state.phase === "segment") {
      const runtimeConfig = run.state.segment?.runtime_config;
      if (!runtimeConfig) throw new Error("Active segment has no runtime configuration");
      response = await command(run, { type: "complete_segment", trace: createAuthoritySmokeTrace(runtimeConfig) });
    } else if (run.state.phase === "show_choice") {
      const optionID = chooseSmokeShowOption(run.state.pending_show_options);
      const body = { type: "choose_show_option", option_id: optionID };
      if (verifyReplay && !replayChecked) {
        const key = randomUUID();
        const first = await command(run, body, key);
        const replay = await command(run, body, key);
        if (!replay.replayed || replay.body.run.version !== first.body.run.version) throw new Error("Command idempotency replay failed");
        response = first;
        replayChecked = true;
      } else response = await command(run, body);
    } else if (run.state.phase === "story") {
      const sceneID = run.state.story?.scene_id;
      const choices = run.state.story?.choice_ids ?? [];
      const optionID = chooseSmokeStoryOption(
        choices,
        sceneID === "zero-channel-ending" ? endingID : null,
      );
      if (!sceneID || !optionID || !choices.includes(optionID)) throw new Error("Story scene has no valid option");
      response = await command(run, { type: "choose_intermission_reply", scene_id: sceneID, option_id: optionID });
    } else throw new Error(`Unexpected run phase ${run.state.phase}`);
    run = response.body.run;
  }
  if (run.status !== "completed" || run.outcome !== "cleared") throw new Error(`Run ${run.id} did not clear`);
  if (endingID && run.state.ending_id !== endingID) throw new Error(`Finale did not persist ${endingID}`);
  return run;
};

const health = await requestJSON("/healthz", { authenticate: false });
const ready = await requestJSON("/readyz", { authenticate: false });
if (!health.body || !ready.body) throw new Error("Health endpoints returned empty bodies");
const [english, chinese] = await Promise.all([
  requestJSON("/v2/content/v4?locale=en", { authenticate: false }),
  requestJSON("/v2/content/v4?locale=zh-CN", { authenticate: false, locale: "zh-CN" }),
]);
if (english.body.version !== "v4" || english.body.protocol !== "shooter-v1" || chinese.body.locale !== "zh-CN") throw new Error("V4 content handshake failed");

const campaignChapters = ["seventh-dock", "always-cheerful", "loss-hidden", "captains-do-not-rest", "localization-failed", "which-is-original", "laplace-florist"];
const chapterByID = new Map(english.body.chapters.map((chapter) => [chapter.id, chapter]));
const clearedChapters = [];
for (const chapterSlug of campaignChapters) {
  const characterSlug = chapterByID.get(chapterSlug)?.featured_character;
  if (!characterSlug) throw new Error(`Content has no featured character for ${chapterSlug}`);
  const run = (await post("/v2/runs", { mode: "campaign", chapter_slug: chapterSlug, character_slug: characterSlug })).body;
  await finishRun(run, null, clearedChapters.length === 0);
  clearedChapters.push(chapterSlug);

  if (clearedChapters.length === 1) {
    const chapter = chapterByID.get(chapterSlug);
    const revisionOption = chapter?.story?.intermission?.choices?.[1]?.id;
    const snapshotBeforeRevision = (await requestJSON("/v2/game")).body;
    if (!revisionOption || !Number.isInteger(snapshotBeforeRevision?.progress?.version)) throw new Error("Story revision fixture is unavailable");
    const key = randomUUID();
    const revisionBody = {
      scene_slug: `${chapterSlug}-intermission`,
      option_slug: revisionOption,
      expected_version: snapshotBeforeRevision.progress.version,
    };
    const firstRevision = await post("/v2/story/choices", revisionBody, key);
    const replayedRevision = await post("/v2/story/choices", revisionBody, key);
    const latestRevision = firstRevision.body.progress.choices.filter((choice) => choice.scene_slug === revisionBody.scene_slug).at(-1);
    if (!replayedRevision.replayed || replayedRevision.body.progress.version !== firstRevision.body.progress.version || latestRevision?.revision !== 2) {
      throw new Error("Append-only story choice revision or its idempotent replay failed");
    }
  }
}

const endings = ["open-archive", "shared-cut", "quiet-signoff"];
for (const endingID of endings) {
  const run = (await post("/v2/runs", {
    mode: "campaign",
    chapter_slug: "zero-channel",
    character_slug: "nana7mi",
    companion_slug: "xingtong-assist",
  })).body;
  await finishRun(run, endingID);
}

const dailyRun = (await post("/v2/runs", { mode: "daily" })).body;
const dailyResultRun = await finishRun(dailyRun, null);
const snapshot = (await requestJSON("/v2/game")).body;
const publicDaily = (await requestJSON(`/v2/daily/results/${encodeURIComponent(dailyResultRun.id)}`, { authenticate: false })).body;
if (
  !snapshot.daily_result ||
  publicDaily.score !== snapshot.daily_result.score ||
  publicDaily.character_slug !== snapshot.daily_result.character_slug ||
  JSON.stringify(publicDaily.show_effects) !== JSON.stringify(snapshot.daily_result.show_effects) ||
  JSON.stringify(publicDaily.companion_slugs) !== JSON.stringify(snapshot.daily_result.companion_slugs)
) {
  throw new Error("Daily result persistence or anonymous projection failed");
}

console.log(JSON.stringify({
  status: "ok",
  protocol: "shooter-v1",
  content_version: "v4",
  chapters: [...clearedChapters, "zero-channel"],
  endings,
  daily_persisted: true,
  idempotent_replay: true,
  story_revision: true,
  requests: requestCount,
  rate_limit_waits: rateLimitWaits,
  synthetic_telegram_user_id: telegramUser.id,
}));
