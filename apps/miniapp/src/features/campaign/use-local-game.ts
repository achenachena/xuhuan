"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameLocale } from "@/features/game/game-copy";
import type { RunMode } from "@/features/game/use-game-controller";
import type { ShooterContent, ShooterGameRun, ShooterGameSnapshot, ShooterRunCommandInput, ShooterRunCommandResponse } from "@/lib/api/types";
import { createLocalSession, localContent } from "./local-game";

type State = { content: ShooterContent | null; game: ShooterGameSnapshot | null; loading: boolean; busy: boolean; error: unknown };
export const useLocalGame = (locale: GameLocale) => {
  const [state, setState] = useState<State>({ content: null, game: null, loading: true, busy: false, error: null });
  const [localAction] = useState(createLocalSession);
  const inFlight = useRef(false);
  const sequence = useRef(0);
  const retainRun = (next: ShooterGameRun | null, current: ShooterGameRun | null) => next && current && next.id === current.id && next.version === current.version ? current : next;
  const load = useCallback(async () => {
    const request = ++sequence.current;
    setState(current => ({ ...current, loading: true, error: null }));
    try {
      const [content, response] = await Promise.all([localContent(locale), localAction({ action: "load" }, true)]);
      if (request !== sequence.current) return;
      setState(current => ({ ...current, content, loading: false, game: inFlight.current ? current.game : { ...response.game!, campaign_run: retainRun(response.game!.campaign_run, current.game?.campaign_run ?? null), daily_run: retainRun(response.game!.daily_run, current.game?.daily_run ?? null) } }));
    } catch (error) {
      if (request === sequence.current) setState(current => ({ ...current, loading: false, error }));
    }
  }, [locale, localAction]);
  useEffect(() => {
    void load();
    const requestSequence = sequence;
    return () => { requestSequence.current++; };
  }, [load]);
  const mutate = useCallback(async (request: object, autoStart = false): Promise<ShooterRunCommandResponse | null> => {
    if (inFlight.current) return null;
    inFlight.current = true;
    // Invalidate snapshots read before this operation, but retain localized copy.
    sequence.current++;
    setState(current => ({ ...current, busy: true, error: null }));
    try {
      const response = await localAction(request, autoStart);
      setState(current => ({ ...current, game: response.game!, busy: false, loading: false }));
      return response.result ?? null;
    } catch (error) {
      setState(current => ({ ...current, busy: false, loading: false, error }));
      if (error instanceof Error && error.message === "version_conflict") {
        try {
          const response = await localAction({ action: "load" });
          setState(current => ({ ...current, game: response.game!, error: null }));
        } catch (refreshError) { setState(current => ({ ...current, error: refreshError })); }
      }
      return null;
    } finally { inFlight.current = false; }
  }, [localAction]);
  const startCampaign = useCallback(async (chapter: string, character: string, encore: number, companion?: string) => {
    await mutate({ action: "start", id: crypto.randomUUID(), mode: "campaign", chapter_slug: chapter, character_slug: character, encore_level: encore, companion_slug: companion });
  }, [mutate]);
  const startDaily = useCallback(async () => { await mutate({ action: "start", id: crypto.randomUUID(), mode: "daily" }); }, [mutate]);
  const command = useCallback(async (mode: RunMode, body: ShooterRunCommandInput) => {
    const run = mode === "daily" ? state.game?.daily_run : state.game?.campaign_run;
    if (!run) return null;
    return mutate({ action: "command", mode, id: run.id, expected_version: run.version, command: body });
  }, [state.game, mutate]);
  const returnToHub = useCallback(async () => { await mutate({ action: "hub" }, true); }, [mutate]);
  const clearError = useCallback(() => setState(current => ({ ...current, error: null })), []);
  return { ...state, load, startCampaign, startDaily, command, returnToHub, clearError };
};
