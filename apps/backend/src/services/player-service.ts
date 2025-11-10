import type { Player } from "@prisma/client";

import { prisma } from "../lib/prisma.js";

type PlayerContext = {
  readonly telegramId: number;
  readonly username?: string;
};

type ProgressUpdate = PlayerContext & {
  readonly experienceDelta?: number;
  readonly creditsDelta?: number;
  readonly energyDelta?: number;
  readonly level?: number;
};

const PLAYER_ENERGY_MIN = 0;
const PLAYER_ENERGY_MAX = 180;

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

const resolvePlayerId = (telegramId: number): string => {
  return telegramId.toString();
};

export const getOrCreatePlayer = async (context: PlayerContext): Promise<Player> => {
  const { telegramId, username } = context;
  const playerId = resolvePlayerId(telegramId);
  const fallbackUsername = username ?? `Operative-${telegramId}`;
  const player = await prisma.player.upsert({
    where: { id: playerId },
    create: {
      id: playerId,
      username: fallbackUsername
    },
    update: {
      username: username ?? fallbackUsername
    }
  });
  return player;
};

export const applyPlayerProgress = async (context: ProgressUpdate): Promise<Player> => {
  const { telegramId, username } = context;
  const player = await getOrCreatePlayer({ telegramId, username });

  const experienceDelta = context.experienceDelta ?? 0;
  const creditsDelta = context.creditsDelta ?? 0;
  const energyDelta = context.energyDelta ?? 0;

  const updatedPlayer = await prisma.player.update({
    where: { id: player.id },
    data: {
      experience: player.experience + experienceDelta,
      credits: player.credits + creditsDelta,
      energy: clamp(player.energy + energyDelta, PLAYER_ENERGY_MIN, PLAYER_ENERGY_MAX),
      level: context.level ?? player.level
    }
  });

  return updatedPlayer;
};

