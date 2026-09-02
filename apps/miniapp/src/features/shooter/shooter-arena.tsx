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
  preloadShooterVisuals,
  resolveShooterVisualSources,
  type ShooterVisuals,
} from "@/features/shooter/renderer";
import {
  createShooterRuntime,
  createShooterSimulation,
} from "@/features/shooter/simulation";
import { ShooterHUD } from "@/features/shooter/shooter-hud";
import { ShooterTraceRecorder } from "@/features/shooter/trace";
import type { ShooterSnapshot } from "@/features/shooter/types";
import type { ShooterResult } from "@/features/shooter/types";
import { enterTelegramCombatMode } from "@/lib/telegram-combat-mode";
import { playTelegramHaptic } from "@/lib/telegram-haptics";
import type {
  ShooterContent,
  ShooterGameRun,
  ShooterTrace,
} from "@/lib/api/types";

type Props = {
  readonly content: ShooterContent;
  readonly run: ShooterGameRun;
  readonly busy: boolean;
  readonly embedded?: boolean;
  readonly onComplete: (
    trace: ShooterTrace,
    result: ShooterResult,
  ) => Promise<boolean>;
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

export const ShooterArena = ({ content, run, busy, embedded = false, onComplete }: Props) => {
  const { language } = useLocale();
  const audio = useAudio();
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
  const completeRef = useRef(onComplete);
  const audioRef = useRef(audio);
  const languageRef = useRef(language);
  const rescueQueuedRef = useRef(false);
  const pointerStartedRef = useRef(false);
  const movementDistanceRef = useRef(0);
  const rescueUsedRef = useRef(false);
  const keysRef = useRef(new Set<string>());
  const submittingRef = useRef(false);
  const pausedRef = useRef(false);
  const pendingTraceRef = useRef<ShooterTrace | null>(null);
  const pendingResultRef = useRef<ShooterResult | null>(null);
  const mountedRef = useRef(true);
  const [hudSnapshot, setHudSnapshot] = useState<ShooterSnapshot | null>(() =>
    createShooterSimulation(runtime).snapshot(),
  );
  const [submitting, setSubmitting] = useState(false);
  const [submissionFailed, setSubmissionFailed] = useState(false);

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
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => (embedded ? undefined : enterTelegramCombatMode()), [embedded]);

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
      if (active) visualsRef.current = visuals;
    });
    return () => {
      active = false;
    };
  }, [sources]);

  useEffect(() => {
    const pause = () => {
      pausedRef.current = true;
    };
    const resume = () => {
      pausedRef.current = document.hidden;
    };
    const visibility = () => {
      pausedRef.current = document.hidden;
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("xuhuan:deactivated", pause);
    window.addEventListener("xuhuan:activated", resume);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("xuhuan:deactivated", pause);
      window.removeEventListener("xuhuan:activated", resume);
    };
  }, []);

  const submitTrace = useCallback(async (trace: ShooterTrace, result: ShooterResult) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    pendingTraceRef.current = trace;
    pendingResultRef.current = result;
    setSubmitting(true);
    setSubmissionFailed(false);
    let accepted = false;
    try {
      accepted = await completeRef.current(trace, result);
    } finally {
      submittingRef.current = false;
    }
    if (!mountedRef.current || accepted) return;
    setSubmitting(false);
    setSubmissionFailed(true);
  }, []);

  const retry = useCallback(() => {
    const trace = pendingTraceRef.current;
    const result = pendingResultRef.current;
    if (trace && result) void submitTrace(trace, result);
  }, [submitTrace]);

  useEffect(() => {
    const simulation = createShooterSimulation(runtime);
    const recorder = new ShooterTraceRecorder();
    let frame = 0;
    let previousTime = performance.now();
    let accumulator = 0;
    let previousSnapshot: ShooterSnapshot | null = null;
    let currentSnapshot = simulation.snapshot();
    let finished = false;
    let lastHUDTick = -10;
    let lastBossWarning = -120;
    submittingRef.current = false;
    pendingTraceRef.current = null;
    pendingResultRef.current = null;

    const finish = () => {
      if (finished) return;
      finished = true;
      const neutral = sampleShooterInput(controlRef.current, false);
      recorder.pad(neutral, runtime.config.duration_ticks);
      const trace = recorder.encode();
      pendingTraceRef.current = trace;
      const result = simulation.result();
      audioRef.current.playSound(result?.won ? "victory" : "defeat");
      if (result) void submitTrace(trace, result);
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
      recorder.push(input);
      previousSnapshot = currentSnapshot;
      const events = simulation.step(input);
      currentSnapshot = simulation.snapshot();
      if (events.pickup) audioRef.current.playSound("pickup");
      if (events.hit) audioRef.current.playSound("hit");
      if (events.shield) audioRef.current.playSound("shield");
      if (events.combo) audioRef.current.playSound("combo");
      if (events.rescue) {
        rescueUsedRef.current = true;
        audioRef.current.playSound("rescue");
        void playTelegramHaptic("rescue");
      }
      if (events.bossWarning && currentSnapshot.tick - lastBossWarning >= 90) {
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
      if (currentSnapshot.tick >= runtime.config.duration_ticks) finish();
    };

    const draw = () => {
      const key = shooterTutorialKey(
        runtime.config.starting_rescue_charge,
        currentSnapshot,
        pointerStartedRef.current,
        movementDistanceRef.current,
        rescueUsedRef.current,
      );
      drawShooterArena(
        canvasRef.current,
        currentSnapshot,
        previousSnapshot,
        Math.min(1, accumulator / (1_000 / SHOOTER_TPS)),
        sources,
        visualsRef.current,
        key ? gameText(languageRef.current, key) : null,
        controlRef.current.playerX,
      );
    };

    const loop = (now: number) => {
      const delta = Math.min(100, now - previousTime);
      previousTime = now;
      if (!pausedRef.current && !finished) accumulator += delta;
      let updates = 0;
      while (accumulator >= 1_000 / SHOOTER_TPS && updates < 5 && !finished) {
        accumulator -= 1_000 / SHOOTER_TPS;
        update();
        updates += 1;
      }
      draw();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [embedded, runtime, sources, submitTrace]);

  const queueRescue = () => {
    if ((hudSnapshot?.rescue_charge ?? 0) >= 100 && !submitting) {
      rescueQueuedRef.current = true;
    }
  };

  const bounds = () => surfaceRef.current?.getBoundingClientRect() ?? null;
  const begin = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
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
    <main data-game-surface="true" className={`${embedded ? "absolute" : "fixed"} inset-0 overflow-hidden bg-[#02050e]`}>
      <div
        data-testid="shooter-battlefield"
        data-segment-slug={segment.segment_slug}
        className="absolute bottom-[var(--xuhuan-host-safe-bottom)] left-0 right-0 top-[calc(var(--xuhuan-host-safe-top)+3rem)] overflow-hidden"
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
        durationTicks={runtime.config.duration_ticks}
        boss={Boolean(segment.boss_id)}
        busy={busy || submitting}
        onRescue={queueRescue}
      />
      {submitting ? (
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
