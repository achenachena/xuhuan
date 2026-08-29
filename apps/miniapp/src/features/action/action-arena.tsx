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
import {
  ACTION_TPS,
  buildActionConfig,
  createActionSimulation,
  TraceRecorder,
  type ActionResult,
  type ActionSnapshot,
  type ActionTrace,
} from "@/features/action/action-engine";
import {
  objectiveProgressRatio,
} from "@/features/action/action-objectives";
import {
  objectiveStatusLabel,
  protocolLabel,
} from "@/features/action/action-labels";
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
import type { APIGameContent, APIGameRun } from "@/lib/api/client";
import { lockTelegramVerticalSwipes } from "@/lib/telegram-gesture-lock";

type Props = {
  readonly content: APIGameContent;
  readonly run: APIGameRun;
  readonly locale: GameLocale;
  readonly busy: boolean;
  readonly onComplete: (trace: ActionTrace) => Promise<boolean>;
};

const signalTone = {
  surge: "bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,.8)]",
  guard: "bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,.8)]",
  echo: "bg-violet-300 shadow-[0_0_10px_rgba(196,181,253,.8)]",
} as const;

const syncJoystickVisual = (
  pad: HTMLDivElement | null,
  knob: HTMLDivElement | null,
  control: JoystickControl | null,
): void => {
  if (!pad || !knob) return;
  const active = Boolean(control);
  const armed = Boolean(control && isWarpArmed(control));
  pad.dataset.active = String(active);
  knob.dataset.active = String(active);
  pad.dataset.warp = String(armed);
  knob.dataset.warp = String(armed);
  if (!control) {
    knob.style.removeProperty("left");
    knob.style.removeProperty("top");
    return;
  }
  const visual = joystickVisual(control);
  knob.style.left = `${visual.knob.x}px`;
  knob.style.top = `${visual.knob.y}px`;
};

