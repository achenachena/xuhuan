import { execFileSync } from "node:child_process";
import { mkdirSync, copyFileSync, readFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const api = resolve("apps/api");
const destination = resolve("apps/miniapp/public/campaign/v1");
const checking = process.argv.includes("--check");
const output = checking ? mkdtempSync(join(tmpdir(), "xuhuan-campaign-")) : destination;
mkdirSync(output, { recursive: true });
try {
  execFileSync("go", ["build", "-trimpath", "-buildvcs=false", "-ldflags=-s -w", "-o", join(output, "campaign.wasm"), "./cmd/browser-campaign"], {
    cwd: api, env: { ...process.env, GOOS: "js", GOARCH: "wasm", CGO_ENABLED: "0" }, stdio: "inherit",
  });
  const goroot = execFileSync("go", ["env", "GOROOT"], { cwd: api, encoding: "utf8" }).trim();
  rmSync(join(output, "wasm_exec.js"), { force: true });
  copyFileSync(join(goroot, "lib/wasm/wasm_exec.js"), join(output, "wasm_exec.js"));
  rmSync(join(output, "GO-LICENSE.txt"), { force: true });
  copyFileSync(join(goroot, "LICENSE"), join(output, "GO-LICENSE.txt"));
  if (checking) for (const name of ["campaign.wasm", "wasm_exec.js", "GO-LICENSE.txt"]) {
    if (!readFileSync(join(output, name)).equals(readFileSync(join(destination, name)))) throw new Error(`${name} is stale; run npm run generate:browser-campaign`);
  }
  console.log(checking ? "Browser campaign matches Go sources and toolchain." : "Built browser campaign from shared Go rules.");
} finally { if (checking) rmSync(output, { recursive: true, force: true }); }
