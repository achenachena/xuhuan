"use client";

import useSWR from "swr";
import type { Character } from "@xuhuan/game-types";

import {
  getCharacter,
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

type UseCharacterResult = {
  readonly character: Character | null;
  readonly isLoading: boolean;
  readonly error: Error | undefined;
};

export const useCharacter = (slug: string | null): UseCharacterResult => {
  const swr = useSWR(slug ? ["/v1/characters", slug] : null, () => getCharacter(slug ?? ""), {
    revalidateOnFocus: false
  });
  return {
    character: swr.data ? toPresentationCharacter(swr.data) : null,
    isLoading: swr.isLoading,
    error: swr.error
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
