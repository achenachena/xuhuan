// Manual profiling, deliberately outside CI. Chrome traces stay outside git.
import { build } from "esbuild";
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = process.argv[2];
const revision = process.argv[3];
if (!output)
  throw new Error(
    "Usage: node scripts/profile-jiaran.mjs /tmp/profile-output [baseline-git-revision]",
  );
mkdirSync(output, { recursive: true });
const config = execFileSync("go", ["run", "./cmd/profile-jiaran"], {
  cwd: path.join(root, "apps/api"),
  encoding: "utf8",
});
writeFileSync(path.join(output, "config.json"), config);
await build({
  entryPoints: [path.join(root, "scripts/profiling/jiaran.ts")],
  bundle: true,
  format: "esm",
  outfile: path.join(output, "bundle.js"),
  tsconfig: path.join(root, "apps/miniapp/tsconfig.json"),
  plugins: [
    {
      name: "local-profile-fixture",
      setup(b) {
        b.onLoad({ filter: /features\/shooter\/.*\.ts$/ }, (args) => {
          let source =
            revision &&
            !(
              process.env.RENDER_ONLY === "1" &&
              args.path.endsWith("/renderer.ts")
            )
              ? execFileSync(
                  "git",
                  ["show", `${revision}:${path.relative(root, args.path)}`],
                  { cwd: root, encoding: "utf8" },
                )
              : readFileSync(args.path, "utf8");
          if (args.path.endsWith("/simulation.ts"))
            source = source.replace(
              "const state = createInitialState(runtime);",
              "const state = createInitialState(runtime); globalThis.__profileState = state;",
            );
          return { contents: source, loader: "ts" };
        });
      },
    },
  ],
});
const server = createServer((request, response) => {
  if (request.url === "/") {
    response.end(
      '<style>body{margin:0;background:#02050e}canvas{height:900px;width:506.25px;display:block;margin:auto}</style><canvas></canvas><script type="module" src="/bundle.js"></script>',
    );
    return;
  }
  if (request.url === "/config") {
    response.setHeader("Content-Type", "application/json");
    response.end(config);
    return;
  }
  if (
    !new Set([
      "/bundle.js",
      "/game/v4/backgrounds/always-cheerful-stage.webp",
      "/game/v4/players/jiaran.webp",
      "/game/v4/bosses/always-on-idol.webp",
    ]).has(request.url)
  ) {
    response.statusCode = 404;
    response.end();
    return;
  }
  const file =
    request.url === "/bundle.js"
      ? path.join(output, "bundle.js")
      : path.join(root, "apps/miniapp/public", request.url);
  try {
    response.setHeader(
      "Content-Type",
      request.url.endsWith(".js") ? "application/javascript" : "image/webp",
    );
    response.end(readFileSync(file));
  } catch {
    response.statusCode = 404;
    response.end();
  }
});
await new Promise((resolve) => server.listen(3011, "127.0.0.1", resolve));
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const cdp = await page.context().newCDPSession(page);
  await page.addInitScript(() => {
    window.drawCalls = {};
    for (const name of ["fillRect", "drawImage", "stroke", "fill"]) {
      const original = CanvasRenderingContext2D.prototype[name];
      CanvasRenderingContext2D.prototype[name] = function (...args) {
        window.drawCalls[name] = (window.drawCalls[name] ?? 0) + 1;
        return original.apply(this, args);
      };
    }
  });
  await cdp.send("Tracing.start", {
    categories:
      "devtools.timeline,v8,blink.user_timing,disabled-by-default-v8.gc",
    transferMode: "ReturnAsStream",
  });
  await page.goto("http://127.0.0.1:3011");
  await page.waitForFunction(() => window.result, {}, { timeout: 60000 });
  const result = await page.evaluate(() => ({
    ...window.result,
    drawCalls: window.drawCalls,
  }));
  const done = new Promise((resolve) =>
    cdp.once("Tracing.tracingComplete", resolve),
  );
  await cdp.send("Tracing.end");
  const { stream } = await done;
  let trace = "";
  for (;;) {
    const chunk = await cdp.send("IO.read", { handle: stream });
    trace += chunk.data;
    if (chunk.eof) break;
  }
  await cdp.send("IO.close", { handle: stream });
  writeFileSync(path.join(output, "trace.json"), trace);
  await page.screenshot({ path: path.join(output, "boss.png") });
  const stats = (values) => {
    values.sort((a, b) => a - b);
    return {
      p50: values[Math.floor(values.length * 0.5)],
      p95: values[Math.floor(values.length * 0.95)],
      p99: values[Math.floor(values.length * 0.99)],
      mean: values.reduce((a, b) => a + b, 0) / values.length,
    };
  };
  const gc = JSON.parse(trace)
    .traceEvents.filter((e) => ["MinorGC", "MajorGC"].includes(e.name) && e.dur)
    .map((e) => e.dur / 1000);
  const summary = {
    revision: revision ?? "working tree",
    renderOnly: process.env.RENDER_ONLY === "1",
    browser: await browser.version(),
    viewport: "1440x900 DPR2; 506.25x900 CSS canvas",
    frames: stats(result.frames.slice(60)),
    simulation: stats(result.steps),
    drawing: stats(result.draws),
    phases: result.phases,
    longTasks: result.tasks,
    gc: { count: gc.length, totalMs: gc.reduce((a, b) => a + b, 0) },
    heapDeltaBytes: result.heapEnd - result.heapStart,
    ticks: result.ticks,
    drawCalls: result.drawCalls,
  };
  if (summary.phases.join(",") !== "1,2,3")
    throw new Error("Fixture failed to visit all three phases");
  writeFileSync(
    path.join(output, "summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
  );
  console.log(summary);
} finally {
  await browser.close();
  server.close();
}
