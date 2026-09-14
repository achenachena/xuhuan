// Optional real Next.js page trace. Start the production build on :3000 first.
// Fixture replaces only this browser context; no production test endpoint.
const fs = require("fs"),
  { createRequire } = require("module");
const req = createRequire(
  require("path").resolve(__dirname, "../../package.json"),
);
(async () => {
  const output = process.argv[2];
  if (!output)
    throw new Error("Usage: node scripts/profiling/app.cjs /tmp/app-profile");
  fs.mkdirSync(output, { recursive: true });
  const config = JSON.parse(
    require("child_process").execFileSync(
      "go",
      ["run", "./cmd/profile-jiaran"],
      {
        cwd: require("path").resolve(__dirname, "../../apps/api"),
        encoding: "utf8",
      },
    ),
  );
  const browser = await req("playwright").chromium.launch({
    channel: "chrome",
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  await page.addInitScript((config) => {
    window.audioInit = [];
    window.AudioContext = new Proxy(window.AudioContext, {
      construct(target, args) {
        const start = performance.now();
        const context = Reflect.construct(target, args);
        window.audioInit.push(performance.now() - start);
        return context;
      },
    });
    window.reactCommits = 0;
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      renderers: new Map(),
      inject(r) {
        this.renderers.set(1, r);
        return 1;
      },
      onCommitFiberRoot() {
        window.reactCommits++;
      },
      onCommitFiberUnmount() {},
    };
    let invoke;
    Object.defineProperty(window, "xuhuanCampaign", {
      get: () => invoke,
      set: (engine) => {
        invoke = (raw) => {
          const response = JSON.parse(engine(raw));
          const run = response.game?.campaign_run;
          if (run?.state.segment) {
            run.state.chapter_slug = "always-cheerful";
            run.state.character_slug = "jiaran";
            run.state.segment_index = 3;
            run.state.segment = {
              ...run.state.segment,
              segment_index: 3,
              boss_id: "always-on-idol",
              background_url: "/game/v4/backgrounds/always-cheerful-stage.webp",
              duration_ticks: 1800,
              runtime_config: config,
            };
          }
          return JSON.stringify(response);
        };
      },
    });
  }, config);
  await page.goto("http://localhost:3000/play");
  await page.getByTestId("shooter-canvas").waitFor();
  await page.waitForFunction(() =>
    performance
      .getEntriesByType("resource")
      .some((r) => r.name.endsWith("/bosses/always-on-idol.webp")),
  );
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Tracing.start", {
    categories: "devtools.timeline,v8,blink.user_timing",
    transferMode: "ReturnAsStream",
  });
  await page.evaluate(() => {
    const surface = document.querySelector(
        '[data-testid="shooter-control-surface"]',
      ),
      r = surface.getBoundingClientRect();
    const start = performance.now(),
      commits = window.reactCommits,
      frames = [],
      tasks = [];
    new PerformanceObserver((list) =>
      tasks.push(...list.getEntries().map((e) => e.duration)),
    ).observe({ type: "longtask" });
    let last = start;
    surface.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 1,
        clientX: r.x + r.width / 2,
        clientY: r.y + r.height * 0.8125,
      }),
    );
    function frame(now) {
      frames.push(now - last);
      last = now;
      surface.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: 1,
          clientX: r.x + r.width * (0.5 + 0.3 * Math.sin((now - start) / 1300)),
          clientY: r.y + r.height * 0.8125,
        }),
      );
      if (now - start < 30000 && document.contains(surface))
        requestAnimationFrame(frame);
      else
        window.appResult = {
          duration: now - start,
          frames,
          commits: window.reactCommits - commits,
          tasks,
        };
    }
    requestAnimationFrame(frame);
  });
  await page.waitForFunction(() => window.appResult, {}, { timeout: 40000 });
  const result = await page.evaluate(() => window.appResult);
  const done = new Promise((r) => cdp.once("Tracing.tracingComplete", r));
  await cdp.send("Tracing.end");
  const { stream } = await done;
  let trace = "";
  for (;;) {
    const x = await cdp.send("IO.read", { handle: stream });
    trace += x.data;
    if (x.eof) break;
  }
  fs.writeFileSync(require("path").join(output, "trace.json"), trace);
  result.frames.sort((a, b) => a - b);
  const summary = {
    durationMs: result.duration,
    frameP95: result.frames[Math.floor(result.frames.length * 0.95)],
    frameP99: result.frames[Math.floor(result.frames.length * 0.99)],
    reactCommits: result.commits,
    longTasks: result.tasks,
    audioInitMs: await page.evaluate(() => window.audioInit),
  };
  fs.writeFileSync(
    require("path").join(output, "summary.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log(summary);
  await browser.close();
})();
