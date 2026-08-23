import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

const apiURL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8080";
const authHeaders = {
  "X-Dev-Auth":
    process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN ?? "local-development-token",
};

// This journey mutates the single development player's PostgreSQL state.
// Retrying it in the same worker would no longer exercise a new player.
test.describe.configure({ retries: 0 });

type Content = {
  events: Array<{ slug: string; options: Array<{ slug: string }> }>;
};
type Run = {
  id: string;
  version: number;
  status: "active" | "completed" | "abandoned";
  outcome: "cleared" | "failed" | "abandoned" | null;
  state: {
    phase: "map" | "encounter" | "reward" | "event" | "rest" | "completed";
    map: {
      nodes: Array<{ id: string; layer: number; type: string; status: string }>;
    };
    encounter?: { kind: string; duration_ticks: number; max_ticks: number };
    reward?: { module_choices: string[] };
    current_event_slug?: string;
    modules: Array<{ slug: string; level: number }>;
  };
};

const command = async (
  request: APIRequestContext,
  run: Run,
  body: Record<string, unknown>,
): Promise<Run> => {
  const response = await request.post(`${apiURL}/v2/runs/${run.id}/commands`, {
    headers: { ...authHeaders, "Idempotency-Key": crypto.randomUUID() },
    data: { ...body, expected_version: run.version },
  });
  if (!response.ok())
    throw new Error(
      `${String(body.type)} failed in ${run.state.phase} (${response.status()}): ${await response.text()}`,
    );
  return (await response.json()).run as Run;
};

const actionTrace = (ticks: number) => {
  const controls: number[] = [];
  const route = [0, 4, 8, 12];
  for (let tick = 0; tick < ticks; tick += 1) {
    let control = route[Math.floor(tick / 45) % route.length]! | 0x30;
    if (tick % 210 === 1) control |= 0x40;
    controls.push(control);
  }
  const bytes: number[] = [];
  for (let index = 0; index < controls.length; ) {
    let count = 1;
    while (
      index + count < controls.length &&
      controls[index + count] === controls[index] &&
      count < 255
    )
      count += 1;
    bytes.push(controls[index]!, count);
    index += count;
  }
  return {
    encoding: "rle8-v1",
    ticks,
    data: Buffer.from(bytes).toString("base64").replace(/=+$/, ""),
  };
};

const finishRun = async (
  request: APIRequestContext,
  initial: Run,
  content: Content,
): Promise<Run> => {
  let run = initial;
  for (let step = 0; step < 50 && run.status === "active"; step += 1) {
    switch (run.state.phase) {
      case "encounter": {
        const encounter = run.state.encounter;
        if (!encounter) throw new Error("encounter has no duration");
        run = await command(request, run, {
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
        run = await command(request, run, {
          type: "choose_module_reward",
          choice_slug: run.state.reward?.module_choices[0] ?? "",
        });
        break;
      case "map": {
        const available = run.state.map.nodes.filter(
          (node) => node.status === "available",
        );
        const priority: Record<string, number> = {
          elite: 0,
          story: 1,
          event: 2,
          combat: 3,
          boss: 4,
          rest: 9,
        };
        const selected = [...available].sort(
          (left, right) =>
            (priority[left.type] ?? 8) - (priority[right.type] ?? 8),
        )[0];
        if (!selected) throw new Error("map has no available node");
        run = await command(request, run, {
          type: "choose_node",
          node_id: selected.id,
        });
        break;
      }
      case "event": {
        const event = content.events.find(
          (item) => item.slug === run.state.current_event_slug,
        );
        const choice = event?.options[0]?.slug;
        if (!choice)
          throw new Error(
            `event ${run.state.current_event_slug} has no choice`,
          );
        run = await command(request, run, {
          type: "resolve_event",
          choice_slug: choice,
        });
        break;
      }
      case "rest":
        run = await command(request, run, {
          type: "rest",
          operation: "repair",
        });
        break;
      case "completed":
        return run;
    }
  }
  return run;
};
const chooseStory = async (page: Page) => {
  const choice = page.locator("footer button").first();
  await expect(choice).toBeVisible();
  await choice.click();
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

test("new viewer enters action in one tap, resumes the room, clears the boss, and unlocks noise", async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  await expect(
    page.getByText("The stream has ended. Current viewers: 1."),
  ).toBeVisible();
  // Next.js devtools occupy this corner in development. Dispatch directly to
  // test the app control without letting framework-only chrome consume it.
  await page
    .getByRole("button", { name: "Switch language to Chinese" })
    .dispatchEvent("click");
  await expect(page.getByText("直播已结束。当前在线人数：1。")).toBeVisible();
  await chooseStory(page);
  const canvas = page.getByRole("img", { name: "动作战斗区域" });
  await expect(canvas).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.dataset.telegramHost = "true";
    document.documentElement.dataset.telegramFullscreen = "true";
  });
  const hud = await page.getByTestId("combat-hud").boundingBox();
  expect(hud?.y).toBeGreaterThanOrEqual(100);
  const encounterViewport = await page.evaluate(() => ({
    clientHeight: document.documentElement.clientHeight,
    scrollHeight: document.documentElement.scrollHeight,
    bodyPosition: getComputedStyle(document.body).position,
    touchAction: getComputedStyle(document.documentElement).touchAction,
  }));
  expect(encounterViewport.scrollHeight).toBeLessThanOrEqual(
    encounterViewport.clientHeight,
  );
  expect(encounterViewport.bodyPosition).toBe("fixed");
  expect(encounterViewport.touchAction).toBe("none");
  const movementStick = page.getByRole("group", { name: "移动盘" });
  const box = await movementStick.boundingBox();
  if (!box) throw new Error("movement stick has no bounds");
  await page.mouse.move(box.x + 72, box.y + box.height - 72);
  await page.mouse.down();
  await page.mouse.move(box.x + 128, box.y + box.height - 128, { steps: 5 });
  await page.waitForTimeout(300);
  await page.mouse.up();
  await page.getByRole("button", { name: "相位冲刺" }).click();
  const firstGame = await request.get(`${apiURL}/v2/game`, {
    headers: authHeaders,
  });
  const first = (await firstGame.json()) as { active_run: Run | null };
  expect(first.active_run?.state.phase).toBe("encounter");
  await page.reload();
  await expect(page.getByRole("img", { name: "动作战斗区域" })).toBeVisible();
  const contentResponse = await request.get(
    `${apiURL}/v2/content/v2?locale=zh-CN`,
  );
  expect(contentResponse.ok()).toBe(true);
  const content = (await contentResponse.json()) as Content;
  const result = await finishRun(request, first.active_run!, content);
  expect(result.outcome).toBe("cleared");
  await page.reload();
  await expect(
    page.getByText("最优人格已离线。请选择要保留的七海版本。"),
  ).toBeVisible();
  await chooseStory(page);
  await chooseStory(page);
  await expect(page.getByRole("button", { name: "1" })).toBeEnabled();
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    clientHeight: document.documentElement.clientHeight,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.clientHeight);
});
