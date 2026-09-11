"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { useAudio } from "@/components/providers/audio-provider";
import useLocale from "@/components/providers/use-locale";
import { gameText, type GameCopyKey } from "@/features/game/game-copy";
import {
  PLAYER_MAX_X,
  PLAYER_MIN_X,
  SHOOTER_TPS,
} from "@/features/shooter/constants";
import {
  beginShooterPointer,
  endShooterPointer,
  initialShooterControl,
  moveShooterPointer,
  sampleShooterInput,
  type ShooterControl,
} from "@/features/shooter/input";
import {
  drawShooterArena,
  observeShooterCanvas,
  preloadShooterVisuals,
  resolveShooterVisualSources,
  type ShooterEnemyImpact,
  type ShooterVisuals,
} from "@/features/shooter/renderer";
import {
  createShooterRuntime,
  createShooterSimulation,
} from "@/features/shooter/simulation";
import { ShooterHUD } from "@/features/shooter/shooter-hud";
import type { ShooterSnapshot } from "@/features/shooter/types";
import type { ShooterResult } from "@/features/shooter/types";
import { enterTelegramCombatMode } from "@/lib/telegram-combat-mode";
import { playTelegramHaptic } from "@/lib/telegram-haptics";
import type { ShooterContent, ShooterGameRun } from "@/lib/api/types";

type Props = {
  readonly content: ShooterContent;
  readonly run: ShooterGameRun;
  readonly busy: boolean;
  readonly embedded?: boolean;
  readonly opening?: string;
  readonly musicProgress?: number;
  readonly onComplete: (result: ShooterResult) => Promise<boolean>;
};

export const shooterTutorialKey = (
  startingRescueCharge: number,
  snapshot: ShooterSnapshot,
  started: boolean,
  distance: number,
  rescueUsed: boolean,
): GameCopyKey | null => {
  if (startingRescueCharge <= 0 || snapshot.tick >= 900 || rescueUsed) {
    return null;
  }
  if (!started) return "tutorialHold";
  if (distance < 420) return "tutorialFollow";
  if (snapshot.tick < 330) return "tutorialAutoFire";
  if (snapshot.rescue_charge < 100) return "tutorialPickup";
  return "tutorialRescue";
};

