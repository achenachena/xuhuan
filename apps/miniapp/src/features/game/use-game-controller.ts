"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { GameLocale } from "@/features/game/game-copy";
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
  type APIGameRun,
  type APIGameSnapshot,
  type APIRunCommand,
  type APIRunCommandResponse,
} from "@/lib/api/client";

export type RunMode = "campaign" | "daily";

type ControllerState = {
  readonly content: APIGameContent | null;
  readonly game: APIGameSnapshot | null;
  readonly loading: boolean;
  readonly busy: boolean;
  readonly error: unknown;
};

type PendingEncounterCommand = {
  readonly runId: string;
  readonly mode: RunMode;
  readonly version: number;
  readonly idempotencyKey: string;
  readonly body: APIRunCommand;
};

const pendingTraceStorageKey = "xuhuan.pending-encounter.v3";
const pendingPrologueStorageKey = "xuhuan.pending-prologue.v3";
const pendingTutorialRunStorageKey = "xuhuan.pending-tutorial-run.v3";
const idempotencyKeyPattern = /^[A-Za-z0-9._:-]{8,128}$/;

type PendingPrologueChoice = {
  readonly idempotencyKey: string;
  readonly optionSlug: string;
  readonly expectedVersion: number;
};

const initialState: ControllerState = {
  content: null,
  game: null,
  loading: true,
  busy: false,
  error: null,
};

const runForMode = (
  game: APIGameSnapshot | null,
  mode: RunMode,
): APIGameRun | null =>
  mode === "daily" ? (game?.daily_run ?? null) : (game?.campaign_run ?? null);

const withRun = (
  game: APIGameSnapshot,
  mode: RunMode,
  run: APIGameRun,
): APIGameSnapshot =>
  mode === "daily"
    ? { ...game, daily_run: run }
    : { ...game, campaign_run: run };

const loadPendingEncounter = (): PendingEncounterCommand | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(pendingTraceStorageKey);
    if (!raw) return null;
    const pending = JSON.parse(raw) as Partial<PendingEncounterCommand>;
    const body = pending.body as
      | (Partial<APIRunCommand> & {
          trace?: {
            encoding?: unknown;
            ticks?: unknown;
            data?: unknown;
          };
        })
      | undefined;
    const valid =
      typeof pending.runId === "string" &&
      pending.runId.length > 0 &&
      (pending.mode === "campaign" || pending.mode === "daily") &&
      Number.isSafeInteger(pending.version) &&
      (pending.version ?? 0) > 0 &&
      typeof pending.idempotencyKey === "string" &&
      pending.idempotencyKey.length >= 8 &&
      body?.type === "complete_encounter" &&
      body.expected_version === pending.version &&
      body.trace?.encoding === "rle8-v1" &&
      Number.isSafeInteger(body.trace.ticks) &&
      Number(body.trace.ticks) > 0 &&
      Number(body.trace.ticks) <= 2700 &&
      typeof body.trace.data === "string" &&
      body.trace.data.length > 0;
    if (!valid) {
      window.sessionStorage.removeItem(pendingTraceStorageKey);
      return null;
    }
    return {
      runId: pending.runId!,
      mode: pending.mode!,
      version: pending.version!,
      idempotencyKey: pending.idempotencyKey!,
      body: {
        type: "complete_encounter",
        expected_version: body.expected_version!,
        trace: {
          encoding: "rle8-v1",
          ticks: Number(body.trace!.ticks),
          data: body.trace!.data as string,
        },
      },
    };
  } catch {
    window.sessionStorage.removeItem(pendingTraceStorageKey);
    return null;
  }
};

const savePendingEncounter = (pending: PendingEncounterCommand): void => {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(pendingTraceStorageKey, JSON.stringify(pending));
};

const clearPendingEncounter = (): void => {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(pendingTraceStorageKey);
};

const storedIdempotencyKey = (storageKey: string): string => {
  const existing = window.sessionStorage.getItem(storageKey);
  if (existing && idempotencyKeyPattern.test(existing)) return existing;
  const created = createIdempotencyKey();
  window.sessionStorage.setItem(storageKey, created);
  return created;
};

const loadPendingPrologue = (): PendingPrologueChoice | null => {
  try {
    const raw = window.sessionStorage.getItem(pendingPrologueStorageKey);
    if (!raw) return null;
    const pending = JSON.parse(raw) as Partial<PendingPrologueChoice>;
    if (
      !idempotencyKeyPattern.test(pending.idempotencyKey ?? "") ||
      typeof pending.optionSlug !== "string" ||
      !Number.isSafeInteger(pending.expectedVersion) ||
      (pending.expectedVersion ?? 0) < 1
    ) {
      window.sessionStorage.removeItem(pendingPrologueStorageKey);
      return null;
    }
    return pending as PendingPrologueChoice;
  } catch {
    window.sessionStorage.removeItem(pendingPrologueStorageKey);
    return null;
  }
};

