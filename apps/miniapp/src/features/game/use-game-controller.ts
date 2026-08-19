"use client";

import { useCallback, useEffect, useState } from "react";

import {
  APIError,
  createIdempotencyKey,
  createRun,
  createRunCommand,
  createStoryChoice,
  getGame,
  getGameContent,
  getRun,
  type APIGameContent,
  type APIGameSnapshot,
  type APIRunCommand,
  type APIRunCommandResponse,
} from "@/lib/api/client";
import type { GameLocale } from "@/features/game/game-copy";

type ControllerState = {
  readonly content: APIGameContent | null;
  readonly game: APIGameSnapshot | null;
  readonly loading: boolean;
  readonly busy: boolean;
  readonly error: unknown;
};

const initialState: ControllerState = {
  content: null,
  game: null,
  loading: true,
  busy: false,
  error: null,
};

export const useGameController = (locale: GameLocale) => {
  const [state, setState] = useState<ControllerState>(initialState);

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const [content, game] = await Promise.all([
        getGameContent(locale),
        getGame(),
      ]);
      setState({ content, game, loading: false, busy: false, error: null });
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        busy: false,
        error,
      }));
    }
  }, [locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const startRun = useCallback(
    async (chapterSlug: string, characterSlug: string, noiseLevel: number) => {
      setState((current) => ({ ...current, busy: true, error: null }));
      try {
        const run = await createRun(
          {
            chapter_slug: chapterSlug,
            character_slug: characterSlug,
            noise_level: noiseLevel,
          },
          createIdempotencyKey(),
        );
        setState((current) => ({
          ...current,
          busy: false,
          game: current.game ? { ...current.game, active_run: run } : null,
        }));
      } catch (error) {
        setState((current) => ({ ...current, busy: false, error }));
      }
    },
    [],
  );

  const command = useCallback(
    async (body: Omit<APIRunCommand, "expected_version">) => {
      const currentRun = state.game?.active_run;
      if (!currentRun) {
        return null;
      }
      setState((current) => ({ ...current, busy: true, error: null }));
      try {
        const response = await createRunCommand(
          currentRun.id,
          { ...body, expected_version: currentRun.version },
          createIdempotencyKey(),
        );
        setState((current) => ({
          ...current,
          busy: false,
          game: current.game
            ? { ...current.game, active_run: response.run }
            : null,
        }));
        return response;
      } catch (error) {
        if (error instanceof APIError && error.code === "version_conflict") {
          try {
            const run = await getRun(currentRun.id);
            setState((current) => ({
              ...current,
              busy: false,
              error: null,
              game: current.game ? { ...current.game, active_run: run } : null,
            }));
            return null;
          } catch (refreshError) {
            setState((current) => ({
              ...current,
              busy: false,
              error: refreshError,
            }));
            return null;
          }
        }
        setState((current) => ({ ...current, busy: false, error }));
        return null;
      }
    },
    [state.game?.active_run],
  );

  const chooseStory = useCallback(
    async (sceneSlug: string, optionSlug: string) => {
      const game = state.game;
      if (!game) {
        return;
      }
      setState((current) => ({ ...current, busy: true, error: null }));
      try {
        const response = await createStoryChoice(
          {
            scene_slug: sceneSlug,
            option_slug: optionSlug,
            expected_version: game.progress.version,
          },
          createIdempotencyKey(),
        );
        const tutorialRun =
          sceneSlug === "prologue-last-viewer"
            ? await createRun(
                {
                  chapter_slug: "seventh-dock",
                  character_slug: "nana7mi",
                  noise_level: 0,
                },
                createIdempotencyKey(),
              )
            : null;
        setState((current) => ({
          ...current,
          busy: false,
          game: current.game
            ? {
                ...current.game,
                progress: response.progress,
                pending_scene_slug: response.pending_scene_slug,
                active_run: tutorialRun ?? current.game.active_run,
                onboarding_stage: tutorialRun
                  ? "tutorial"
                  : current.game.onboarding_stage,
              }
            : null,
        }));
      } catch (error) {
        setState((current) => ({ ...current, busy: false, error }));
      }
    },
    [state.game],
  );

  const returnToHub = useCallback(async () => {
    setState((current) => ({ ...current, busy: true, error: null }));
    try {
      const game = await getGame();
      setState((current) => ({ ...current, game, busy: false }));
    } catch (error) {
      setState((current) => ({ ...current, busy: false, error }));
    }
  }, []);

  const clearError = useCallback(() => {
    setState((current) => ({ ...current, error: null }));
  }, []);

  return {
    ...state,
    load,
    startRun,
    command,
    chooseStory,
    returnToHub,
    clearError,
  };
};

export type GameCommand = Parameters<
  ReturnType<typeof useGameController>["command"]
>[0];
export type GameCommandResult = APIRunCommandResponse | null;
