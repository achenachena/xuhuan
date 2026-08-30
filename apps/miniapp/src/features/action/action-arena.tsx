"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAudio } from "@/components/providers/audio-provider";
import {
  beginJoystickControl,
  isWarpArmed,
  joystickVisual,
  moveJoystickControl,
  readJoystickInput,
  releasedWarpDirection,
  type JoystickControl,
} from "@/features/action/action-controls";
import { ActionHUD } from "@/features/action/action-hud";
import {
  ACTION_TPS,
  buildActionConfig,
  createActionSimulation,
  TraceRecorder,
  type ActionResult,
  type ActionSnapshot,
  type ActionTrace,
} from "@/features/action/action-engine";
import { protocolLabel } from "@/features/action/action-labels";
import {
  drawActionArena,
  preloadActionVisuals,
  remainingWarpSeconds,
  resolveActionVisualSources,
  type ActionVisuals,
} from "@/features/action/action-renderer";
import {
  gameText,
  type GameCopyKey,
  type GameLocale,
} from "@/features/game/game-copy";
import { APIError, type APIGameContent, type APIGameRun } from "@/lib/api/client";
import { lockTelegramVerticalSwipes } from "@/lib/telegram-gesture-lock";

type Props = {
  readonly content: APIGameContent;
  readonly run: APIGameRun;
  readonly locale: GameLocale;
  readonly busy: boolean;
  readonly submissionError: unknown;
  readonly onComplete: (trace: ActionTrace) => Promise<boolean>;
  readonly onRestart: () => void;
};

const syncJoystickVisual = (
  pad: HTMLDivElement | null,
  ring: HTMLDivElement | null,
  knob: HTMLDivElement | null,
  control: JoystickControl | null,
): void => {
  if (!pad || !ring || !knob) return;
  const active = Boolean(control);
  const armed = Boolean(control && isWarpArmed(control));
  pad.dataset.active = String(active);
  ring.dataset.active = String(active);
  knob.dataset.active = String(active);
  pad.dataset.warp = String(armed);
  ring.dataset.warp = String(armed);
  knob.dataset.warp = String(armed);
  if (!control) {
    pad.style.removeProperty("left");
    pad.style.removeProperty("top");
    ring.style.removeProperty("left");
    ring.style.removeProperty("top");
    knob.style.removeProperty("left");
    knob.style.removeProperty("top");
    return;
  }
  const visual = joystickVisual(control);
  pad.style.left = `${visual.origin.x}px`;
  pad.style.top = `${visual.origin.y}px`;
  ring.style.left = `${visual.origin.x}px`;
  ring.style.top = `${visual.origin.y}px`;
  knob.style.left = `${visual.knob.x}px`;
  knob.style.top = `${visual.knob.y}px`;
};

