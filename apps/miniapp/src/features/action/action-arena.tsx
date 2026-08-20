"use client";

import { useEffect, useRef, useState } from "react";

import { useAudio } from "@/components/providers/audio-provider";
import {
  beginJoystickControl,
  joystickVisual,
  moveJoystickControl,
  readJoystickInput,
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
  drawActionArena,
  preloadActionVisuals,
  type ActionVisuals,
} from "@/features/action/action-renderer";
import type { GameLocale } from "@/features/game/game-copy";
import type { APIGameContent, APIGameRun } from "@/lib/api/client";

type Props = {
  readonly content: APIGameContent;
  readonly run: APIGameRun;
  readonly locale: GameLocale;
  readonly busy: boolean;
  readonly onComplete: (trace: ActionTrace) => Promise<boolean>;
};

const text = {
  "zh-CN": {
    move: "按住左下移动盘。松手立刻停下。",
    beacon: "收集记忆碎片可清除附近弹幕。",
    dash: "航线完成。用航线击破穿过敌群。",
    reconnect: "紧急重连成功。仅此一次。",
    verifying: "正在重放本房间……",
    dashSkill: "相位冲刺",
    routeBreak: "航线击破",
    paused: "频道已暂停",
    hp: "同步率",
    distortion: "失真",
    overdrive: "过载",
    route: "航线",
    threat: "威胁",
    uplink: "接入",
    moveControl: "移动盘",
  },
  en: {
    move: "Hold the lower-left stick. Release to stop.",
    beacon: "Collect a Memory Fragment to purge nearby bullets.",
    dash: "Route complete. Break through the enemy line.",
    reconnect: "Emergency reconnect. This only works once.",
    verifying: "Replaying the encounter…",
    dashSkill: "Phase Dash",
    routeBreak: "Route Break",
    paused: "Channel paused",
    hp: "SYNC",
    distortion: "DISTORTION",
    overdrive: "OVERDRIVE",
    route: "ROUTE",
    threat: "THREAT",
    uplink: "UPLINK",
    moveControl: "Movement stick",
  },
} as const;

