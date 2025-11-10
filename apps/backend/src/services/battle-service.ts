import crypto from "node:crypto";
import { BattleOutcome, RunStatus } from "@prisma/client";
import type { Encounter } from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { getOrCreatePlayer, applyPlayerProgress } from "./player-service.js";

type StartBattleInput = {
  readonly telegramId: number;
  readonly username?: string;
  readonly encounterSlug: string;
  readonly seed?: string;
};

type EncounterSnapshot = Pick<
  Encounter,
  "slug" | "name" | "level" | "maxHealth" | "attack" | "defense" | "speed" | "critRate" | "critDamage"
>;

export type BattleStartPayload = {
  readonly runId: string;
  readonly seed: string;
  readonly encounter: EncounterSnapshot;
};

type CompleteBattleInput = {
  readonly telegramId: number;
  readonly username?: string;
  readonly runId: string;
  readonly outcome: BattleOutcome;
  readonly rewards: {
    readonly experience: number;
    readonly credits: number;
  };
  readonly log: unknown;
};

export type BattleResolvePayload = {
  readonly runId: string;
  readonly outcome: BattleOutcome;
  readonly rewards: {
    readonly experience: number;
    readonly credits: number;
  };
};

const createSeed = (): string => {
  return crypto.randomUUID();
};

const selectEncounter = async (slug: string): Promise<EncounterSnapshot & { readonly id: string }> => {
  const encounter = await prisma.encounter.findUnique({
    where: { slug }
  });
  if (!encounter) {
    throw new Error(`Encounter ${slug} not found`);
  }
  const snapshot: EncounterSnapshot & { readonly id: string } = {
    id: encounter.id,
    slug: encounter.slug,
    name: encounter.name,
    level: encounter.level,
    maxHealth: encounter.maxHealth,
    attack: encounter.attack,
    defense: encounter.defense,
    speed: encounter.speed,
    critRate: encounter.critRate,
    critDamage: encounter.critDamage
  };
  return snapshot;
};

export const startBattle = async (input: StartBattleInput): Promise<BattleStartPayload> => {
  const { telegramId, username, encounterSlug } = input;
  const encounter = await selectEncounter(encounterSlug);
  const player = await getOrCreatePlayer({ telegramId, username });
  const seed = input.seed ?? createSeed();

  const run = await prisma.run.create({
    data: {
      playerId: player.id,
      encounterId: encounter.id,
      seed,
      status: RunStatus.ACTIVE
    }
  });

  return {
    runId: run.id,
    seed,
    encounter
  };
};

export const resolveBattle = async (input: CompleteBattleInput): Promise<BattleResolvePayload> => {
  const { telegramId, username, runId, outcome, rewards, log } = input;
  const player = await getOrCreatePlayer({ telegramId, username });

  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: {
      player: true
    }
  });

  if (!run || run.playerId !== player.id) {
    throw new Error("Battle run not found for player");
  }

  if (run.status !== "ACTIVE") {
    throw new Error("Battle already resolved");
  }

  await prisma.run.update({
    where: { id: runId },
    data: {
      status: RunStatus.COMPLETED,
      outcome,
      rewardExperience: rewards.experience,
      rewardCredits: rewards.credits,
      log: log ?? undefined,
      completedAt: new Date()
    }
  });

  await applyPlayerProgress({
    telegramId,
    username,
    experienceDelta: rewards.experience,
    creditsDelta: rewards.credits
  });

  return {
    runId,
    outcome,
    rewards
  };
};