const pendingPrologue = (
  optionSlug: string,
  expectedVersion: number,
): PendingPrologueChoice => {
  const existing = loadPendingPrologue();
  if (
    existing?.optionSlug === optionSlug &&
    existing.expectedVersion === expectedVersion
  ) {
    return existing;
  }
  const created = {
    idempotencyKey: createIdempotencyKey(),
    optionSlug,
    expectedVersion,
  };
  window.sessionStorage.setItem(
    pendingPrologueStorageKey,
    JSON.stringify(created),
  );
  return created;
};

const ensureTutorialRun = async (
  game: APIGameSnapshot,
): Promise<APIGameSnapshot> => {
  if (
    game.onboarding_stage !== "tutorial" ||
    game.pending_scene_slug !== null ||
    game.campaign_run !== null
  ) {
    return game;
  }
  const run = await createRun(
    {
      mode: "campaign",
      chapter_slug: "seventh-dock",
      character_slug: "nana7mi",
      noise_level: 0,
    },
    storedIdempotencyKey(pendingTutorialRunStorageKey),
  );
  window.sessionStorage.removeItem(pendingTutorialRunStorageKey);
  window.sessionStorage.removeItem(pendingPrologueStorageKey);
  return { ...game, campaign_run: run, onboarding_stage: "tutorial" };
};

const replayPendingEncounter = async (
  game: APIGameSnapshot,
): Promise<APIGameSnapshot> => {
  const pending = loadPendingEncounter();
  if (!pending) return game;
  const run = runForMode(game, pending.mode);
  if (
    !run ||
    run.id !== pending.runId ||
    run.version !== pending.version ||
    run.status !== "active" ||
    run.state.phase !== "encounter"
  ) {
    clearPendingEncounter();
    return game;
  }
  try {
    const response = await createRunCommand(
      pending.runId,
      pending.body,
      pending.idempotencyKey,
    );
    clearPendingEncounter();
    return withRun(game, pending.mode, response.run);
  } catch {
    return game;
  }
};

