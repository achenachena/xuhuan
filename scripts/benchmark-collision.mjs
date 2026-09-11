import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { platform, arch, cpus } from "node:os";
const require = createRequire(new URL("../apps/miniapp/package.json", import.meta.url));
const ts = require("typescript");
const module = { exports: {} };
const source = readFileSync(new URL("../apps/miniapp/src/features/shooter/collision.ts", import.meta.url), "utf8");
new Function("exports", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(module.exports);
const optimized = module.exports.sweptShooterHit;
// Baseline from 7729187, retained only here to make the before/after claim reproducible.
const baseline = (fromX, fromY, toX, toY, x, y, halfWidth, halfHeight) => {
  let near = 0, far = 1;
  for (const [start, delta, center, extent] of [[fromX, toX - fromX, x, halfWidth], [fromY, toY - fromY, y, halfHeight]]) {
    if (delta === 0) { if (Math.abs(start - center) > extent) return null; continue; }
    const a = (center - extent - start) / delta, b = (center + extent - start) / delta;
    near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
    if (near > far) return null;
  }
  return near;
};
let seed = 17;
const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
const cases = Array.from({ length: 10_000 }, () => Array.from({ length: 8 }, (_, i) => i > 5 ? random() * 500 : Math.round(random() * 4_000)));
for (const args of cases) if (baseline(...args) !== optimized(...args)) throw new Error("Collision result mismatch");
let checksum = 0;
const time = (fn, count) => { const start = performance.now(); for (let i = 0; i < count; i++) checksum += fn(...cases[i % cases.length]) ?? 0; return performance.now() - start; };
for (const fn of [baseline, optimized]) time(fn, 200_000);
const samples = [[], []];
for (let trial = 0; trial < 7; trial++) for (const index of trial % 2 ? [1, 0] : [0, 1]) samples[index].push(time([baseline, optimized][index], 1_000_000));
console.log(`Node ${process.version}; ${platform()}/${arch()}; ${cpus()[0]?.model}`);
console.log("10,000 seeded trajectories: identical results. Warmup: 200,000 calls per function.");
console.log("Seven alternating trials, 1,000,000 calls each; milliseconds (lower is better).");
for (const [index, label] of ["baseline", "optimized"].entries()) console.log(`${label}: ${samples[index].map(n => n.toFixed(2)).join(", ")}; median=${[...samples[index]].sort((a,b)=>a-b)[3].toFixed(2)} ms`);
console.log(`Checksum: ${checksum.toFixed(4)}. Microbenchmark only; not a game FPS measurement.`);
