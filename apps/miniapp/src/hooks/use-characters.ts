"use client";

import useSWR from "swr";
import type { Character } from "@xuhuan/game-types";

import {
  getCharacters,
  getEncounters,
  type APIEncounter
} from "@/lib/api/client";
import { toPresentationCharacter } from "@/lib/api/presentation";

type UseCharactersResult = {
  readonly characters: readonly Character[];
  readonly isLoading: boolean;
  readonly error: Error | undefined;
  readonly refresh: () => Promise<readonly Character[] | undefined>;
};

export const useCharacters = (): UseCharactersResult => {
  const swr = useSWR("/v1/characters", getCharacters, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000
  });
  return {
    characters: swr.data?.map(toPresentationCharacter) ?? [],
    isLoading: swr.isLoading,
    error: swr.error,
    refresh: async () => {
      const refreshed = await swr.mutate();
      return refreshed?.map(toPresentationCharacter);
    }
  };
};

export const useEncounters = () => {
  const swr = useSWR<readonly APIEncounter[]>("/v1/encounters", getEncounters, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000
  });
  return {
    encounters: swr.data ?? [],
    isLoading: swr.isLoading,
    error: swr.error,
    refresh: swr.mutate
  };
};