export const ShooterArena = ({ content, run, busy, embedded = false, opening, musicProgress = 0, onComplete }: Props) => {
  const { language } = useLocale();
  const audio = useAudio();
  const setMusicActive = audio.setMusicActive;
  const setDemoMusicProgress = audio.setDemoMusicProgress;
  const segment = run.state.segment;
  if (!segment) throw new Error("Shooter segment state is missing");
  const runtime = useMemo(
    () => createShooterRuntime(segment.runtime_config),
    [segment.runtime_config],
  );
  const sources = useMemo(
    () => resolveShooterVisualSources(content, run),
    [content, run],
  );
  const sourcesRef = useRef(sources);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const maximumMove = PLAYER_MAX_X - (PLAYER_MIN_X + PLAYER_MAX_X) / 2;
  const moveLimit =
    runtime.config.kit.move_limit > 0 &&
    runtime.config.kit.move_limit <= maximumMove
      ? runtime.config.kit.move_limit
      : maximumMove;
  const controlRef = useRef<ShooterControl>(
    initialShooterControl(
      (PLAYER_MIN_X + PLAYER_MAX_X) / 2,
      (PLAYER_MIN_X + PLAYER_MAX_X) / 2 - moveLimit,
      (PLAYER_MIN_X + PLAYER_MAX_X) / 2 + moveLimit,
    ),
  );
  const visualsRef = useRef<ShooterVisuals>(new Map());
  const assetsReadyRef = useRef(false);
  const completeRef = useRef(onComplete);
  const audioRef = useRef(audio);
  const languageRef = useRef(language);
  const openingRef = useRef(opening);
  const rescueQueuedRef = useRef(false);
  const pointerStartedRef = useRef(false);
  const movementDistanceRef = useRef(0);
  const rescueUsedRef = useRef(false);
  const enemyImpactsRef = useRef(new Map<number, ShooterEnemyImpact>());
  const keysRef = useRef(new Set<string>());
  const submittingRef = useRef(false);
  const pausedRef = useRef(false);
  const pendingResultRef = useRef<ShooterResult | null>(null);
  const mountedRef = useRef(true);
  const [hudSnapshot, setHudSnapshot] = useState<ShooterSnapshot | null>(() =>
    createShooterSimulation(runtime).snapshot(),
  );
  const [submitting, setSubmitting] = useState(false);
  const [settling, setSettling] = useState(false);
  const [submissionFailed, setSubmissionFailed] = useState(false);
  const [assetState, setAssetState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => { sourcesRef.current = sources; }, [sources]);

  useEffect(() => {
    completeRef.current = onComplete;
  }, [onComplete]);
  useEffect(() => {
    audioRef.current = audio;
  }, [audio]);
  useEffect(() => {
    languageRef.current = language;
  }, [language]);
  useEffect(() => {
    openingRef.current = opening;
  }, [opening]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => observeShooterCanvas(canvasRef.current), []);
  useEffect(() => (embedded ? undefined : enterTelegramCombatMode()), [embedded]);
  useEffect(() => {
    setDemoMusicProgress(sources.reversal ? musicProgress : null);
    setMusicActive(true);
    return () => {
      setMusicActive(false);
      setDemoMusicProgress(null);
    };
  }, [musicProgress, setDemoMusicProgress, setMusicActive, sources.reversal]);

  useEffect(() => {
    if (!embedded) return;
    const activeKeys = keysRef.current;
    const keyDown = (event: KeyboardEvent) => {
      if (["ArrowLeft", "ArrowRight", "KeyA", "KeyD", "Space"].includes(event.code)) {
        event.preventDefault();
        activeKeys.add(event.code);
        if (event.code === "Space") rescueQueuedRef.current = true;
      }
    };
    const keyUp = (event: KeyboardEvent) => activeKeys.delete(event.code);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      activeKeys.clear();
    };
  }, [embedded]);

  useEffect(() => {
    let active = true;
    void preloadShooterVisuals(sources).then((visuals) => {
      if (!active) return;
      visualsRef.current = visuals;
      const required = [sources.background, sources.player, ...Object.values(sources.enemies), ...(sources.boss ? [sources.boss] : [])];
      const ready = required.every((url) => visuals.has(url));
      assetsReadyRef.current = ready;
      setAssetState(ready ? "ready" : "error");
    }).catch(() => {
      if (active) setAssetState("error");
    });
    return () => {
      active = false;
    };
  }, [sources]);

  useEffect(() => {
    const pause = () => {
      pausedRef.current = true;
      controlRef.current = { ...controlRef.current, pointer: null };
      keysRef.current.clear();
      rescueQueuedRef.current = false;
      if (surfaceRef.current) surfaceRef.current.dataset.pointerActive = "false";
    };
    const resume = () => {
      pausedRef.current = document.hidden;
    };
    const visibility = () => {
      if (document.hidden) pause();
      else resume();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("xuhuan:deactivated", pause);
    window.addEventListener("xuhuan:activated", resume);
    window.addEventListener("blur", pause);
    window.addEventListener("focus", resume);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("xuhuan:deactivated", pause);
      window.removeEventListener("xuhuan:activated", resume);
      window.removeEventListener("blur", pause);
      window.removeEventListener("focus", resume);
    };
  }, []);

  const submitResult = useCallback(async (result: ShooterResult) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    pendingResultRef.current = result;
    setSubmitting(true);
    setSubmissionFailed(false);
    let accepted = false;
    try {
      accepted = await completeRef.current(result);
    } catch {
      // Keep the completed result available even when an adapter rejects.
    } finally {
      submittingRef.current = false;
    }
    if (!mountedRef.current || accepted) return;
    setSubmitting(false);
    setSubmissionFailed(true);
  }, []);

  const retry = useCallback(() => {
    const result = pendingResultRef.current;
    if (result) void submitResult(result);
  }, [submitResult]);

  useEffect(() => {
    const simulation = createShooterSimulation(runtime);
    let frame = 0;
    let previousTime = performance.now();
    let accumulator = 0;
    let previousSnapshot: ShooterSnapshot | null = null;
    let currentSnapshot = simulation.snapshot();
    let finished = false;
    let completionTimer: ReturnType<typeof setTimeout> | undefined;
    let lastHUDTick = -10;
    let lastBossWarning = -120;
    let wasPaused = false;
    submittingRef.current = false;
    pendingResultRef.current = null;

    const finish = () => {
      if (finished) return;
      finished = true;
      setSettling(true);
      keysRef.current.clear();
      controlRef.current = { ...controlRef.current, pointer: null };
      rescueQueuedRef.current = false;
      setHudSnapshot(currentSnapshot);
      const result = simulation.result();
      audioRef.current.playSound(result?.won ? "victory" : "defeat");
      // A short, harmless beat lets the final hit read before the next scene.
      // Progression never waits for Rescue or another player action.
      if (result) completionTimer = setTimeout(() => void submitResult(result), result.won ? 450 : 250);
    };

    const update = () => {
      if (finished) return;
      if (embedded && controlRef.current.pointer === null) {
        const keys = keysRef.current;
        const direction =
          (keys.has("ArrowRight") || keys.has("KeyD") ? 1 : 0) -
          (keys.has("ArrowLeft") || keys.has("KeyA") ? 1 : 0);
        if (direction !== 0) {
          controlRef.current = {
            ...controlRef.current,
            playerX: Math.max(
              controlRef.current.minimumX,
              Math.min(controlRef.current.maximumX, controlRef.current.playerX + direction * 95),
            ),
          };
        }
      }
      const input = sampleShooterInput(
        controlRef.current,
        rescueQueuedRef.current,
      );
      rescueQueuedRef.current = false;
      previousSnapshot = currentSnapshot;
      const events = simulation.step(input);
      currentSnapshot = simulation.snapshot();
      for (const enemyID of events.enemyHitIDs) {
        const enemy = currentSnapshot.enemies.find(
          (candidate) => candidate.id === enemyID,
        ) ?? previousSnapshot.enemies.find((candidate) => candidate.id === enemyID);
        if (enemy) {
          const destroyed = events.enemyDefeatedIDs.includes(enemyID);
          enemyImpactsRef.current.set(enemyID, {
            enemyID,
            x: enemy.position.x,
            // Player fire travels upward, so anchor the burst to the lower
            // edge where the projectile actually meets the sprite.
            y: enemy.position.y + (runtime.config.reversal ? 0 : enemy.boss ? 310 : 155),
            boss: enemy.boss,
            role: enemy.role,
            destroyed,
            untilTick: currentSnapshot.tick + (destroyed ? 10 : runtime.config.reversal ? 3 : 7),
          });
        }
      }
      enemyImpactsRef.current.forEach((impact, enemyID) => {
        if (impact.untilTick < currentSnapshot.tick) {
          enemyImpactsRef.current.delete(enemyID);
        }
      });
      if (events.pickup) audioRef.current.playSound("pickup");
      if ((currentSnapshot.reversal?.breaks ?? 0) > (previousSnapshot.reversal?.breaks ?? 0)) {
        audioRef.current.setDemoMusicProgress(musicProgress + currentSnapshot.reversal!.breaks);
        audioRef.current.playSound("coreBreak");
        void playTelegramHaptic("rescue");
      } else if (events.enemyDefeatedIDs.length > 0) {
        audioRef.current.playSound("enemyBreak");
      } else if (events.enemyHitIDs.length > 0) {
        audioRef.current.playSound("enemyHit");
      }
      if (events.hit) audioRef.current.playSound("hit");
      if (events.shield) audioRef.current.playSound("shield");
      if (events.combo) audioRef.current.playSound("combo");
      if (events.rescue) {
        rescueUsedRef.current = true;
        audioRef.current.playSound("rescue");
        void playTelegramHaptic("rescue");
      }
      if (events.bossWarning && (!runtime.config.reversal || runtime.config.boss)
        && currentSnapshot.tick - lastBossWarning >= 90) {
        lastBossWarning = currentSnapshot.tick;
        audioRef.current.playSound("bossWarning");
        void playTelegramHaptic("warning");
      }
      if (
        currentSnapshot.tick - lastHUDTick >= 3 ||
        currentSnapshot.tick >= runtime.config.duration_ticks
      ) {
        lastHUDTick = currentSnapshot.tick;
        setHudSnapshot(currentSnapshot);
      }
      if (simulation.result()) {
        finish();
      }
    };

    const draw = () => {
      const key = runtime.config.reversal ? null : shooterTutorialKey(
        runtime.config.starting_rescue_charge,
        currentSnapshot,
        pointerStartedRef.current,
        movementDistanceRef.current,
        rescueUsedRef.current,
      );
      const tutorial = runtime.config.reversal
        ? currentSnapshot.tick < 90 && !runtime.config.boss
          ? openingRef.current ?? null
          : currentSnapshot.tick < 240 && !runtime.config.boss
            ? gameText(languageRef.current, "demoMoveHint") : null
        : key ? gameText(languageRef.current, key) : null;
      drawShooterArena(
        canvasRef.current,
        currentSnapshot,
        previousSnapshot,
        Math.min(1, accumulator / (1_000 / SHOOTER_TPS)),
        sourcesRef.current,
        visualsRef.current,
        tutorial,
        controlRef.current.playerX,
        enemyImpactsRef.current,
      );
    };

    const loop = (now: number) => {
      const delta = Math.min(100, now - previousTime);
      previousTime = now;
      if (pausedRef.current || wasPaused || !assetsReadyRef.current) accumulator = 0;
      else if (!finished) accumulator += delta;
      wasPaused = pausedRef.current;
      let updates = 0;
      while (accumulator >= 1_000 / SHOOTER_TPS && updates < 5 && !finished) {
        accumulator -= 1_000 / SHOOTER_TPS;
        update();
        updates += 1;
      }
      draw();
      if (!finished) frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(completionTimer);
    };
  }, [embedded, musicProgress, runtime, submitResult]);

  const queueRescue = () => {
    if ((hudSnapshot?.rescue_charge ?? 0) >= 100 && !submitting && !settling) {
      rescueQueuedRef.current = true;
    }
  };

  const bounds = () => surfaceRef.current?.getBoundingClientRect() ?? null;
  const begin = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (submitting || settling || pausedRef.current || !assetsReadyRef.current) return;
    const rect = bounds();
    if (!rect) return;
    const next = beginShooterPointer(
      controlRef.current,
      event.pointerId,
      event.clientX,
      event.clientY,
      rect,
    );
    if (next.pointer) {
      pointerStartedRef.current = true;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Capture can disappear while Telegram is deactivating the WebView.
      }
    }
    controlRef.current = next;
    event.currentTarget.dataset.controlX = String(next.playerX);
    event.currentTarget.dataset.pointerActive = String(next.pointer !== null);
  };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = bounds();
    if (!rect) return;
    const before = controlRef.current.playerX;
    controlRef.current = moveShooterPointer(
      controlRef.current,
      event.pointerId,
      event.clientX,
      event.clientY,
      rect,
    );
    movementDistanceRef.current += Math.abs(controlRef.current.playerX - before);
    event.currentTarget.dataset.controlX = String(controlRef.current.playerX);
  };
  const end = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Pointer capture is best-effort across Telegram lifecycle changes.
    }
    controlRef.current = endShooterPointer(controlRef.current, event.pointerId);
    event.currentTarget.dataset.pointerActive = "false";
  };

  return (
    <main data-game-surface="true" className={`${embedded ? "absolute" : "fixed"} inset-0 shooter-stage overflow-hidden bg-[#02050e]`}>
      <div
        data-testid="shooter-battlefield"
        data-segment-slug={segment.segment_slug}
        className="shooter-battlefield overflow-hidden"
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={gameText(language, "shooterArena")}
          data-testid="shooter-canvas"
          className="absolute inset-0 h-full w-full"
        />
        <div
          ref={surfaceRef}
          data-testid="shooter-control-surface"
          data-control-x={(PLAYER_MIN_X + PLAYER_MAX_X) / 2}
          data-pointer-active="false"
          role="group"
          aria-label={gameText(language, "tutorialHold")}
          className="absolute inset-0 z-20 touch-none select-none"
          onPointerDown={begin}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onLostPointerCapture={end}
          onContextMenu={(event) => event.preventDefault()}
        />
      </div>
      <ShooterHUD
        snapshot={hudSnapshot}
        segmentIndex={run.state.segment_index}
        segmentTotal={runtime.config.reversal ? 1 : 3}
        durationTicks={runtime.config.duration_ticks}
        boss={Boolean(segment.boss_id)}
        busy={busy || submitting || settling}
        onRescue={queueRescue}
      />
      {assetState !== "ready" ? (
        <div className="absolute inset-0 z-40 grid place-items-center bg-[#0b1827] p-6 text-center font-mono text-sm text-cyan-100" role="status">
          {assetState === "error" ? (
            <button className="border border-cyan-200 bg-slate-900 px-5 py-3" onClick={() => window.location.reload()}>{gameText(language, "retry")}</button>
          ) : gameText(language, "connecting")}
        </div>
      ) : null}
      {submitting && !embedded ? (
        <p
          aria-live="polite"
          className="pointer-events-none absolute bottom-[var(--xuhuan-host-safe-bottom)] left-1/2 z-30 -translate-x-1/2 border border-cyan-200/20 bg-[#020713]/90 px-3 py-1.5 font-mono text-[9px] text-cyan-100"
        >
          SYNC…
        </p>
      ) : null}
      {submissionFailed ? (
        <button
          type="button"
          data-testid="retry-segment"
          onClick={retry}
          className="absolute bottom-[var(--xuhuan-host-safe-bottom)] left-1/2 z-30 w-[min(19rem,calc(100%-1rem))] -translate-x-1/2 border border-rose-300/40 bg-rose-950/95 px-3 py-2 text-xs text-rose-50"
        >
          {gameText(language, "retrySegment")}
        </button>
      ) : null}
    </main>
  );
};