export const ActionArena = ({
  content,
  run,
  locale,
  busy,
  onComplete,
}: Props) => {
  const audio = useAudio();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controlSurfaceRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef<JoystickControl | null>(null);
  const stickPadRef = useRef<HTMLDivElement>(null);
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
      for (
        let retry = 0;
        retry < 3 && !accepted && mountedRef.current;
        retry += 1
      ) {
        accepted = await completeRef.current(trace);
        if (!accepted && retry < 2 && mountedRef.current) {
          await new Promise((resolve) =>
            window.setTimeout(resolve, 600 * 2 ** retry),
          );
        }
      }
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
      const trace = recorder.encode(result.digest);
      pendingTraceRef.current = trace;
      void submitCompletedTrace(trace);
    };

    const draw = (): void => {
      if (!simulation) return;
      drawActionArena(
        canvasRef.current,
        currentSnapshot ?? simulation.snapshot(),
        previousSnapshot,
        Math.min(1, accumulator / (1000 / ACTION_TPS)),
        config,
        visuals,
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
    const onVisibility = (): void => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
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
    const pad = stickPadRef.current?.getBoundingClientRect();
    const originX = pad ? pad.left + pad.width / 2 - rect.left : 70;
    const originY = pad ? pad.top + pad.height / 2 - rect.top : rect.height - 70;
    const radius = pad ? pad.width * 0.48 : 46;
    const control = moveJoystickControl(
      beginJoystickControl(event.pointerId, originX, originY, radius),
      event.clientX - rect.left,
      event.clientY - rect.top,
    );
    stickRef.current = control;
    warpArmedRef.current = isWarpArmed(control);
    syncJoystickVisual(stickPadRef.current, stickKnobRef.current, control);
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
    syncJoystickVisual(stickPadRef.current, stickKnobRef.current, control);
  };

  const pointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    const control = stickRef.current;
    if (control?.pointerId !== event.pointerId) return;
    event.preventDefault();
    const direction = releasedWarpDirection(control);
    if (direction !== null && (snapshotRef.current?.warpCooldown ?? 1) === 0) {
      skillDirectionRef.current = direction;
      skillRef.current = true;
      haptic("medium");
    }
    stickRef.current = null;
    warpArmedRef.current = false;
    syncJoystickVisual(stickPadRef.current, stickKnobRef.current, null);
  };

  const tutorial = run.state.encounter?.tutorial;
  const protocolReady = Boolean(snapshot?.protocol);
  const hint =
    (snapshot?.reconnectFX ?? 0) > 0
      ? text("emergencyReconnect")
      : !tutorial
        ? null
        : !moved
          ? text("tutorialMove")
          : protocolReady
            ? usedWarp
              ? null
              : text("tutorialWarp")
            : text("tutorialSignal");
  const progress = snapshot
    ? objectiveProgressRatio(snapshot.objective)
    : 0;
  const cooldown = snapshot ? remainingWarpSeconds(snapshot) : 0;
  const warpLabel = snapshot
    ? protocolLabel(snapshot.protocol, locale)
    : text("warp");

  return (
    <main
      data-locale={locale}
      className="fixed inset-0 mx-auto h-[100dvh] w-full max-w-lg select-none overflow-hidden overscroll-none bg-[#02050e] text-white [touch-action:none] [-webkit-user-select:none]"
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={text("combatArena")}
        className="absolute inset-0 h-full w-full [image-rendering:pixelated] [touch-action:none]"
        onContextMenu={(event) => event.preventDefault()}
      />

      <header
        data-testid="combat-hud"
        className="pointer-events-none absolute inset-x-0 top-[calc(var(--xuhuan-host-safe-top)+.75rem)] z-10 px-3 pr-[4.75rem]"
      >
        <div className="border-2 border-cyan-100/35 bg-[#040b18]/95 p-2.5 shadow-[4px_4px_0_rgba(2,6,23,.9),0_0_24px_rgba(34,211,238,.08)] backdrop-blur-sm">
          <div className="flex items-center gap-2 font-mono text-[9px] tracking-[.12em] text-slate-300">
            <span>{text("hp")}</span>
            <strong className="text-emerald-300">
              {snapshot?.health ?? run.state.health}/
              {snapshot?.maxHealth ?? run.state.max_health}
            </strong>
            {(snapshot?.shield ?? 0) > 0 && (
              <span className="text-sky-300">
                {text("shield")} {snapshot?.shield}
              </span>
            )}
            <span className="ml-auto text-cyan-100">
              {snapshot
                ? objectiveStatusLabel(snapshot, locale)
                : text("connectingShort")}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden border border-cyan-100/20 bg-black/70">
            <div
              className="h-full bg-gradient-to-r from-cyan-300 via-sky-300 to-violet-400"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <div className="mt-2 grid grid-cols-[1fr_auto] items-end gap-3 font-mono text-[8px] tracking-[.12em] text-slate-400">
            <div>
              <div className="mb-1 flex items-center gap-1.5">
                <span>{text("signalWeave")}</span>
                {[0, 1, 2].map((index) => {
                  const signal = snapshot?.weave[index];
                  return (
                    <span
                      key={index}
                      className={`h-2.5 w-2.5 border border-white/25 ${signal ? signalTone[signal] : "bg-slate-900"}`}
                    />
                  );
                })}
                {protocolReady && (
                  <strong className="ml-1 text-fuchsia-200">{warpLabel}</strong>
                )}
              </div>
              <div className="h-1.5 overflow-hidden border border-white/10 bg-black/60">
                <div
                  className={
                    snapshot && snapshot.distortion >= 60
                      ? "h-full bg-fuchsia-400"
                      : "h-full bg-violet-500"
                  }
                  style={{ width: `${snapshot?.distortion ?? 0}%` }}
                />
              </div>
              <div className="mt-0.5 flex justify-between">
                <span>
                  {snapshot && snapshot.distortion >= 60
                    ? text("overload")
                    : text("distortion")}
                </span>
                <span>{snapshot?.distortion ?? 0}%</span>
              </div>
            </div>
            <div className="text-right">
              <div>
                {text("threat")} {snapshot?.enemies.length ?? 0}
              </div>
              <div className="mt-1 text-amber-200">
                {text("score")} {snapshot?.score ?? run.state.score}
              </div>
            </div>
          </div>
        </div>
      </header>

      {hint && (
        <div
          role="status"
          className="pointer-events-none absolute left-1/2 top-[calc(var(--xuhuan-host-safe-top)+8.25rem)] z-20 w-[82%] -translate-x-1/2 border-2 border-cyan-200/35 bg-[#040b18]/95 px-4 py-3 text-center font-mono text-xs leading-5 text-cyan-50 shadow-[4px_4px_0_rgba(2,6,23,.9)] backdrop-blur-sm"
        >
          {hint}
        </div>
      )}

      <div
        ref={controlSurfaceRef}
        role="group"
        aria-label={text("movementControl")}
        className="absolute bottom-[var(--xuhuan-host-safe-bottom)] left-0 z-20 h-48 w-48 [touch-action:none]"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        onLostPointerCapture={pointerUp}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-3 left-3 h-40 w-40 rounded-full border-2 border-dashed border-fuchsia-200/35 bg-fuchsia-500/[.04] shadow-[0_0_28px_rgba(217,70,239,.1),inset_0_0_24px_rgba(34,211,238,.07)]"
        />
        <div
          ref={stickPadRef}
          data-active="false"
          data-warp="false"
          className="pointer-events-none absolute bottom-10 left-10 grid h-24 w-24 place-items-center rounded-full border-2 border-cyan-100/45 bg-slate-950/80 font-mono text-[8px] tracking-[.15em] text-cyan-50/75 shadow-[inset_0_0_0_9px_rgba(8,47,73,.32)] transition-[border-color,background-color,box-shadow] data-[active=true]:border-cyan-50/80 data-[warp=true]:border-fuchsia-100 data-[warp=true]:bg-fuchsia-950/75 data-[warp=true]:shadow-[inset_0_0_0_9px_rgba(8,47,73,.4),0_0_28px_rgba(217,70,239,.55)]"
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
          className="pointer-events-none absolute h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cyan-50 bg-cyan-400/45 opacity-0 shadow-[0_0_18px_rgba(34,211,238,.5)] transition-[opacity,background-color,border-color,box-shadow] data-[active=true]:opacity-100 data-[warp=true]:border-fuchsia-50 data-[warp=true]:bg-fuchsia-400/65 data-[warp=true]:shadow-[0_0_30px_rgba(217,70,239,.8)]"
        />
        <span className="pointer-events-none absolute bottom-0 left-0 w-44 text-center font-mono text-[8px] tracking-[.18em] text-fuchsia-100/70">
          {text("warpGesture")}
        </span>
      </div>

      {(paused || verifying || submissionFailed) && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-slate-950/80 backdrop-blur-sm">
          <div className="mx-6 max-w-sm border-2 border-cyan-200/35 bg-[#040b18] px-6 py-4 text-center font-mono text-xs text-cyan-50 shadow-[5px_5px_0_rgba(2,6,23,.9)]">
            {submissionFailed ? (
              <>
                <p className="leading-5">{text("traceUploadFailed")}</p>
                <button
                  type="button"
                  className="mt-4 min-h-11 border-2 border-cyan-200 bg-cyan-200 px-5 py-2 font-bold text-slate-950"
                  onClick={() => {
                    const trace = pendingTraceRef.current;
                    if (trace) void submitCompletedTrace(trace);
                  }}
                >
                  {text("retryTrace")}
                </button>
              </>
            ) : verifying ? (
              text("verifyingEncounter")
            ) : (
              text("channelPaused")
            )}
          </div>
        </div>
      )}
    </main>
  );
};
