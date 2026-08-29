import {
  ACTION_DIRECTIONS,
  clamp,
  distanceSquared,
  goDivide,
  nearTravelPath,
} from "@/features/action/action-math";
import {
  activateKitWarp,
  detonateNanaWaypoints,
  empowerLatestAvaReplay,
  launchFriendlyShot,
  markAllProjectiles,
  onProtocolComplete,
  plantBloom,
  recordWarp,
} from "@/features/action/action-kit-effects";
import { weaveProtocol } from "@/features/action/action-protocols";
import {
  PLAYER_RADIUS,
  SIGNAL_PATTERNS,
  SIGNAL_RADIUS,
  SIGNAL_TYPES,
  type SimulationState,
} from "@/features/action/action-simulation-state";
import type { ActionInput, ActionVec } from "@/features/action/action-types";
import { ACTION_HEIGHT, ACTION_WIDTH } from "@/features/action/action-types";

export const BELLA_PERFECT_WINDOW_TICKS = 30;

export const movePlayer = (
  state: SimulationState,
  input: ActionInput,
): void => {
  let vector = ACTION_DIRECTIONS[input.direction & 15]!;
  if (input.magnitude > 0) {
    const speed = goDivide(
      state.config.runtime.moveSpeed * input.magnitude,
      3,
    );
    state.playerX += goDivide(vector.x * speed, 1000);
    state.playerY += goDivide(vector.y * speed, 1000);
  }
  if (input.skill && state.warpClock === 0) {
    const startX = state.playerX;
    const startY = state.playerY;
    if (input.magnitude === 0) vector = ACTION_DIRECTIONS[12]!;
    state.playerX += goDivide(vector.x * 620, 1000);
    state.playerY += goDivide(vector.y * 620, 1000);
    state.invulnerable = 12;
    state.warpFX = 10;
    state.warpClock = state.config.runtime.warpCooldown;
    recordWarp(
      state,
      { x: startX, y: startY },
      { x: state.playerX, y: state.playerY },
    );
    const empowered = state.routeReady;
    let radius = empowered ? 700 : 330;
    let damage = empowered
      ? Math.max(12, state.config.runtime.warpDamage)
      : Math.max(4, goDivide(state.config.runtime.warpDamage, 2));
    switch (state.config.runtime.passive) {
      case "bella_perfect_warp":
        if (
          state.warpReadyTick >= 0 &&
          state.tickValue - state.warpReadyTick <=
            BELLA_PERFECT_WINDOW_TICKS
        ) {
          radius += 180;
          damage += Math.max(3, goDivide(damage, 3));
          state.shield += 5;
          state.invulnerable = Math.max(state.invulnerable, 18);
          state.score += 75;
          launchFriendlyShot(
            state,
            { x: state.playerX, y: state.playerY },
            Math.max(4, goDivide(state.config.runtime.warpDamage, 4)),
          );
        }
        break;
    }
    const midpointX = goDivide(startX + state.playerX, 2);
    const midpointY = goDivide(startY + state.playerY, 2);
    for (const enemy of state.enemies) {
      if (
        nearTravelPath(
          enemy.x,
          enemy.y,
          startX,
          startY,
          midpointX,
          midpointY,
          state.playerX,
          state.playerY,
          radius,
        )
      ) {
        enemy.health -= damage;
      }
    }
    if (empowered) {
      state.routeWarpUsed = true;
      activateProtocol(
        state,
        startX,
        startY,
        state.playerX,
        state.playerY,
      );
    }
    activateKitWarp(state, empowered);
    state.projectiles = state.projectiles.filter(
      (bullet) =>
        !nearTravelPath(
          bullet.x,
          bullet.y,
          startX,
          startY,
          midpointX,
          midpointY,
          state.playerX,
          state.playerY,
          radius,
        ),
    );
    if (empowered) {
      state.routeReady = false;
      state.protocol = "";
      state.weave = [];
      state.signalWaypoints = [];
      state.routeStep = 0;
    }
  }
  const narrow = state.config.hazards.includes("narrow_arena");
  state.playerX = clamp(
    state.playerX,
    narrow ? 620 : PLAYER_RADIUS,
    narrow ? ACTION_WIDTH - 620 : ACTION_WIDTH - PLAYER_RADIUS,
  );
  state.playerY = clamp(
    state.playerY,
    700,
    ACTION_HEIGHT - PLAYER_RADIUS,
  );
};

export const collectSignals = (state: SimulationState): void => {
  const positions = SIGNAL_PATTERNS[state.signalPattern]!;
  for (let index = 0; index < positions.length; index += 1) {
    const position = positions[index]!;
    if (
      state.signalCooldown[index]! > 0 ||
      distanceSquared(
        state.playerX,
        state.playerY,
        position.x,
        position.y,
      ) >
        (PLAYER_RADIUS + SIGNAL_RADIUS) ** 2
    ) {
      continue;
    }
    collectSignal(state, index, position);
    return;
  }
};

