// Manual real-time fixture: pin health to sample each authored phase for 15s.
// No clock acceleration. Never imported by the application.
import { createShooterSimulationFromConfig } from "@/features/shooter/simulation";
import {
  drawShooterArena,
  preloadShooterVisuals,
  observeShooterCanvas,
} from "@/features/shooter/renderer";
const config = await (await fetch("/config")).json();
const canvas = document.querySelector("canvas");
observeShooterCanvas(canvas);
const sources = {
  background: "/game/v4/backgrounds/always-cheerful.webp",
  player: "/game/v4/players/jiaran.webp",
  boss: "/game/v4/bosses/always-on-idol.webp",
  enemies: {},
  pickups: [],
};
const visuals = await preloadShooterVisuals(sources);
const sim = createShooterSimulationFromConfig(config);
let previous = null,
  current = sim.snapshot(),
  last = performance.now(),
  elapsed = 0,
  acc = 0;
const frames = [],
  steps = [],
  draws = [],
  phases = new Set(),
  tasks = [];
new PerformanceObserver((list) =>
  tasks.push(...list.getEntries().map((e) => e.duration)),
).observe({ type: "longtask", buffered: true });
const heapStart = performance.memory?.usedJSHeapSize;
function frame(now) {
  const dt = now - last;
  last = now;
  elapsed += dt;
  acc += dt;
  frames.push(dt);
  while (acc >= 1000 / 30) {
    const state = globalThis.__profileState;
    state.health = 3;
    state.invulnerableTicks = 60;
    const boss = state.enemies.find((e) => e.boss);
    if (boss)
      boss.health = Math.round(
        boss.maxHealth *
          [0.9, 0.6, 0.3][Math.min(2, Math.floor(elapsed / 15000))],
      );
    previous = current;
    const start = performance.now();
    sim.step({ x: 64, y: 5200, rescue: false });
    current = sim.snapshot();
    steps.push(performance.now() - start);
    current.enemies.forEach((e) => {
      if (e.boss) phases.add(e.stage);
    });
    acc -= 1000 / 30;
  }
  const start = performance.now();
  drawShooterArena(
    canvas,
    current,
    previous,
    acc / (1000 / 30),
    sources,
    visuals,
    null,
    current.player_x,
    new Map(),
  );
  draws.push(performance.now() - start);
  if (elapsed < 45000) requestAnimationFrame(frame);
  else
    window.result = {
      frames,
      steps,
      draws,
      phases: [...phases],
      tasks,
      heapStart,
      heapEnd: performance.memory?.usedJSHeapSize,
      ticks: current.tick,
    };
}
requestAnimationFrame(frame);
