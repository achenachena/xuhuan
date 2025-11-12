import { useState, useEffect } from "react";
import type { Character } from "@xuhuan/game-types";

// Use production URL directly for now since env vars aren't loading properly
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:3001"
    : "https://xuhuanbackend-production.up.railway.app");

// Debug: Log the API URL
if (typeof window !== "undefined") {
  console.log("API_BASE_URL:", API_BASE_URL);
}

type UseCharactersResult = {
  readonly characters: readonly Character[];
  readonly isLoading: boolean;
  readonly error: Error | null;
};

export const useCharacters = (): UseCharactersResult => {
  const [characters, setCharacters] = useState<readonly Character[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchCharacters = async (): Promise<void> => {
      try {
        setIsLoading(true);
        const response = await fetch(`${API_BASE_URL}/characters`);

        if (!response.ok) {
          throw new Error(`Failed to fetch characters: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.success && Array.isArray(data.characters)) {
          setCharacters(data.characters);
        } else {
          throw new Error("Invalid response format from characters API");
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Unknown error occurred"));
      } finally {
        setIsLoading(false);
      }
    };

    void fetchCharacters();
  }, []);

  return { characters, isLoading, error };
};

type UseCharacterResult = {
  readonly character: Character | null;
  readonly isLoading: boolean;
  readonly error: Error | null;
};

export const useCharacter = (slug: string | null): UseCharacterResult => {
  const [character, setCharacter] = useState<Character | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!slug) {
      setCharacter(null);
      setIsLoading(false);
      return;
    }

    const fetchCharacter = async (): Promise<void> => {
      try {
        setIsLoading(true);
        const response = await fetch(`${API_BASE_URL}/characters/${slug}`);

        if (!response.ok) {
          throw new Error(`Failed to fetch character: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.success && data.character) {
          setCharacter(data.character);
        } else {
          throw new Error("Invalid response format from character API");
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Unknown error occurred"));
      } finally {
        setIsLoading(false);
      }
    };

    void fetchCharacter();
  }, [slug]);

  return { character, isLoading, error };
};
