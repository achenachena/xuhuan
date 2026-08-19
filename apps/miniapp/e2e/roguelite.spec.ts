import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const apiURL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8080";
const authHeaders = {
  "X-Dev-Auth": process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN ?? "local-development-token"
};

type Content = {
  cards: Array<{ slug: string; type: string; target: string; cost: number; unplayable: boolean; effects: Array<{ kind: string; amount?: number }> }>;
  events: Array<{ slug: string; options: Array<{ slug: string }> }>;
};

type Run = {
  id: string;
  version: number;
  status: "active" | "completed" | "abandoned";
  outcome: "cleared" | "failed" | "abandoned" | null;
  state: {
    phase: "map" | "combat" | "reward" | "event" | "rest" | "completed";
    map: { nodes: Array<{ id: string; layer: number; type: string; status: string }> };
    reward?: { card_choices: string[] };
    current_event_slug?: string;
    combat?: {
      player: { bandwidth: number; beacons: number; discount_signal: number };
      enemies: Array<{ id: string; health: number }>;
      hand: Array<{ id: string; slug: string }>;
      played_types: string[];
    };
  };
};

const command = async (request: APIRequestContext, run: Run, body: Record<string, unknown>): Promise<Run> => {
  const response = await request.post(`${apiURL}/v2/runs/${run.id}/commands`, {
    headers: { ...authHeaders, "Idempotency-Key": crypto.randomUUID() },
    data: { ...body, expected_version: run.version }
  });
  if (!response.ok()) {
    throw new Error(`command failed (${response.status()}): ${await response.text()}`);
  }
  return (await response.json()).run as Run;
};

const scoreCard = (card: Content["cards"][number]): number => card.effects.reduce((score, effect) => {
  if (effect.kind.startsWith("damage")) return score + (effect.amount ?? 2) * 3;
  if (effect.kind.startsWith("block")) return score + (effect.amount ?? 2) * 2;
  if (effect.kind.startsWith("draw")) return score + (effect.amount ?? 1) * 5;
  if (effect.kind.includes("bandwidth")) return score + 6;
  return score;
}, 0) - card.cost;

const playCombat = async (request: APIRequestContext, initial: Run, content: Content): Promise<Run> => {
  const cards = new Map(content.cards.map((card) => [card.slug, card]));
  let run = initial;
  for (let turn = 0; turn < 30 && run.state.phase === "combat"; turn += 1) {
    let safety = 0;
    while (run.state.phase === "combat" && safety < 16) {
      safety += 1;
      const combat = run.state.combat;
      if (!combat) break;
      const missingTypes = ["attack", "defense", "signal"].filter((type) => !combat.played_types.includes(type));
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
          return rightRoute - leftRoute || scoreCard(right.card!) - scoreCard(left.card!);
        });
      if (playable.length === 0) break;
      const selected = playable[0];
      const target = combat.enemies.find((enemy) => enemy.health > 0)?.id;
      run = await command(request, run, {
        type: "play_card",
        card_instance_id: selected.instance.id,
        target_id: selected.card?.target === "enemy" ? target : selected.card?.target === "self" ? "player" : undefined
      });
    }
    if (run.state.phase === "combat") {
      run = await command(request, run, { type: "end_turn" });
    }
  }
  return run;
};

const finishRun = async (request: APIRequestContext, initial: Run, content: Content): Promise<Run> => {
  let run = initial;
  for (let step = 0; step < 350 && run.status === "active"; step += 1) {
    switch (run.state.phase) {
      case "map": {
        const available = run.state.map.nodes.filter((node) => node.status === "available");
        const preferred = [...available].sort((left, right) => {
          const priority: Record<string, number> = { rest: 0, event: 1, story: 1, combat: 2, elite: 3, boss: 4 };
          return (priority[left.type] ?? 9) - (priority[right.type] ?? 9);
        })[0];
        run = await command(request, run, { type: "choose_node", node_id: preferred.id });
        break;
      }
      case "combat":
        run = await playCombat(request, run, content);
        break;
      case "reward": {
        const cards = new Map(content.cards.map((card) => [card.slug, card]));
        const choice = [...(run.state.reward?.card_choices ?? [])].sort((a, b) => scoreCard(cards.get(b)!) - scoreCard(cards.get(a)!))[0];
        run = await command(request, run, { type: "choose_card_reward", choice_slug: choice });
        break;
      }
      case "event":
        run = await command(request, run, {
          type: "resolve_event",
          choice_slug: content.events.find((event) => event.slug === run.state.current_event_slug)?.options[0]?.slug
        });
        break;
      case "rest":
        run = await command(request, run, { type: "rest", operation: "heal" });
        break;
      case "completed":
        return run;
    }
  }
  return run;
};

const chooseCurrentStoryOption = async (page: Page): Promise<void> => {
  const choice = page.locator("footer button").first();
  await expect(choice).toBeVisible();
  await choice.click();
};

test("serves browser security headers", async ({ request }) => {
  const response = await request.get("/");
  expect(response.headers()["content-security-policy"]).toContain("frame-ancestors");
  expect(response.headers()["permissions-policy"]).toContain("camera=()");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-powered-by"]).toBeUndefined();
});

test("new viewer completes the authoritative prologue, resumes a run, and unlocks noise", async ({ page, request }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");

  await expect(page.getByText(/直播已结束。当前在线人数：1。/)).toBeVisible();
  await chooseCurrentStoryOption(page);
  const start = page.getByRole("button", { name: /接入第七码头/ });
  await expect(start).toBeVisible();

  const contentResponse = await request.get(`${apiURL}/v2/content/v1?locale=zh-CN`);
  expect(contentResponse.ok()).toBe(true);
  const content = (await contentResponse.json()) as Content;

  let cleared = false;
  for (let attempt = 0; attempt < 3 && !cleared; attempt += 1) {
    await start.click();
    const map = page.getByRole("img", { name: "频道拓扑" });
    await expect(map).toBeVisible();
    if (attempt === 0) {
      await page.getByRole("button", { name: /冲突 available/ }).first().click();
      await expect(page.getByText("信号冲突")).toBeVisible();
      await page.reload();
      await expect(page.getByText("信号冲突")).toBeVisible();
    }

    const gameResponse = await request.get(`${apiURL}/v2/game`, { headers: authHeaders });
    expect(gameResponse.ok()).toBe(true);
    const game = await gameResponse.json() as { active_run: Run | null };
    expect(game.active_run).not.toBeNull();
    const result = await finishRun(request, game.active_run!, content);
    cleared = result.outcome === "cleared";
    await page.reload();
  }

  expect(cleared).toBe(true);
  await expect(page.getByText(/未被剪辑的瞬间|Unedited Moment/i)).toBeVisible();
  await chooseCurrentStoryOption(page);
  await chooseCurrentStoryOption(page);
  const noiseOne = page.getByRole("button", { name: "1" });
  await expect(noiseOne).toBeEnabled();

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});