export const ActionArena = ({
  content,
  run,
  locale,
  busy,
  onComplete,
}: Props) => {
  const audio = useAudio();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stickRef = useRef<JoystickControl | null>(null);
  const snapshotRef = useRef<ActionSnapshot | null>(null);
  const skillRef = useRef(false);
  const movedRef = useRef(false);
  const usedSkillRef = useRef(false);
  const completeRef = useRef(onComplete);
  const audioRef = useRef(audio);
  const [snapshot, setSnapshot] = useState<ActionSnapshot | null>(null);
  const [joystick, setJoystick] = useState<JoystickControl | null>(null);
  const [moved, setMoved] = useState(false);
  const [usedSkill, setUsedSkill] = useState(false);
  const [paused, setPaused] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [config] = useState(() => buildActionConfig(content, run));

  useEffect(() => {
    completeRef.current = onComplete;
  }, [onComplete]);
  useEffect(() => {
    audioRef.current = audio;
  }, [audio]);
  useEffect(() => {
    audio.playBattleBGM();
    return audio.stopBGM;
  }, [audio]);

  useEffect(() => {
    let disposed = false;
    let frame = 0;
    let previous = performance.now();
    let accumulator = 0;
    let simulation: Awaited<ReturnType<typeof createActionSimulation>> | null =
      null;
    let visuals: ActionVisuals | null = null;
    let previousSnapshot: ActionSnapshot | null = null;
    let currentSnapshot: ActionSnapshot | null = null;
    const recorder = new TraceRecorder();
    movedRef.current = false;
    usedSkillRef.current = false;

    const finish = async (result: ActionResult) => {
      audioRef.current.playSound(result.won ? "victory" : "defeat");
      setVerifying(true);
      const accepted = await completeRef.current(
        recorder.encode(result.digest),
      );
      if (!disposed && !accepted) {
        setVerifying(false);
        setAttempt((value) => value + 1);
      }
    };

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas || !simulation) return;
      const state = currentSnapshot ?? simulation.snapshot();
      drawActionArena(
        canvas,
        state,
        previousSnapshot,
        Math.min(1, accumulator / (1000 / ACTION_TPS)),
        config,
        visuals,
      );
    };

    const loop = (now: number) => {
      if (disposed || !simulation) return;
      const delta = Math.min(100, now - previous);
      previous = now;
      if (!document.hidden) accumulator += delta;
      let updates = 0;
      while (accumulator >= 1000 / ACTION_TPS && updates < 5) {
        const input = readJoystickInput(stickRef.current, skillRef.current);
        skillRef.current = false;
        if (input.magnitude > 0 && !movedRef.current) {
          movedRef.current = true;
          setMoved(true);
        }
        if (input.skill) {
          audioRef.current.playSound("specialMove");
          if (!usedSkillRef.current) {
            usedSkillRef.current = true;
            setUsedSkill(true);
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
        )
          audioRef.current.playSound("damage");
        accumulator -= 1000 / ACTION_TPS;
        updates += 1;
        if (currentSnapshot.tick % 5 === 0 || result)
          setSnapshot(currentSnapshot);
        if (result) {
          void finish(result);
          drawActionArena(
            canvasRef.current,
            currentSnapshot,
            previousSnapshot,
            1,
            config,
            visuals,
          );
          return;
        }
      }
      draw();
      frame = requestAnimationFrame(loop);
    };

    void Promise.all([
      createActionSimulation(config),
      preloadActionVisuals().catch(() => null),
    ]).then(([created, loadedVisuals]) => {
      if (disposed) return;
      simulation = created;
      visuals = loadedVisuals;
      currentSnapshot = created.snapshot();
      snapshotRef.current = currentSnapshot;
      previousSnapshot = currentSnapshot;
      setSnapshot(currentSnapshot);
      frame = requestAnimationFrame(loop);
    });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      stickRef.current = null;
    };
  }, [attempt, config]);

  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.actionEncounter = "true";
    const blockNativePan = (event: TouchEvent) => {
      if (event.cancelable) event.preventDefault();
    };
    document.addEventListener("touchmove", blockNativePan, {
      capture: true,
      passive: false,
    });
    return () => {
      document.removeEventListener("touchmove", blockNativePan, true);
      delete root.dataset.actionEncounter;
    };
  }, []);

  const pointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (busy || verifying || !event.isPrimary) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    const control = beginJoystickControl(
      event.pointerId,
      event.clientX - rect.left,
      event.clientY - rect.top,
    );
    stickRef.current = control;
    setJoystick(control);
  };
  const pointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (stickRef.current?.pointerId !== event.pointerId) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const control = moveJoystickControl(
      stickRef.current,
      event.clientX - rect.left,
      event.clientY - rect.top,
    );
    stickRef.current = control;
    setJoystick(control);
  };
  const pointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (stickRef.current?.pointerId !== event.pointerId) return;
    event.preventDefault();
    stickRef.current = null;
    setJoystick(null);
  };

  const tutorial = run.state.encounter?.tutorial;
  const hint =
    (snapshot?.reconnectFX ?? 0) > 0
      ? text[locale].reconnect
      : !tutorial
        ? null
        : !moved
          ? text[locale].move
          : (snapshot?.routeStep ?? 0) > 0 || snapshot?.routeReady
            ? usedSkill
              ? null
              : text[locale].dash
            : text[locale].beacon;
  const progress = snapshot
    ? Math.min(1, snapshot.tick / config.durationTicks)
    : 0;
  const cooldown = snapshot
    ? Math.max(0, Math.ceil(snapshot.dashCooldown / ACTION_TPS))
    : 0;
  const stick = joystick ? joystickVisual(joystick) : null;
  const skillLabel = snapshot?.routeReady
    ? text[locale].routeBreak
    : text[locale].dashSkill;

  return (
    <main className="fixed inset-0 mx-auto h-[100dvh] w-full max-w-lg select-none overflow-hidden overscroll-none bg-[#02050e] text-white [touch-action:none] [-webkit-user-select:none]">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={locale === "en" ? "Action encounter arena" : "动作战斗区域"}
        className="absolute inset-0 h-full w-full [image-rendering:pixelated] [touch-action:none]"
        onContextMenu={(event) => event.preventDefault()}
      />
      <header
        data-testid="combat-hud"
        className="pointer-events-none absolute inset-x-0 top-[var(--xuhuan-host-safe-top)] z-10 px-3 pr-[4.5rem]"
      >
        <div className="border-2 border-cyan-200/20 bg-[#071225]/88 p-2.5 shadow-[4px_4px_0_rgba(2,6,23,.8)] backdrop-blur-sm">
          <div className="flex items-center gap-2 text-[10px] font-mono tracking-wider text-slate-300">
            <span>{text[locale].hp}</span>
            <strong className="text-emerald-300">
              {snapshot?.health ?? run.state.health}/
              {snapshot?.maxHealth ?? run.state.max_health}
            </strong>
            {(snapshot?.shield ?? 0) > 0 && (
              <span className="text-sky-300">◇ {snapshot?.shield}</span>
            )}
            <span className="ml-auto">
              {text[locale].route} {snapshot?.routeStep ?? 0}/3
            </span>
            <span>
              {text[locale].threat} {snapshot?.enemies.length ?? 0}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-[1fr_5.5rem] gap-2 font-mono text-[8px] tracking-wider text-slate-400">
            <div>
              <div className="mb-1 flex justify-between">
                <span>{text[locale].uplink}</span>
                <span>{Math.round(progress * 100)}%</span>
              </div>
              <div className="h-2 overflow-hidden border border-white/10 bg-black/45">
                <div
                  className="h-full bg-gradient-to-r from-cyan-300 to-violet-400"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            </div>
            <div>
              <div className="mb-1 text-right">
                {snapshot && snapshot.distortion >= 60
                  ? text[locale].overdrive
                  : text[locale].distortion}
              </div>
              <div className="h-2 overflow-hidden border border-white/10 bg-black/45">
                <div
                  className={`h-full ${snapshot && snapshot.distortion >= 60 ? "bg-fuchsia-400" : "bg-violet-500"}`}
                  style={{ width: `${snapshot?.distortion ?? 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      {hint && (
        <div
          role="status"
          className="pointer-events-none absolute left-1/2 top-[calc(var(--xuhuan-host-safe-top)+5.5rem)] z-20 w-[82%] -translate-x-1/2 border-2 border-cyan-300/30 bg-[#071225]/92 px-4 py-3 text-center font-mono text-xs leading-5 text-cyan-50 shadow-[4px_4px_0_rgba(2,6,23,.8)] backdrop-blur-sm"
        >
          {hint}
        </div>
      )}

      <div
        role="group"
        aria-label={text[locale].moveControl}
        className="absolute bottom-[var(--xuhuan-host-safe-bottom)] left-0 z-20 h-[42%] w-[62%] [touch-action:none]"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        onLostPointerCapture={pointerUp}
        onContextMenu={(event) => event.preventDefault()}
      >
        {!stick && (
          <div className="pointer-events-none absolute bottom-4 left-4 grid h-[5.75rem] w-[5.75rem] place-items-center rounded-full border-2 border-cyan-200/20 bg-slate-950/30 font-mono text-[9px] tracking-[0.22em] text-cyan-100/55 shadow-[inset_0_0_0_8px_rgba(8,47,73,.2)]">
            {locale === "en" ? "MOVE" : "移动"}
          </div>
        )}
        {stick && (
          <div
            className="pointer-events-none absolute h-[6.5rem] w-[6.5rem] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cyan-200/35 bg-slate-950/45 shadow-[inset_0_0_0_10px_rgba(8,47,73,.35),0_0_24px_rgba(34,211,238,.12)]"
            style={{ left: stick.origin.x, top: stick.origin.y }}
          >
            <div className="absolute inset-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 bg-cyan-100/35" />
          </div>
        )}
        {stick && (
          <div
            className="pointer-events-none absolute h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cyan-100/65 bg-cyan-400/25 shadow-[0_0_18px_rgba(34,211,238,.35)]"
            style={{ left: stick.knob.x, top: stick.knob.y }}
          />
        )}
      </div>

      <div className="absolute bottom-[var(--xuhuan-host-safe-bottom)] right-4 z-20">
        <button
          type="button"
          aria-label={skillLabel}
          disabled={busy || verifying || cooldown > 0}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            skillRef.current = true;
          }}
          onClick={(event) => {
            if (event.detail === 0) skillRef.current = true;
          }}
          className={`grid h-[5.25rem] w-[5.25rem] place-items-center border-[3px] text-center font-mono shadow-[6px_6px_0_rgba(2,6,23,.7)] transition [clip-path:polygon(16%_0,84%_0,100%_16%,100%_84%,84%_100%,16%_100%,0_84%,0_16%)] active:translate-x-1 active:translate-y-1 active:shadow-none disabled:opacity-45 ${snapshot?.routeReady ? "animate-pulse border-fuchsia-100 bg-gradient-to-br from-cyan-300 to-fuchsia-400 text-slate-950" : "border-cyan-100/70 bg-[#0b3854]/90 text-cyan-50"}`}
        >
          <span>
            <strong className="block text-2xl">⇢</strong>
            <small className="block max-w-16 text-[9px] font-bold leading-3">
              {cooldown > 0 ? `${cooldown}s` : skillLabel}
            </small>
          </span>
        </button>
      </div>

      {(paused || verifying) && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-slate-950/75 backdrop-blur-sm">
          <div className="border-2 border-cyan-300/25 bg-[#071225] px-6 py-4 font-mono text-xs text-cyan-100 shadow-[5px_5px_0_rgba(2,6,23,.8)]">
            {verifying ? text[locale].verifying : text[locale].paused}
          </div>
        </div>
      )}
    </main>
  );
};
