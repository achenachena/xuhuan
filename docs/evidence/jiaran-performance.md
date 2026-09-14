# Jiaran Boss rendering measurements

Measured on 2026-09-13 with Chrome 152.0.7977.83, headless on an Apple M4 Mac running macOS 26.6.2,
1440 × 900 viewport, DPR 2, 506.25 × 900 CSS-pixel portrait canvas. These are
local controlled measurements, not a guarantee for other devices or WebViews.

The standalone browser fixture uses the real Go-generated Jiaran Boss runtime,
seed `jiaran-profile-2026:segment:3`, and spread/piercing/echo effects. To sample
all three authored phases for 15 seconds each, it pins Boss health to 90/60/30%
and restores player health/invulnerability. Position/input stays fixed. This is
a rendering workload, **not a recorded human win**. It runs 1,350 simulation
ticks in 45 real seconds; no accelerated clock. The original Boss attack
intervals, projectiles, movement and collision functions are used.

| 45-second sample | Original `2e72fc5` | Rendering changes only | Final evolutions |
|---|---:|---:|---:|
| Frame p95 (ms) | 16.8 | 16.8 | 16.7 |
| Frame p99 (ms) | 33.3 | 16.8 | 16.8 |
| Simulation p95 / p99 (ms) | 0.1 / 0.2 | 0.1 / 0.2 | 0.1 / 0.2 |
| Canvas submission p95 / p99 (ms) | 0.2 / 0.2 | 0.2 / 0.2 | 0.2 / 0.2 |
| Long tasks (>50 ms) | 0 | 0 | 0 |
| Minor + major GC total (ms) | 13.16 | 13.24 | 14.14 |
| JS heap change (bytes) | +1,297,521 | +278,011 | +874,360 |
| `fillRect` calls | 187,824 | 35,937 | 35,937 |
| `drawImage` calls | 9,430 | 47,741 | 48,401 |

Initial repeated samples of the old renderer also reached p99 16.8 ms. The
reported sustained stutter was **not consistently reproduced on this machine**;
the single worse baseline tail is not sufficient to claim a universal FPS
improvement. Timer precision and background scheduling affect these small CPU
numbers. Canvas submission timing excludes asynchronous GPU work; JS heap deltas
exclude canvas/GPU allocations and depend on GC timing.

The concrete change is replacing repeated pixel paths/blur drawing with cached
raster copies: about 81% fewer rectangle commands in this workload. Background
and projectile caches belong to the current canvas, rebuild on resize, and do
not retain every previous viewport. The projectile atlas is bounded to 96
variants. Enemy hit filters and duplicate hit-sprite drawing are removed.

A separate trace of the real production Next.js page recorded 24.51 seconds of
Jiaran combat with pointer movement, p95 16.8 ms / p99 16.8 ms, and 245 React
commits (about 10/second). It ended on player defeat. One initial pointerdown
long task was 106 ms; timing the native AudioContext constructor accounted for
104.2 ms. This is first-gesture audio initialization, not sustained combat.
React commit **count** is measured; this production trace does not isolate React
render CPU time. No claims about React CPU savings are made.

## Reproduce

Requires the existing npm dependencies, the pinned Go toolchain, and local
Chrome. These optional recordings are outside CI and do not add release gates.

```sh
node scripts/profile-jiaran.mjs /tmp/jiaran-before 2e72fc5313fc1715d5ff43f29e670ce662fde388
RENDER_ONLY=1 node scripts/profile-jiaran.mjs /tmp/jiaran-render-only 2e72fc5313fc1715d5ff43f29e670ce662fde388
node scripts/profile-jiaran.mjs /tmp/jiaran-after

# With the production Next.js build running on localhost:3000:
node scripts/profiling/app.cjs /tmp/jiaran-app
```

Run captures sequentially, using the same viewport and browser. Each output
directory contains a Chrome `trace.json` and a numeric `summary.json`; the
standalone capture also includes its final screenshot. Import the trace into
Chrome DevTools Performance. Large traces remain local instead of inflating
the repository. Fixtures are injected only by the manual tool and are never
imported by the application or exposed as an API.

A separate real-time campaign journey with automated aiming/dodging cleared
Nana at 81.3 seconds, started Jiaran at 82.0 seconds, entered her Boss at 141.6
seconds and reached her story choice at 155.7 seconds. Both characters finished
with three hearts. This used normal combat and actual WASM progression, with no
health edits or clock acceleration. It verifies the six gates and character
handoff; automated inputs are not evidence of human usability or difficulty.
