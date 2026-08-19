import { createHash, createHmac, randomUUID } from "node:crypto";

const apiBaseURL = (process.env.API_BASE_URL ?? "").replace(/\/+$/, "");
const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
const smokeRunID = process.env.SMOKE_RUN_ID ?? randomUUID();
if (!apiBaseURL.startsWith("https://"))
  throw new Error("API_BASE_URL must be a production https URL");
if (!botToken || botToken === "replace-out-of-band")
  throw new Error("TELEGRAM_BOT_TOKEN is required");
const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
const suffix = Number.parseInt(
  createHash("sha256").update(smokeRunID).digest("hex").slice(0, 10),
  16,
);
const telegramUser = {
  id: 8_000_000_000_000_000 + (suffix % 10_000_000_000),
  username: `xuhuan_smoke_${String(suffix).slice(0, 12)}`,
  first_name: "Production",
  last_name: "Smoke",
  language_code: "zh-CN",
};
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
let requestCount = 0;
let rateLimitWaits = 0;
const requestJSON = async (
  path,
  { method = "GET", body, idempotencyKey, authenticate = true } = {},
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
          "Accept-Language": "zh-CN",
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
    if (response.ok)
      return {
        body: await response.json(),
        replayed: response.headers.get("idempotency-replayed") === "true",
      };
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
const command = async (run, body) =>
  (
    await post(`/v2/runs/${encodeURIComponent(run.id)}/commands`, {
      ...body,
      expected_version: run.version,
    })
  ).body.run;
const actionTrace = (ticks) => {
  const controls = [];
  const route = [0, 4, 8, 12];
  for (let tick = 0; tick < ticks; tick += 1) {
    let control = route[Math.floor(tick / 45) % route.length] | 0x30;
    if (tick % 210 === 1) control |= 0x40;
    controls.push(control);
  }
  const bytes = [];
  for (let index = 0; index < controls.length; ) {
    let count = 1;
    while (
      index + count < controls.length &&
      controls[index + count] === controls[index] &&
      count < 255
    )
      count += 1;
    bytes.push(controls[index], count);
    index += count;
  }
  return {
    encoding: "rle8-v1",
    ticks,
    data: Buffer.from(bytes).toString("base64").replace(/=+$/, ""),
  };
};
const finishRun = async (initial, content) => {
  let run = initial;
  for (let step = 0; step < 50 && run.status === "active"; step += 1) {
    switch (run.state.phase) {
      case "encounter": {
        const encounter = run.state.encounter;
        run = await command(run, {
          type: "complete_encounter",
          trace: actionTrace(
            encounter.kind === "boss"
              ? encounter.max_ticks
              : encounter.duration_ticks,
          ),
        });
        break;
      }
      case "reward":
        run = await command(run, {
          type: "choose_module_reward",
          choice_slug: run.state.reward?.module_choices?.[0] ?? "",
        });
        break;
      case "map": {
        const priority = {
          elite: 0,
          story: 1,
          event: 2,
          combat: 3,
          boss: 4,
          rest: 9,
        };
        const node = run.state.map.nodes
          .filter((item) => item.status === "available")
          .sort(
            (left, right) =>
              (priority[left.type] ?? 8) - (priority[right.type] ?? 8),
          )[0];
        if (!node) throw new Error("Active map has no available node");
        run = await command(run, { type: "choose_node", node_id: node.id });
        break;
      }
      case "event": {
        const event = content.events.find(
          (item) => item.slug === run.state.current_event_slug,
        );
        if (!event?.options?.[0])
          throw new Error(`Invalid event ${run.state.current_event_slug}`);
        run = await command(run, {
          type: "resolve_event",
          choice_slug: event.options[0].slug,
        });
        break;
      }
      case "rest":
        run = await command(run, { type: "rest", operation: "repair" });
        break;
      case "completed":
        return run;
      default:
        throw new Error(`Unsupported phase ${run.state.phase}`);
    }
  }
  return run;
};
const choosePendingStory = async (game, content, verifyReplay = false) => {
  if (!game.pending_scene_slug) return game;
  const scene = content.scenes.find(
    (item) => item.slug === game.pending_scene_slug,
  );
  const option = scene?.options?.[0]?.slug;
  if (!option)
    throw new Error(`Invalid pending scene ${game.pending_scene_slug}`);
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
    )
      throw new Error("Story idempotency replay failed");
  }
  return {
    ...game,
    progress: first.body.progress,
    pending_scene_slug: first.body.pending_scene_slug,
  };
};

const runSmoke = async () => {
  console.log("Starting authenticated production action-V2 smoke test.");
  const { body: content } = await requestJSON("/v2/content/v2?locale=zh-CN", {
    authenticate: false,
  });
  if (
    content.version !== "v2" ||
    content.protocol !== "action-v1" ||
    content.characters.length !== 7 ||
    content.modules.length < 32 ||
    content.encounters.length < 7
  )
    throw new Error("Production action content is incomplete");
  let { body: game } = await requestJSON("/v2/game");
  if (game.pending_scene_slug === "prologue-last-viewer")
    game = await choosePendingStory(game, content, true);
  let run = game.active_run;
  if (!run)
    run = (
      await post("/v2/runs", {
        chapter_slug: "seventh-dock",
        character_slug: "nana7mi",
        noise_level: 0,
      })
    ).body;
  const recovered = (
    await requestJSON(`/v2/runs/${encodeURIComponent(run.id)}`)
  ).body;
  const recoveredGame = (await requestJSON("/v2/game")).body;
  if (
    recovered.id !== run.id ||
    recovered.version !== run.version ||
    recoveredGame.active_run?.id !== run.id
  )
    throw new Error("Run recovery is inconsistent");
  run = await finishRun(run, content);
  if (run.outcome !== "cleared")
    throw new Error(
      `Action chapter did not clear: ${run.outcome}/${run.state.phase}`,
    );
  game = (await requestJSON("/v2/game")).body;
  while (game.pending_scene_slug)
    game = await choosePendingStory(game, content);
  const finalGame = (await requestJSON("/v2/game")).body;
  if (
    finalGame.progress.highest_noise_level < 1 ||
    finalGame.active_run !== null ||
    finalGame.pending_scene_slug !== null
  )
    throw new Error("Cleared chapter did not settle progression");
  return finalGame;
};
const finalGame = await runSmoke();
console.log(
  JSON.stringify({
    status: "ok",
    protocol: "action-v1",
    content_version: "v2",
    authenticated_as: "synthetic-production-smoke-user",
    highest_noise_level: finalGame.progress.highest_noise_level,
    active_run: finalGame.active_run,
    pending_scene_slug: finalGame.pending_scene_slug,
    requests: requestCount,
    rate_limit_waits: rateLimitWaits,
  }),
);
