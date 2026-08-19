import { createHash, createHmac, randomUUID } from "node:crypto";

const apiBaseURL = (process.env.API_BASE_URL ?? "").replace(/\/+$/, "");
const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
const smokeRunID = process.env.SMOKE_RUN_ID ?? randomUUID();

if (!apiBaseURL.startsWith("https://")) {
  throw new Error("API_BASE_URL must be a production https URL");
}
if (!botToken || botToken === "replace-out-of-band") {
  throw new Error("TELEGRAM_BOT_TOKEN is required");
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const smokeSuffix = Number.parseInt(
  createHash("sha256").update(smokeRunID).digest("hex").slice(0, 10),
  16
);
const telegramUserID = 8_000_000_000_000_000 + (smokeSuffix % 10_000_000_000);
const telegramUser = {
  id: telegramUserID,
  username: `xuhuan_smoke_${String(smokeSuffix).slice(0, 12)}`,
  first_name: "Production",
  last_name: "Smoke",
  language_code: "zh-CN"
};

const createTelegramInitData = () => {
  const values = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `production-smoke-${smokeRunID}`,
    user: JSON.stringify(telegramUser)
  });
  const dataCheckString = [...values.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  values.set("hash", hash);
  return values.toString();
};

const initData = createTelegramInitData();
let requestCount = 0;
let rateLimitWaits = 0;

const requestJSON = async (path, { method = "GET", body, idempotencyKey, authenticate = true } = {}) => {
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
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {})
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch (error) {
      if (attempt === 7) throw error;
      const waitMilliseconds = Math.min(2 ** attempt * 500, 8_000);
      console.log(`Transient network failure; retrying in ${waitMilliseconds}ms.`);
      await sleep(waitMilliseconds);
      continue;
    }

    if (response.ok) {
      return {
        body: await response.json(),
        replayed: response.headers.get("idempotency-replayed") === "true"
      };
    }

    const responseBody = await response.text();
    if (response.status === 429) {
      rateLimitWaits += 1;
      const retryAfter = Number.parseInt(response.headers.get("retry-after") ?? "1", 10);
      const waitSeconds = Number.isFinite(retryAfter) ? Math.min(Math.max(retryAfter, 1), 65) : 1;
      console.log(`Rate limit reached; respecting Retry-After (${waitSeconds}s).`);
      await sleep(waitSeconds * 1000 + 250);
      continue;
    }
    if (response.status >= 500 && attempt < 7) {
      const waitMilliseconds = Math.min(2 ** attempt * 500, 8_000);
      console.log(`Transient API ${response.status}; retrying in ${waitMilliseconds}ms.`);
      await sleep(waitMilliseconds);
      continue;
    }
    throw new Error(`${method} ${path} failed (${response.status}): ${responseBody.slice(0, 500)}`);
  }
  throw new Error(`${method} ${path} exhausted retries`);
};

const post = (path, body, idempotencyKey = randomUUID()) =>
  requestJSON(path, { method: "POST", body, idempotencyKey });

const scoreCard = (card) =>
  card.effects.reduce((score, effect) => {
    if (effect.kind.startsWith("damage")) return score + (effect.amount ?? 2) * 3;
    if (effect.kind.startsWith("block")) return score + (effect.amount ?? 2) * 2;
    if (effect.kind.startsWith("draw")) return score + (effect.amount ?? 1) * 5;
    if (effect.kind.includes("bandwidth")) return score + 6;
    return score;
  }, 0) - card.cost;

const command = async (run, body) => {
  const response = await post(`/v2/runs/${encodeURIComponent(run.id)}/commands`, {
    ...body,
    expected_version: run.version
  });
  return response.body.run;
};

const playCombat = async (initialRun, content) => {
  const cards = new Map(content.cards.map((card) => [card.slug, card]));
  let run = initialRun;
  for (let turn = 0; turn < 30 && run.state.phase === "combat"; turn += 1) {
    let safety = 0;
    while (run.state.phase === "combat" && safety < 16) {
      safety += 1;
      const combat = run.state.combat;
      if (!combat) break;
      const missingTypes = ["attack", "defense", "signal"].filter(
        (type) => !combat.played_types.includes(type)
      );
      const playable = combat.hand
        .map((instance) => ({ instance, card: cards.get(instance.slug) }))
        .filter(({ card }) => {
          if (!card || card.unplayable) return false;
          const cost = card.type === "signal" && combat.player.discount_signal > 0 ? 0 : card.cost;
          const required = card.effects.find((effect) => effect.kind === "spend_marker")?.amount ?? 0;
          return cost <= combat.player.bandwidth && required <= combat.player.beacons;
        })
        .sort((left, right) => {
          const leftRoute = missingTypes.includes(left.card?.type ?? "") ? 1 : 0;
          const rightRoute = missingTypes.includes(right.card?.type ?? "") ? 1 : 0;
          return rightRoute - leftRoute || scoreCard(right.card) - scoreCard(left.card);
        });
      if (playable.length === 0) break;
      const selected = playable[0];
      const target = combat.enemies.find((enemy) => enemy.health > 0)?.id;
      run = await command(run, {
        type: "play_card",
        card_instance_id: selected.instance.id,
        target_id:
          selected.card.target === "enemy"
            ? target
            : selected.card.target === "self"
              ? "player"
              : undefined
      });
    }
    if (run.state.phase === "combat") {
      run = await command(run, { type: "end_turn" });
    }
  }
  return run;
};

