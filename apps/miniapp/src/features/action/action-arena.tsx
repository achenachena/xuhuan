"use client";

import { useEffect, useRef, useState } from "react";

import { useAudio } from "@/components/providers/audio-provider";
import {
  ACTION_TPS,
  buildActionConfig,
  createActionSimulation,
  TraceRecorder,
  type ActionInput,
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

type Stick = {
  pointerId: number;
  originX: number;
  originY: number;
  x: number;
  y: number;
} | null;

const text = {
  "zh-CN": {
    move: "拖动屏幕移动。攻击交给我。",
    beacon: "按顺序穿过三枚航标。",
    dash: "航线完成。点右下角，创过去。",
    reconnect: "紧急重连成功。仅此一次。",
    verifying: "正在重放本房间……",
    warp: "航线跃迁",
    paused: "频道已暂停",
    hp: "同步率",
    distortion: "失真",
    route: "航线",
  },
  en: {
    move: "Drag to move. I will handle the shooting.",
    beacon: "Cross the three beacons in order.",
    dash: "Route complete. Hit Warp and go through.",
    reconnect: "Emergency reconnect. This only works once.",
    verifying: "Replaying the encounter…",
    warp: "Route Warp",
    paused: "Channel paused",
    hp: "SYNC",
    distortion: "DISTORTION",
    route: "ROUTE",
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
  const stickBaseRef = useRef<HTMLDivElement>(null);
  const stickKnobRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef<Stick>(null);
  const skillRef = useRef(false);
  const movedRef = useRef(false);
  const usedSkillRef = useRef(false);
  const completeRef = useRef(onComplete);
  const audioRef = useRef(audio);
  const [snapshot, setSnapshot] = useState<ActionSnapshot | null>(null);
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
    const stickBase = stickBaseRef.current;
    const stickKnob = stickKnobRef.current;
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
        const input = readInput(stickRef.current, skillRef);
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
      previousSnapshot = currentSnapshot;
      setSnapshot(currentSnapshot);
      frame = requestAnimationFrame(loop);
    });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      hideStick(stickBase, stickKnob);
    };
  }, [attempt, config]);

  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (busy || verifying) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    stickRef.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      x: event.clientX,
      y: event.clientY,
    };
    showStick(
      stickBaseRef.current,
      stickKnobRef.current,
      event.clientX,
      event.clientY,
    );
  };
  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (stickRef.current?.pointerId !== event.pointerId) return;
    stickRef.current = {
      ...stickRef.current,
      x: event.clientX,
      y: event.clientY,
    };
    moveStickKnob(stickKnobRef.current, stickRef.current);
  };
  const pointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (stickRef.current?.pointerId !== event.pointerId) return;
    stickRef.current = null;
    hideStick(stickBaseRef.current, stickKnobRef.current);
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

  return (
    <main className="relative mx-auto h-[100dvh] w-full max-w-lg overflow-hidden bg-[#02050e] text-white [touch-action:none]">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={locale === "en" ? "Action encounter arena" : "动作战斗区域"}
        className="absolute inset-0 h-full w-full [image-rendering:pixelated] [touch-action:none]"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
      />
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 px-3 pr-[4.5rem] pt-[max(.55rem,env(safe-area-inset-top))]">
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
          </div>
          <div className="mt-2 grid grid-cols-[1fr_5rem] gap-2">
            <div className="h-2 overflow-hidden border border-white/10 bg-black/45">
              <div
                className="h-full bg-gradient-to-r from-cyan-300 to-violet-400"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <div className="h-2 overflow-hidden border border-white/10 bg-black/45">
              <div
                className={`h-full ${snapshot && snapshot.distortion >= 60 ? "bg-fuchsia-400" : "bg-violet-500"}`}
                style={{ width: `${snapshot?.distortion ?? 0}%` }}
              />
            </div>
          </div>
        </div>
      </header>

      {hint && (
        <div
          role="status"
          className="pointer-events-none absolute left-1/2 top-[18%] z-20 w-[82%] -translate-x-1/2 border-2 border-cyan-300/30 bg-[#071225]/92 px-4 py-3 text-center font-mono text-xs leading-5 text-cyan-50 shadow-[4px_4px_0_rgba(2,6,23,.8)] backdrop-blur-sm"
        >
          {hint}
        </div>
      )}
      <div className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 z-20">
        <button
          type="button"
          aria-label={text[locale].warp}
          disabled={busy || verifying || cooldown > 0}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            skillRef.current = true;
          }}
          onClick={(event) => {
            if (event.detail === 0) skillRef.current = true;
          }}
          className={`grid h-[5.25rem] w-[5.25rem] place-items-center border-[3px] text-center font-mono shadow-[6px_6px_0_rgba(2,6,23,.7)] transition [clip-path:polygon(16%_0,84%_0,100%_16%,100%_84%,84%_100%,16%_100%,0_84%,0_16%)] active:translate-x-1 active:translate-y-1 active:shadow-none disabled:opacity-45 ${snapshot?.routeReady ? "animate-pulse border-amber-100 bg-amber-300 text-slate-950" : "border-cyan-100/70 bg-[#0b3854]/90 text-cyan-50"}`}
        >
          <span>
            <strong className="block text-2xl">⇢</strong>
            <small className="block max-w-16 text-[9px] font-bold leading-3">
              {cooldown > 0 ? `${cooldown}s` : text[locale].warp}
            </small>
          </span>
        </button>
      </div>

      <div
        ref={stickBaseRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 h-24 w-24 opacity-0 transition-opacity duration-100"
      >
        <div className="absolute inset-0 border-2 border-cyan-100/20 bg-[#071225]/45 shadow-[4px_4px_0_rgba(2,6,23,.5)] [clip-path:polygon(25%_0,75%_0,100%_25%,100%_75%,75%_100%,25%_100%,0_75%,0_25%)]" />
        <div
          ref={stickKnobRef}
          className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 border-2 border-cyan-100/70 bg-cyan-300/30"
        />
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

const readInput = (
  stick: Stick,
  skill: React.MutableRefObject<boolean>,
): ActionInput => {
  let direction = 0,
    magnitude = 0;
  if (stick) {
    const dx = stick.x - stick.originX,
      dy = stick.y - stick.originY,
      distance = Math.hypot(dx, dy);
    if (distance >= 12) {
      direction =
        (Math.round((Math.atan2(dy, dx) / (Math.PI * 2)) * 16) + 16) % 16;
      magnitude = distance < 28 ? 1 : distance < 56 ? 2 : 3;
    }
  }
  const input = { direction, magnitude, skill: skill.current };
  skill.current = false;
  return input;
};

const showStick = (
  base: HTMLDivElement | null,
  knob: HTMLDivElement | null,
  x: number,
  y: number,
) => {
  if (!base || !knob) return;
  base.style.transform = `translate3d(${x - 48}px,${y - 48}px,0)`;
  base.style.opacity = "1";
  knob.style.transform = "translate3d(-50%,-50%,0)";
};

const moveStickKnob = (
  knob: HTMLDivElement | null,
  stick: Exclude<Stick, null>,
) => {
  if (!knob) return;
  const dx = stick.x - stick.originX,
    dy = stick.y - stick.originY,
    distance = Math.max(1, Math.hypot(dx, dy));
  const radius = Math.min(34, distance);
  knob.style.transform = `translate3d(calc(-50% + ${(dx / distance) * radius}px),calc(-50% + ${(dy / distance) * radius}px),0)`;
};

const hideStick = (
  base: HTMLDivElement | null,
  knob: HTMLDivElement | null,
) => {
  if (base) base.style.opacity = "0";
  if (knob) knob.style.transform = "translate3d(-50%,-50%,0)";
};