export const useGameController = (locale: GameLocale) => {
  const [state, setState] = useState<ControllerState>(initialState);
  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const [content, snapshot] = await Promise.all([
        getGameContent(locale),
        getGame(locale),
      ]);
      const game = await ensureTutorialRun(
        await replayPendingEncounter(snapshot),
      );
      if (sequence !== loadSequence.current) return;
      setState({ content, game, loading: false, busy: false, error: null });
    } catch (error) {
      if (sequence !== loadSequence.current) return;
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
    return () => {
      loadSequence.current += 1;
    };
  }, [load]);

  const startCampaign = useCallback(
    async (chapterSlug: string, characterSlug: string, noiseLevel: number) => {
      setState((current) => ({ ...current, busy: true, error: null }));
      try {
        const run = await createRun(
          {
            mode: "campaign",
            chapter_slug: chapterSlug,
            character_slug: characterSlug,
            noise_level: noiseLevel,
          },
          createIdempotencyKey(),
        );
        setState((current) => ({
          ...current,
          busy: false,
          game: current.game
            ? withRun(current.game, "campaign", run)
            : null,
        }));
      } catch (error) {
        setState((current) => ({ ...current, busy: false, error }));
      }
    },
    [],
  );

  const startDaily = useCallback(async () => {
    setState((current) => ({ ...current, busy: true, error: null }));
    try {
      const run = await createRun(
        { mode: "daily" },
        createIdempotencyKey(),
      );
      setState((current) => ({
        ...current,
        busy: false,
        game: current.game ? withRun(current.game, "daily", run) : null,
      }));
    } catch (error) {
      setState((current) => ({ ...current, busy: false, error }));
    }
  }, []);

  const command = useCallback(
    async (
      mode: RunMode,
      body: Omit<APIRunCommand, "expected_version">,
    ) => {
      const currentRun = runForMode(state.game, mode);
      if (!currentRun) return null;
      setState((current) => ({ ...current, busy: true, error: null }));
      let fullBody: APIRunCommand = {
        ...body,
        expected_version: currentRun.version,
      };
      let idempotencyKey = createIdempotencyKey();
      if (body.type === "complete_encounter") {
        const pending = loadPendingEncounter();
        if (
          pending?.runId === currentRun.id &&
          pending.mode === mode &&
          pending.version === currentRun.version &&
          pending.body.type === "complete_encounter"
        ) {
          // A completed room is immutable. Every retry must replay the exact
          // same trace under the same idempotency key, even if the UI attempts
          // to submit a newly simulated result after a transient failure.
          fullBody = pending.body;
          idempotencyKey = pending.idempotencyKey;
        } else {
          savePendingEncounter({
            runId: currentRun.id,
            mode,
            version: currentRun.version,
            idempotencyKey,
            body: fullBody,
          });
        }
      }
      try {
        const response = await createRunCommand(
          currentRun.id,
          fullBody,
          idempotencyKey,
        );
        if (body.type === "complete_encounter") clearPendingEncounter();
        const storyBecamePending = response.events.some(
          (event) => event.kind === "story_scene_ready",
        );
        let synchronizedGame: APIGameSnapshot | null = null;
        if (storyBecamePending) {
          try {
            synchronizedGame = await getGame(locale);
          } catch (refreshError) {
            setState((current) => ({
              ...current,
              busy: false,
              game: null,
              error: refreshError,
            }));
            return response;
          }
        }
        setState((current) => ({
          ...current,
          busy: false,
          game:
            synchronizedGame ??
            (current.game
              ? withRun(current.game, mode, response.run)
              : null),
        }));
        return response;
      } catch (error) {
        if (body.type === "complete_encounter") {
          try {
            // The server may have committed an idempotent command after the
            // WebView timed out or lost the response. Re-read the whole game
            // projection before showing an error so an accepted room never
            // strands the player behind a false retry dialog.
            const synchronized = await getGame(locale);
            const synchronizedRun = runForMode(synchronized, mode);
            const advanced =
              synchronizedRun?.id === currentRun.id &&
              (synchronizedRun.version > currentRun.version ||
                synchronizedRun.state.phase !== "encounter");
            if (advanced) {
              clearPendingEncounter();
              setState((current) => ({
                ...current,
                busy: false,
                error: null,
                game: current.game ? synchronized : null,
              }));
              return { run: synchronizedRun, events: [] };
            }
          } catch {
            // Preserve the original command error. It is more useful than a
            // secondary synchronization failure and the exact trace remains
            // available for an explicit retry.
          }
        }
        if (error instanceof APIError && error.code === "version_conflict") {
          try {
            const run = await getRun(currentRun.id);
            clearPendingEncounter();
            setState((current) => ({
              ...current,
              busy: false,
              error: null,
              game: current.game ? withRun(current.game, mode, run) : null,
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
    [locale, state.game],
  );

  const chooseStory = useCallback(
    async (sceneSlug: string, optionSlug: string) => {
      const game = state.game;
      if (!game) return;
      setState((current) => ({ ...current, busy: true, error: null }));
      const isPrologue = sceneSlug === "prologue-last-viewer";
      const prologue = isPrologue
        ? pendingPrologue(optionSlug, game.progress.version)
        : null;
      try {
        const response = await createStoryChoice(
          {
            scene_slug: sceneSlug,
            option_slug: optionSlug,
            expected_version: game.progress.version,
          },
          prologue?.idempotencyKey ?? createIdempotencyKey(),
        );
        let nextGame: APIGameSnapshot = {
          ...game,
          progress: response.progress,
          pending_scene_slug: response.pending_scene_slug,
          onboarding_stage: isPrologue ? "tutorial" : game.onboarding_stage,
        };
        if (isPrologue) nextGame = await ensureTutorialRun(nextGame);
        setState((current) => ({
          ...current,
          busy: false,
          game: current.game ? nextGame : null,
        }));
      } catch (error) {
        if (isPrologue) {
          try {
            const synchronized = await getGame(locale);
            if (synchronized.pending_scene_slug !== sceneSlug) {
              const recovered = await ensureTutorialRun(synchronized);
              window.sessionStorage.removeItem(pendingPrologueStorageKey);
              setState((current) => ({
                ...current,
                busy: false,
                error: null,
                game: current.game ? recovered : null,
              }));
              return;
            }
          } catch (recoveryError) {
            setState((current) => ({
              ...current,
              busy: false,
              error: recoveryError,
            }));
            return;
          }
        }
        setState((current) => ({ ...current, busy: false, error }));
      }
    },
    [locale, state.game],
  );

  const returnToHub = useCallback(async () => {
    setState((current) => ({ ...current, busy: true, error: null }));
    try {
      const game = await getGame(locale);
      setState((current) => ({ ...current, game, busy: false }));
    } catch (error) {
      setState((current) => ({ ...current, busy: false, error }));
    }
  }, [locale]);

  const clearError = useCallback(() => {
    setState((current) => ({ ...current, error: null }));
  }, []);

  const restartEncounter = useCallback(() => {
    clearPendingEncounter();
    setState((current) => ({ ...current, busy: false, error: null }));
  }, []);

  return {
    ...state,
    load,
    startCampaign,
    startDaily,
    command,
    chooseStory,
    returnToHub,
    clearError,
    restartEncounter,
  };
};

export type GameCommand = Parameters<
  ReturnType<typeof useGameController>["command"]
>[1];
export type GameCommandResult = APIRunCommandResponse | null;