const finishRun = async (initialRun, content) => {
  let run = initialRun;
  for (let step = 0; step < 350 && run.status === "active"; step += 1) {
    switch (run.state.phase) {
      case "map": {
        const available = run.state.map.nodes.filter((node) => node.status === "available");
        const preferred = [...available].sort((left, right) => {
          const priority = { rest: 0, event: 1, story: 1, combat: 2, elite: 3, boss: 4 };
          return (priority[left.type] ?? 9) - (priority[right.type] ?? 9);
        })[0];
        if (!preferred) throw new Error("Active map has no available node");
        run = await command(run, { type: "choose_node", node_id: preferred.id });
        break;
      }
      case "combat":
        run = await playCombat(run, content);
        break;
      case "reward": {
        const cards = new Map(content.cards.map((card) => [card.slug, card]));
        const choice = [...(run.state.reward?.card_choices ?? [])].sort(
          (left, right) => scoreCard(cards.get(right)) - scoreCard(cards.get(left))
        )[0];
        run = await command(run, { type: "choose_card_reward", choice_slug: choice ?? "" });
        break;
      }
      case "event": {
        const event = content.events.find((item) => item.slug === run.state.current_event_slug);
        const choice = event?.options[0]?.slug;
        if (!choice) throw new Error(`Event ${run.state.current_event_slug} has no option`);
        run = await command(run, { type: "resolve_event", choice_slug: choice });
        break;
      }
      case "rest":
        run = await command(run, { type: "rest", operation: "heal" });
        break;
      case "completed":
        return run;
      default:
        throw new Error(`Unsupported run phase: ${run.state.phase}`);
    }
  }
  return run;
};

const choosePendingStory = async (game, content, verifyReplay = false) => {
  if (!game.pending_scene_slug) return game;
  const scene = content.scenes.find((item) => item.slug === game.pending_scene_slug);
  const option = scene?.options[0]?.slug;
  if (!scene || !option) throw new Error(`Pending scene ${game.pending_scene_slug} is invalid`);
  const request = {
    scene_slug: scene.slug,
    option_slug: option,
    expected_version: game.progress.version
  };
  const idempotencyKey = randomUUID();
  const first = await post("/v2/story/choices", request, idempotencyKey);
  if (verifyReplay) {
    const replay = await post("/v2/story/choices", request, idempotencyKey);
    if (!replay.replayed || replay.body.progress.version !== first.body.progress.version) {
      throw new Error("Story choice idempotency replay did not return the original result");
    }
  }
  return {
    ...game,
    progress: first.body.progress,
    pending_scene_slug: first.body.pending_scene_slug
  };
};

const runSmoke = async () => {
  console.log("Starting authenticated production V2 smoke test.");
  const { body: content } = await requestJSON("/v2/content/v1?locale=zh-CN", {
    authenticate: false
  });
  if (
    content.version !== "v1" ||
    content.characters.length !== 7 ||
    content.cards.length < 30 ||
    content.scenes.length < 3
  ) {
    throw new Error("Production content manifest is incomplete");
  }

  let { body: game } = await requestJSON("/v2/game");
  if (game.progress.highest_noise_level >= 1 && !game.active_run && !game.pending_scene_slug) {
    console.log("This smoke identity already completed the production journey; state is healthy.");
    return game;
  }

  if (game.pending_scene_slug === "prologue-last-viewer") {
    game = await choosePendingStory(game, content, true);
  }

  let run = game.active_run;
  let recoveryVerified = false;
  let cleared = false;
  for (let attempt = 1; attempt <= 3 && !cleared; attempt += 1) {
    if (!run) {
      const created = await post("/v2/runs", {
        chapter_slug: "seventh-dock",
        character_slug: "nana7mi",
        noise_level: 0
      });
      run = created.body;
    }

    const { body: recoveredByID } = await requestJSON(
      `/v2/runs/${encodeURIComponent(run.id)}`
    );
    const { body: recoveredGame } = await requestJSON("/v2/game");
    if (
      recoveredByID.id !== run.id ||
      recoveredByID.version !== run.version ||
      recoveredGame.active_run?.id !== run.id
    ) {
      throw new Error("Authoritative run recovery returned inconsistent state");
    }
    recoveryVerified = true;

    console.log(`Completing run attempt ${attempt}/3 from phase ${run.state.phase}.`);
    run = await finishRun(run, content);
    cleared = run.outcome === "cleared";
    if (!cleared && run.status === "active") {
      throw new Error(`Run stopped making progress in phase ${run.state.phase}`);
    }
    const refreshed = await requestJSON("/v2/game");
    game = refreshed.body;
    run = game.active_run;
  }

  if (!cleared || !recoveryVerified) {
    throw new Error("The chapter was not cleared within three production attempts");
  }

  while (game.pending_scene_slug) {
    game = await choosePendingStory(game, content);
  }
  const { body: finalGame } = await requestJSON("/v2/game");
  if (
    finalGame.progress.highest_noise_level < 1 ||
    finalGame.active_run !== null ||
    finalGame.pending_scene_slug !== null
  ) {
    throw new Error("Cleared chapter did not unlock noise level 1 or settle authoritative state");
  }
  return finalGame;
};

const finalGame = await runSmoke();
console.log(
  JSON.stringify({
    status: "ok",
    content_version: "v1",
    authenticated_as: "synthetic-production-smoke-user",
    highest_noise_level: finalGame.progress.highest_noise_level,
    active_run: finalGame.active_run,
    pending_scene_slug: finalGame.pending_scene_slug,
    requests: requestCount,
    rate_limit_waits: rateLimitWaits
  })
);