export const ActionArena = ({
  content,
  run,
  locale,
  busy,
  submissionError,
  onComplete,
  onRestart,
}: Props) => {
  const audio = useAudio();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controlSurfaceRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef<JoystickControl | null>(null);
  const stickPadRef = useRef<HTMLDivElement>(null);
  const stickWarpRingRef = useRef<HTMLDivElement>(null);
  const stickKnobRef = useRef<HTMLDivElement>(null);
  const snapshotRef = useRef<ActionSnapshot | null>(null);
  const skillRef = useRef(false);
  const skillDirectionRef = useRef(0);
  const warpArmedRef = useRef(false);
  const movedRef = useRef(false);
  const usedWarpRef = useRef(false);
  const completeRef = useRef(onComplete);
  const audioRef = useRef(audio);
  const pendingTraceRef = useRef<ActionTrace | null>(null);
  const submissionInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const [snapshot, setSnapshot] = useState<ActionSnapshot | null>(null);
  const [moved, setMoved] = useState(false);
  const [usedWarp, setUsedWarp] = useState(false);
  const [paused, setPaused] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [submissionFailed, setSubmissionFailed] = useState(false);
  const config = useMemo(() => buildActionConfig(content, run), [content, run]);
  const text = (key: GameCopyKey): string => gameText(locale, key);
  const visualSources = useMemo(
    () => resolveActionVisualSources(content, run, config),
    [config, content, run],
  );

  useEffect(() => {
    completeRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    audioRef.current = audio;
  }, [audio]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const submitCompletedTrace = useCallback(async (trace: ActionTrace) => {
    if (submissionInFlightRef.current) return;
    submissionInFlightRef.current = true;
    pendingTraceRef.current = trace;
    setSubmissionFailed(false);
    setVerifying(true);
    let accepted = false;
    try {
      accepted = await completeRef.current(trace);
    } finally {
      submissionInFlightRef.current = false;
    }
    if (!mountedRef.current) return;
    if (accepted) {
      pendingTraceRef.current = null;
      // The accepted command advances the parent to the next phase. Keep the
      // arena covered until that authoritative state replaces this component.
      return;
    }
    setVerifying(false);
    setSubmissionFailed(true);
  }, []);

  useEffect(() => {
    audio.playBattleBGM();
    return audio.stopBGM;
  }, [audio]);

  useEffect(() => {
    let disposed = false;
    let animationFrame = 0;
    let previousTime = performance.now();
    let accumulator = 0;
    let simulation: Awaited<ReturnType<typeof createActionSimulation>> | null =
      null;
    let visuals: ActionVisuals | null = null;
    let previousSnapshot: ActionSnapshot | null = null;
    let currentSnapshot: ActionSnapshot | null = null;
    let submitting = false;
    const recorder = new TraceRecorder();
    pendingTraceRef.current = null;
    submissionInFlightRef.current = false;
    movedRef.current = false;
    usedWarpRef.current = false;

    const finish = (result: ActionResult): void => {
      if (submitting) return;
      submitting = true;
      audioRef.current.playSound(result.won ? "victory" : "defeat");
      // A real touch trace normally ends as soon as the prediction reaches its
      // objective. Pad with neutral input so the Go replay can safely absorb a
      // one-tick prediction difference instead of rejecting a short room. Go
      // stops at its own authoritative finish tick, so this cannot change an
      // already matching result and compresses to only a few RLE pairs.
      recorder.padNeutralTo(config.maxTicks);
      const trace = recorder.encode();
      pendingTraceRef.current = trace;
      void submitCompletedTrace(trace);
    };

    const draw = (): void => {
      if (!simulation) return;
      const control = stickRef.current;
      const aimDirection =
        control && isWarpArmed(control)
          ? readJoystickInput(control, false).direction
          : null;
      drawActionArena(
        canvasRef.current,
        currentSnapshot ?? simulation.snapshot(),
        previousSnapshot,
        Math.min(1, accumulator / (1000 / ACTION_TPS)),
        config,
        visuals,
        aimDirection,
      );
    };

    const loop = (now: number): void => {
      if (disposed || !simulation) return;
      const delta = Math.min(100, now - previousTime);
      previousTime = now;
      if (!document.hidden && !submitting) accumulator += delta;
      let updates = 0;
      while (
        accumulator >= 1000 / ACTION_TPS &&
        updates < 5 &&
        !submitting
      ) {
        const input = readJoystickInput(
          stickRef.current,
          skillRef.current,
          skillDirectionRef.current,
        );
        skillRef.current = false;
        if (input.magnitude > 0 && !movedRef.current) {
          movedRef.current = true;
          setMoved(true);
        }
        if (input.skill) {
          audioRef.current.playSound("specialMove");
          if (!usedWarpRef.current) {
            usedWarpRef.current = true;
            setUsedWarp(true);
          }
        }
        recorder.push(input);
        previousSnapshot = currentSnapshot ?? simulation.snapshot();
        const result = simulation.step(input);
        currentSnapshot = simulation.snapshot();
        snapshotRef.current = currentSnapshot;
        if (
          previousSnapshot &&
          currentSnapshot.health < previousSnapshot.health
        ) {
          audioRef.current.playSound("damage");
        }
        accumulator -= 1000 / ACTION_TPS;
        updates += 1;
        if (currentSnapshot.tick % 4 === 0 || result) {
          setSnapshot(currentSnapshot);
        }
        if (result) {
          drawActionArena(
            canvasRef.current,
            currentSnapshot,
            previousSnapshot,
            1,
            config,
            visuals,
          );
          void finish(result);
          break;
        }
      }
      draw();
      animationFrame = requestAnimationFrame(loop);
    };

    void Promise.all([
      createActionSimulation(config),
      preloadActionVisuals(visualSources),
    ]).then(([created, loadedVisuals]) => {
      if (disposed) return;
      simulation = created;
      visuals = loadedVisuals;
      currentSnapshot = created.snapshot();
      previousSnapshot = currentSnapshot;
      snapshotRef.current = currentSnapshot;
      setSnapshot(currentSnapshot);
      animationFrame = requestAnimationFrame(loop);
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      stickRef.current = null;
      warpArmedRef.current = false;
    };
  }, [config, submitCompletedTrace, visualSources]);

  useEffect(() => {
    const releaseControl = (): void => {
      stickRef.current = null;
      skillRef.current = false;
      warpArmedRef.current = false;
      syncJoystickVisual(
        stickPadRef.current,
        stickWarpRingRef.current,
        stickKnobRef.current,
        null,
      );
    };
    const onVisibility = (): void => {
      setPaused(document.hidden);
      if (document.hidden) releaseControl();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", releaseControl);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", releaseControl);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.actionEncounter = "true";
    const blockNativePan = (event: TouchEvent): void => {
      if (event.cancelable) event.preventDefault();
    };
    const surface = controlSurfaceRef.current;
    surface?.addEventListener("touchmove", blockNativePan, {
      capture: true,
      passive: false,
    });
    const restoreVerticalSwipes = lockTelegramVerticalSwipes();
    return () => {
      surface?.removeEventListener("touchmove", blockNativePan, true);
      delete root.dataset.actionEncounter;
      restoreVerticalSwipes();
    };
  }, []);

  const haptic = (style: "light" | "medium"): void => {
    void import("@twa-dev/sdk").then(({ default: webApp }) => {
      if (webApp.platform !== "unknown") {
        webApp.HapticFeedback.impactOccurred(style);
      }
    });
  };

  const pointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (busy || verifying || submissionFailed || !event.isPrimary) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    const control = beginJoystickControl(
      event.pointerId,
      event.clientX - rect.left,
      event.clientY - rect.top,
      42,
    );
    stickRef.current = control;
    warpArmedRef.current = isWarpArmed(control);
    syncJoystickVisual(
      stickPadRef.current,
      stickWarpRingRef.current,
      stickKnobRef.current,
      control,
    );
  };

  const pointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (stickRef.current?.pointerId !== event.pointerId) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const control = moveJoystickControl(
      stickRef.current,
      event.clientX - rect.left,
      event.clientY - rect.top,
    );
    const armed = isWarpArmed(control);
    if (armed && !warpArmedRef.current) haptic("light");
    warpArmedRef.current = armed;
    stickRef.current = control;
    syncJoystickVisual(
      stickPadRef.current,
      stickWarpRingRef.current,
      stickKnobRef.current,
      control,
    );
  };

  const endPointer = (
    event: React.PointerEvent<HTMLDivElement>,
    releaseWarp: boolean,
  ): void => {
    const control = stickRef.current;
    if (control?.pointerId !== event.pointerId) return;
    event.preventDefault();
    const direction = releaseWarp ? releasedWarpDirection(control) : null;
    if (direction !== null && (snapshotRef.current?.warpCooldown ?? 1) === 0) {
      skillDirectionRef.current = direction;
      skillRef.current = true;
      haptic("medium");
    }
    stickRef.current = null;
    warpArmedRef.current = false;
    syncJoystickVisual(
      stickPadRef.current,
      stickWarpRingRef.current,
      stickKnobRef.current,
      null,
    );
  };

  const tutorial = run.state.encounter?.tutorial;
  const protocolReady = Boolean(snapshot?.protocol);
  const guidance =
    (snapshot?.reconnectFX ?? 0) > 0
      ? text("emergencyReconnect")
      : undefined;
  const cooldown = snapshot ? remainingWarpSeconds(snapshot) : 0;
  const warpLabel = snapshot
    ? protocolLabel(snapshot.protocol, locale)
    : text("warp");
  const traceWasRejected =
    submissionError instanceof APIError &&
    ["invalid_command", "invalid_trace", "incomplete_encounter"].includes(
      submissionError.code,
    );

  return (
    <main
      data-locale={locale}
      className="fixed inset-0 mx-auto h-[100dvh] w-full max-w-lg select-none overflow-hidden overscroll-none bg-[#02050e] text-white [touch-action:none] [-webkit-user-select:none]"
    >
      <ActionHUD
        snapshot={snapshot}
        locale={locale}
        fallbackHealth={run.state.health}
        fallbackMaxHealth={run.state.max_health}
        tutorial={Boolean(tutorial)}
        moved={moved}
        usedWarp={usedWarp}
        guidanceOverride={guidance}
      />

      <div
        data-testid="action-playfield"
        className="absolute inset-x-0 bottom-0 top-[calc(var(--xuhuan-host-safe-top)+4.25rem)] min-h-0 overflow-hidden"
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={text("combatArena")}
          className="absolute inset-0 h-full w-full [image-rendering:pixelated] [touch-action:none]"
          onContextMenu={(event) => event.preventDefault()}
        />

        <div
          ref={controlSurfaceRef}
          role="group"
          aria-label={text("movementControl")}
          className="absolute inset-0 z-20 [touch-action:none]"
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={(event) => endPointer(event, true)}
          onPointerCancel={(event) => endPointer(event, false)}
          onLostPointerCapture={(event) => endPointer(event, false)}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div
            ref={stickWarpRingRef}
            aria-hidden="true"
            data-active="false"
            data-warp="false"
            className="pointer-events-none absolute h-[8.9rem] w-[8.9rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-fuchsia-200/40 bg-fuchsia-500/[.03] opacity-0 shadow-[0_0_24px_rgba(217,70,239,.1)] data-[active=true]:opacity-100 data-[warp=true]:border-fuchsia-100 data-[warp=true]:bg-fuchsia-500/[.08]"
          />
          <div
            ref={stickPadRef}
            data-active="false"
            data-warp="false"
            className="pointer-events-none absolute grid h-[5.25rem] w-[5.25rem] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-cyan-100/45 bg-slate-950/82 font-mono text-[7px] tracking-[.12em] text-cyan-50/75 opacity-0 shadow-[inset_0_0_0_7px_rgba(8,47,73,.28)] data-[active=true]:opacity-100 data-[active=true]:border-cyan-50/80 data-[warp=true]:border-fuchsia-100 data-[warp=true]:bg-fuchsia-950/82 data-[warp=true]:shadow-[inset_0_0_0_7px_rgba(8,47,73,.36),0_0_24px_rgba(217,70,239,.55)]"
          >
            {cooldown > 0
              ? `${cooldown}s`
              : protocolReady
                ? warpLabel
                : text("moveWarp")}
            <div className="absolute inset-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 bg-cyan-100/45" />
          </div>
          <div
            ref={stickKnobRef}
            data-active="false"
            data-warp="false"
            className="pointer-events-none absolute h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cyan-50 bg-cyan-400/45 opacity-0 shadow-[0_0_16px_rgba(34,211,238,.5)] transition-[opacity,background-color,border-color,box-shadow] data-[active=true]:opacity-100 data-[warp=true]:border-fuchsia-50 data-[warp=true]:bg-fuchsia-400/65 data-[warp=true]:shadow-[0_0_26px_rgba(217,70,239,.8)]"
          />
        </div>
      </div>

      {paused ? (
        <div className="absolute inset-0 z-40 grid place-items-center bg-slate-950/75 backdrop-blur-sm">
          <div className="border-l-2 border-cyan-200/50 bg-[#040b18]/90 px-5 py-3 font-mono text-[10px] text-cyan-50">
            {text("channelPaused")}
          </div>
        </div>
      ) : null}
      {verifying && !submissionFailed ? (
        <div className="pointer-events-none absolute bottom-[calc(var(--xuhuan-host-safe-bottom)+1rem)] left-1/2 z-40 -translate-x-1/2 border-l-2 border-cyan-200/60 bg-[#040b18]/88 px-4 py-2 font-mono text-[9px] text-cyan-50 shadow-lg">
          {text("verifyingEncounter")}
        </div>
      ) : null}
      {submissionFailed ? (
        <div className="absolute inset-x-3 bottom-[calc(var(--xuhuan-host-safe-bottom)+.75rem)] z-40 border-l-2 border-rose-300/70 bg-[#100814]/94 px-4 py-3 font-mono text-[10px] text-rose-50 shadow-xl backdrop-blur-sm">
          <p className="leading-4">
            {traceWasRejected ? text("traceRejected") : text("traceUploadFailed")}
          </p>
          <div className="mt-2 flex gap-2">
            {traceWasRejected ? (
              <button
                type="button"
                className="min-h-10 flex-1 border border-rose-200 bg-rose-200 px-3 py-2 font-bold text-slate-950"
                onClick={onRestart}
              >
                {text("restartEncounter")}
              </button>
            ) : (
              <button
                type="button"
                className="min-h-10 flex-1 border border-cyan-200 bg-cyan-200 px-3 py-2 font-bold text-slate-950"
                onClick={() => {
                  const trace = pendingTraceRef.current;
                  if (trace) void submitCompletedTrace(trace);
                }}
              >
                {text("retryTrace")}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
};
