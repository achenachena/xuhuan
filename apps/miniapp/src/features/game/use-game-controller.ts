"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { GameLocale } from "@/features/game/game-copy";
import {
  APIError,
  createIdempotencyKey,
  createRun,
  createRunCommand,
  getGame,
  getGameContent,
  getRun,
} from "@/lib/api/client";
import type {
  ShooterContent,
  ShooterGameRun,
  ShooterGameSnapshot,
  ShooterRunCommand,
  ShooterRunCommandInput,
  ShooterRunCommandResponse,
  ShooterTrace,
} from "@/lib/api/types";
import { validateShooterTrace } from "@/features/shooter/trace";

export type RunMode = "campaign" | "daily";

type ControllerState = {
  readonly content: ShooterContent | null;
  readonly game: ShooterGameSnapshot | null;
  readonly loading: boolean;
  readonly busy: boolean;
  readonly error: unknown;
};

type PendingSegment = {
  readonly runId: string;
  readonly mode: RunMode;
  readonly version: number;
  readonly idempotencyKey: string;
  readonly trace: ShooterTrace;
};

const pendingSegmentStorageKey = "xuhuan.pending-segment.v4";
const idempotencyKeyPattern = /^[A-Za-z0-9._:-]{8,128}$/;

const initialState: ControllerState = {
  content: null,
  game: null,
  loading: true,
  busy: false,
  error: null,
};

const runForMode = (
  game: ShooterGameSnapshot | null,
  mode: RunMode,
): ShooterGameRun | null =>
  mode === "daily" ? (game?.daily_run ?? null) : (game?.campaign_run ?? null);

const withRun = (
  game: ShooterGameSnapshot,
  mode: RunMode,
  run: ShooterGameRun,
): ShooterGameSnapshot =>
  mode === "daily"
    ? { ...game, daily_run: run }
    : { ...game, campaign_run: run };

const parsePendingSegment = (): PendingSegment | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(pendingSegmentStorageKey);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingSegment>;
    if (
      typeof value.runId !== "string" ||
      (value.mode !== "campaign" && value.mode !== "daily") ||
      !Number.isSafeInteger(value.version) ||
      (value.version ?? 0) < 1 ||
      !idempotencyKeyPattern.test(value.idempotencyKey ?? "") ||
      !value.trace ||
      !validateShooterTrace(value.trace)
    ) {
      window.sessionStorage.removeItem(pendingSegmentStorageKey);
      return null;
    }
    return value as PendingSegment;
  } catch {
    window.sessionStorage.removeItem(pendingSegmentStorageKey);
    return null;
  }
};

const savePendingSegment = (pending: PendingSegment): void => {
  window.sessionStorage.setItem(pendingSegmentStorageKey, JSON.stringify(pending));
};

const clearPendingSegment = (): void => {
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(pendingSegmentStorageKey);
  }
};

const replayPendingSegment = async (
  snapshot: ShooterGameSnapshot,
): Promise<ShooterGameSnapshot> => {
  const pending = parsePendingSegment();
  if (!pending) return snapshot;
  const run = runForMode(snapshot, pending.mode);
  if (
    !run ||
    run.id !== pending.runId ||
    run.version !== pending.version ||
    run.status !== "active" ||
    run.state.phase !== "segment"
  ) {
    clearPendingSegment();
    return snapshot;
  }
  try {
    const response = await createRunCommand(
      pending.runId,
      {
        type: "complete_segment",
        expected_version: pending.version,
        trace: pending.trace,
      },
      pending.idempotencyKey,
    );
    clearPendingSegment();
    return withRun(snapshot, pending.mode, response.run);
  } catch {
    return snapshot;
  }
};

export const useGameController = (locale: GameLocale) => {
  const [state, setState] = useState<ControllerState>(initialState);
  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const [content, rawGame] = await Promise.all([
        getGameContent(locale),
        getGame(locale),
      ]);
      const game = await replayPendingSegment(rawGame);
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
    async (
      chapterSlug: string,
      characterSlug: string,
      encoreLevel: number,
      companionSlug?: string,
    ) => {
      setState((current) => ({ ...current, busy: true, error: null }));
      try {
        const run = await createRun(
          {
            mode: "campaign",
            chapter_slug: chapterSlug,
            character_slug: characterSlug,
            encore_level: encoreLevel,
            ...(companionSlug ? { companion_slug: companionSlug } : {}),
          },
          createIdempotencyKey(),
        );
        setState((current) => ({
          ...current,
          busy: false,
          game: current.game ? withRun(current.game, "campaign", run) : null,
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
      const run = await createRun({ mode: "daily" }, createIdempotencyKey());
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
      body: ShooterRunCommandInput,
    ): Promise<ShooterRunCommandResponse | null> => {
      const currentRun = runForMode(state.game, mode);
      if (!currentRun) return null;
      setState((current) => ({ ...current, busy: true, error: null }));
      let idempotencyKey = createIdempotencyKey();
      let fullBody = {
        ...body,
        expected_version: currentRun.version,
      } as ShooterRunCommand;

      if (body.type === "complete_segment") {
        const pending = parsePendingSegment();
        if (
          pending?.runId === currentRun.id &&
          pending.mode === mode &&
          pending.version === currentRun.version
        ) {
          idempotencyKey = pending.idempotencyKey;
          fullBody = {
            type: "complete_segment",
            expected_version: pending.version,
            trace: pending.trace,
          };
        } else {
          savePendingSegment({
            runId: currentRun.id,
            mode,
            version: currentRun.version,
            idempotencyKey,
            trace: body.trace,
          });
        }
      }

      try {
        const response = await createRunCommand(
          currentRun.id,
          fullBody,
          idempotencyKey,
        );
        if (body.type === "complete_segment") clearPendingSegment();
        setState((current) => ({
          ...current,
          busy: false,
          game: current.game ? withRun(current.game, mode, response.run) : null,
        }));
        return response;
      } catch (error) {
        if (body.type === "complete_segment") {
          try {
            const synchronized = await getGame(locale);
            const synchronizedRun = runForMode(synchronized, mode);
            const advanced =
              synchronizedRun?.id === currentRun.id &&
              (synchronizedRun.version > currentRun.version ||
                synchronizedRun.state.phase !== "segment");
            if (advanced) {
              clearPendingSegment();
              setState((current) => ({
                ...current,
                busy: false,
                error: null,
                game: current.game ? synchronized : null,
              }));
              return { run: synchronizedRun, events: [] };
            }
          } catch {
            // Keep the original failure and exact pending trace for an explicit retry.
          }
        }
        if (error instanceof APIError && error.code === "version_conflict") {
          try {
            const run = await getRun(currentRun.id);
            clearPendingSegment();
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

  return {
    ...state,
    load,
    startCampaign,
    startDaily,
    command,
    returnToHub,
    clearError,
  };
};
