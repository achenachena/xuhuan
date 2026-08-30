import {
  autoAttack,
  updateEnemies,
} from "@/features/action/action-combat";
import { updateKitEffects } from "@/features/action/action-kit-effects";
import {
  collectSignals,
  movePlayer,
  updateSignalDecay,
} from "@/features/action/action-kits";
import { goDivide } from "@/features/action/action-math";
import {
  isBossEncounter,
  objectiveComplete,
  updateObjective,
} from "@/features/action/action-objectives";
import {
  updateHazards,
  updateProjectiles,
} from "@/features/action/action-projectiles";
import {
  createSimulationState,
  type SimulationState,
} from "@/features/action/action-simulation-state";
import {
  buildActionResult,
  buildActionSnapshot,
} from "@/features/action/action-snapshot";
import { spawnEnemies } from "@/features/action/action-spawning";
import { TraceRecorder } from "@/features/action/action-trace";
import type {
  ActionConfig,
  ActionEnemySnapshot,
  ActionInput,
  ActionProjectileSnapshot,
  ActionResult,
  ActionSnapshot,
  ActionTrace,
} from "@/features/action/action-types";
import {
  ACTION_HEIGHT,
  ACTION_TPS,
  ACTION_WIDTH,
  buildActionConfig,
} from "@/features/action/action-types";

export {
  ACTION_HEIGHT,
  ACTION_TPS,
  ACTION_WIDTH,
  buildActionConfig,
  TraceRecorder,
};
export type {
  ActionConfig,
  ActionEnemySnapshot,
  ActionInput,
  ActionProjectileSnapshot,
  ActionResult,
  ActionSnapshot,
  ActionTrace,
};

const advanceTransientState = (state: SimulationState): void => {
  state.tickValue += 1;
  if (state.warpClock > 0) {
    state.warpClock -= 1;
    if (state.warpClock === 0) state.warpReadyTick = state.tickValue;
  }
  if (state.invulnerable > 0) state.invulnerable -= 1;
  if (state.reconnectFX > 0) state.reconnectFX -= 1;
  if (state.warpFX > 0) state.warpFX -= 1;
  if (state.signalPulse > 0) state.signalPulse -= 1;
  state.signalCooldown = state.signalCooldown.map((cooldown) =>
    cooldown > 0 ? cooldown - 1 : 0,
  );
};

const updateDistortion = (state: SimulationState): void => {
  if (
    state.config.hazards.includes("distortion_rain") &&
    state.tickValue % 90 === 0
  ) {
    state.distortion = Math.min(99, state.distortion + 3);
  }
  const decayInterval = 15 + state.config.noiseLevel * 3;
  if (
    state.distortion > 0 &&
    state.tickValue - state.lastGraze > 60 &&
    state.tickValue % decayInterval === 0
  ) {
    state.distortion -= 1;
  }
};

const resolvePlayerDefeat = (state: SimulationState): void => {
  if (state.health > 0) return;
  if (
    state.config.emergencyReconnectAvailable &&
    !state.emergencyUsed
  ) {
    state.emergencyUsed = true;
    state.health = Math.max(
      1,
      goDivide(state.config.playerMaxHealth * 40, 100),
    );
    state.projectiles = [];
    state.invulnerable = 45;
    state.reconnectFX = 90;
    return;
  }
  state.finished = true;
};

const resolveEncounter = (state: SimulationState): void => {
  if (state.finished) return;
  if (isBossEncounter(state)) {
    const bossAlive = state.enemies.some(
      (enemy) =>
        state.config.enemies[enemy.specIndex]?.pattern === "boss" &&
        enemy.health > 0,
    );
    if (!bossAlive) {
      state.finished = true;
      state.won = true;
    } else if (state.tickValue >= state.config.maxTicks) {
      state.finished = true;
    }
    return;
  }
  if (state.config.kind === "tutorial" && state.routeWarpUsed) {
    state.finished = true;
    state.won = true;
    return;
  }
  updateObjective(state);
  if (objectiveComplete(state)) {
    state.finished = true;
    state.won = true;
  } else if (state.tickValue >= state.config.maxTicks) {
    state.finished = true;
  }
};

export class ActionSimulation {
  readonly config: ActionConfig;
  private readonly state: SimulationState;

  constructor(config: ActionConfig, seed: number) {
    this.state = createSimulationState(config, seed);
    this.config = this.state.config;
  }

  step(input: ActionInput): ActionResult | null {
    if (this.state.finished) return buildActionResult(this.state);
    advanceTransientState(this.state);
    movePlayer(this.state, input);
    collectSignals(this.state);
    spawnEnemies(this.state);
    updateEnemies(this.state);
    autoAttack(this.state);
    updateKitEffects(this.state);
    updateHazards(this.state);
    updateProjectiles(this.state);
    updateSignalDecay(this.state);
    updateDistortion(this.state);
    resolvePlayerDefeat(this.state);
    resolveEncounter(this.state);
    return this.state.finished ? buildActionResult(this.state) : null;
  }

  snapshot(): ActionSnapshot {
    return buildActionSnapshot(this.state);
  }
}

export const createActionSimulation = (
  config: ActionConfig,
): ActionSimulation => {
  let seed = 2166136261;
  const bytes = new TextEncoder().encode(config.seed);
  for (let index = 0; index < bytes.length; index += 1) {
    seed = Math.imul((seed ^ bytes[index]) >>> 0, 16777619) >>> 0;
  }
  return new ActionSimulation(config, seed || 0x9e3779b9);
};