const collectSignal = (
  state: SimulationState,
  index: number,
  position: ActionVec,
): void => {
  const signal = SIGNAL_TYPES[index]!;
  const protocolLocked = state.routeReady;
  state.signalCooldown[index] = 45;
  state.signalPulse = 18;
  state.lastSignal = signal;
  state.lastSignalTick = state.tickValue;
  if (!protocolLocked) {
    state.weave.push(signal);
    state.routeStep = state.weave.length;
    if (state.config.runtime.passive === "nana_route_chain") {
      state.signalWaypoints.push({ ...position });
    }
  }
  if (state.config.runtime.passive === "nailu_memory_bloom") {
    plantBloom(state, position);
  }
  if (state.config.objective.kind === "recover") state.objectiveProgress += 1;
  state.projectiles = state.projectiles.filter(
    (bullet) =>
      distanceSquared(position.x, position.y, bullet.x, bullet.y) > 720 ** 2,
  );
  for (const enemy of state.enemies) {
    if (
      distanceSquared(position.x, position.y, enemy.x, enemy.y) <= 620 ** 2
    ) {
      enemy.health -= Math.max(
        2,
        goDivide(state.config.runtime.attackDamage, 2),
      );
    }
  }
  if (!protocolLocked && state.weave.length === 3) {
    state.protocol = weaveProtocol(state.weave);
    state.protocols += 1;
    onProtocolComplete(state);
    state.routeReady = true;
    state.warpClock = 0;
    state.warpReadyTick = state.tickValue;
    if (state.config.runtime.healOnProtocol > 0) {
      state.health = Math.min(
        state.config.playerMaxHealth,
        state.health + state.config.runtime.healOnProtocol,
      );
    }
  }
};

const activateProtocol = (
  state: SimulationState,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): void => {
  state.score += 250;
  if (state.protocol === "guard_aegis") {
    state.shield += Math.max(8, 12 + state.config.runtime.protocolShield);
    state.projectiles = [];
    state.invulnerable = Math.max(state.invulnerable, 24);
    return;
  }
  if (state.protocol === "resonance") {
    activateResonance(state);
    return;
  }
  const radius = state.protocol === "surge_break" ? 900 : 700;
  const damage =
    state.protocol === "surge_break"
      ? Math.max(
          18,
          state.config.runtime.warpDamage +
            state.config.runtime.protocolDamage,
        )
      : Math.max(
          10,
          goDivide(state.config.runtime.warpDamage, 2) +
            state.config.runtime.echoPower,
        );
  for (const enemy of state.enemies) {
    if (
      nearTravelPath(
        enemy.x,
        enemy.y,
        startX,
        startY,
        goDivide(startX + endX, 2),
        goDivide(startY + endY, 2),
        endX,
        endY,
        radius,
      )
    ) {
      enemy.health -= damage;
    }
  }
};

const activateResonance = (state: SimulationState): void => {
  const power = Math.max(12, 18 + state.config.runtime.resonancePower);
  switch (state.config.runtime.resonance) {
    case "diana_cheer_pulse":
      state.shield += goDivide(power, 2);
      for (const enemy of state.enemies) enemy.health -= power;
      break;
    case "nana_route_chain":
      detonateNanaWaypoints(state, power);
      break;
    case "ava_afterimage":
      empowerLatestAvaReplay(state, power);
      break;
    case "bella_perfect_warp":
      state.shield += power;
      state.invulnerable = Math.max(state.invulnerable, 30);
      break;
    case "lulu_convert_projectiles":
      markAllProjectiles(state);
      break;
    case "xingtong_signal_stance":
      state.enemies.forEach((enemy, index) => {
        enemy.health -= power + (index % 3);
      });
      break;
    case "nailu_memory_bloom":
      state.health = Math.min(
        state.config.playerMaxHealth,
        state.health + goDivide(power, 3),
      );
      plantBloom(state, { x: state.playerX, y: state.playerY });
      break;
    default:
      for (const enemy of state.enemies) enemy.health -= power;
  }
};

export const updateSignalDecay = (state: SimulationState): void => {
  if (
    state.config.hazards.includes("signal_decay") &&
    state.weave.length > 0 &&
    state.tickValue - state.lastSignalTick >= 150
  ) {
    state.weave = state.weave.slice(1);
    if (state.signalWaypoints.length > 0) {
      state.signalWaypoints = state.signalWaypoints.slice(1);
    }
    state.routeStep = state.weave.length;
    state.protocol = "";
    state.routeReady = false;
    state.lastSignalTick = state.tickValue;
  }
};
