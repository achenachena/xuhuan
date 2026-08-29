import { distanceSquared } from "@/features/action/action-math";
import type { SimulationState } from "@/features/action/action-simulation-state";
import type { ActionObjectiveSnapshot } from "@/features/action/action-types";
import {
  ACTION_HEIGHT,
  ACTION_TPS,
  ACTION_WIDTH,
} from "@/features/action/action-types";

export const objectiveProgressRatio = (
  objective: ActionObjectiveSnapshot,
): number => {
  if (objective.target <= 0) return 0;
  return Math.max(0, Math.min(1, objective.progress / objective.target));
};

export const isBossEncounter = (state: SimulationState): boolean =>
  state.config.kind === "boss" || state.config.objective.kind === "boss";

export const updateObjective = (state: SimulationState): void => {
  switch (state.config.objective.kind) {
    case "purge":
      state.objectiveProgress = state.kills;
      break;
    case "stabilize":
      if (
        state.tickValue % ACTION_TPS === 0 &&
        distanceSquared(
          state.playerX,
          state.playerY,
          ACTION_WIDTH / 2,
          ACTION_HEIGHT / 2,
        ) <=
          820 ** 2
      ) {
        state.objectiveProgress += 1;
      }
      break;
    case "holdout":
      state.objectiveProgress = state.tickValue;
      break;
    case "elite":
      state.objectiveProgress = state.eliteKills;
      break;
    case "boss":
      if (state.spawnIndex > 0 && state.enemies.length === 0) {
        state.objectiveProgress = state.config.objective.target;
      }
      break;
  }
  if (
    state.config.objective.kind !== "holdout" &&
    state.tickValue >= state.config.durationTicks &&
    state.objectiveProgress < state.config.objective.target
  ) {
    state.score = Math.max(0, state.score - 1);
  }
};

export const objectiveComplete = (state: SimulationState): boolean => {
  if (state.config.kind === "tutorial") return state.routeWarpUsed;
  if (state.config.objective.target <= 0) {
    return state.tickValue >= state.config.durationTicks;
  }
  return state.objectiveProgress >= state.config.objective.target;
};
