"use client";

import useSWR from "swr";
import useSWRMutation from "swr/mutation";

import {
  createBattle,
  createBattleAction,
  getBattle,
  getPlayer,
  type APIActionKind,
  type APIBattle,
  type APIBattleActionResponse,
  type APIPlayer
} from "@/lib/api/client";

export const usePlayerProfile = () => {
  const swr = useSWR<APIPlayer>("/v1/player", getPlayer, {
    revalidateOnFocus: false,
    shouldRetryOnError: false
  });
  return {
    player: swr.data,
    isLoading: swr.isLoading,
    error: swr.error,
    mutatePlayer: swr.mutate
  };
};

type StartBattleArgument = {
  readonly characterSlug: string;
  readonly encounterSlug: string;
  readonly idempotencyKey: string;
};

export const useStartBattle = () => {
  const mutation = useSWRMutation<APIBattle, Error, string, StartBattleArgument>(
    "/v1/battles",
    (_key, { arg }) =>
      createBattle(
        { character_slug: arg.characterSlug, encounter_slug: arg.encounterSlug },
        arg.idempotencyKey
      )
  );
  return {
    startBattle: mutation.trigger,
    isMutating: mutation.isMutating,
    error: mutation.error,
    reset: mutation.reset
  };
};

type BattleActionArgument = {
  readonly battleId: string;
  readonly action: APIActionKind;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
};

export const useBattleAction = () => {
  const mutation = useSWRMutation<APIBattleActionResponse, Error, string, BattleActionArgument>(
    "/v1/battle-action",
    (_key, { arg }) =>
      createBattleAction(
        arg.battleId,
        { action: arg.action, expected_version: arg.expectedVersion },
        arg.idempotencyKey
      )
  );
  return {
    submitAction: mutation.trigger,
    isMutating: mutation.isMutating,
    error: mutation.error,
    reset: mutation.reset
  };
};

export const useAuthoritativeBattle = (battleId: string | null) => {
  const swr = useSWR<APIBattle>(
    battleId ? ["/v1/battles", battleId] : null,
    () => getBattle(battleId ?? ""),
    {
      revalidateOnFocus: false,
      revalidateOnMount: false,
      shouldRetryOnError: false
    }
  );
  return {
    battle: swr.data,
    error: swr.error,
    refreshBattle: swr.mutate
  };
};
