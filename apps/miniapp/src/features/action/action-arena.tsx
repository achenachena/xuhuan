"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useAudio } from "@/components/providers/audio-provider";
import {
  ACTION_HEIGHT,
  ACTION_TPS,
  ACTION_WIDTH,
  buildActionConfig,
  createActionSimulation,
  TraceRecorder,
  type ActionConfig,
  type ActionInput,
  type ActionResult,
  type ActionSnapshot,
  type ActionTrace,
} from "@/features/action/action-engine";
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
  const config = useMemo(() => buildActionConfig(content, run), [content, run]);

  useEffect(() => {
    completeRef.current = onComplete;
  }, [onComplete]);
  useEffect(() => {
    audioRef.current = audio;
  }, [audio]);
  useEffect(() => {
    audio.playBGM("battle");
    return audio.stopBGM;
  }, [audio]);

  useEffect(() => {
    let disposed = false;
    let frame = 0;
    let previous = performance.now();
    let accumulator = 0;
    let simulation: Awaited<ReturnType<typeof createActionSimulation>> | null =
      null;
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
      drawArena(
        canvas,
        state,
        previousSnapshot,
        Math.min(1, accumulator / (1000 / ACTION_TPS)),
        config,
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
          drawArena(
            canvasRef.current,
            currentSnapshot,
            previousSnapshot,
            1,
            config,
          );
          return;
        }
      }
      draw();
      frame = requestAnimationFrame(loop);
    };

    void createActionSimulation(config).then((created) => {
      if (disposed) return;
      simulation = created;
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
    <main className="relative mx-auto h-[100dvh] w-full max-w-lg overflow-hidden bg-[#040713] text-white [touch-action:none]">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={locale === "en" ? "Action encounter arena" : "动作战斗区域"}
        className="absolute inset-0 h-full w-full [touch-action:none]"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
      />
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 px-3 pt-[max(.55rem,env(safe-area-inset-top))]">
        <div className="rounded-2xl border border-white/10 bg-slate-950/75 p-2.5 shadow-xl backdrop-blur-md">
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
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-gradient-to-r from-cyan-300 to-violet-400"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
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
          className="pointer-events-none absolute left-1/2 top-[18%] z-20 w-[82%] -translate-x-1/2 rounded-2xl border border-cyan-300/25 bg-slate-950/82 px-4 py-3 text-center text-sm leading-5 text-cyan-50 shadow-[0_0_30px_rgba(34,211,238,.16)] backdrop-blur"
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
          className={`grid h-[5.25rem] w-[5.25rem] place-items-center rounded-full border-2 text-center shadow-2xl transition active:scale-90 disabled:opacity-45 ${snapshot?.routeReady ? "animate-pulse border-amber-200 bg-amber-300 text-slate-950 shadow-amber-300/30" : "border-cyan-200/60 bg-cyan-400/20 text-cyan-50 shadow-cyan-500/20"}`}
        >
          <span>
            <strong className="block text-xl">⌁</strong>
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
        <div className="absolute inset-0 rounded-full border border-white/20 bg-white/[.06] shadow-[0_0_28px_rgba(34,211,238,.12)]" />
        <div
          ref={stickKnobRef}
          className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-100/70 bg-cyan-300/30"
        />
      </div>
      {(paused || verifying) && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-slate-950/75 backdrop-blur-sm">
          <div className="rounded-2xl border border-cyan-300/20 bg-slate-950 px-6 py-4 text-sm text-cyan-100">
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

const drawArena = (
  canvas: HTMLCanvasElement | null,
  snapshot: ActionSnapshot,
  previous: ActionSnapshot | null,
  alpha: number,
  config: ActionConfig,
) => {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(rect.width * ratio)),
    height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = "#030610";
  context.fillRect(0, 0, width, height);
  const scale = Math.min(width / ACTION_WIDTH, height / ACTION_HEIGHT);
  const offsetX = (width - ACTION_WIDTH * scale) / 2,
    offsetY = (height - ACTION_HEIGHT * scale) / 2;
  context.setTransform(scale, 0, 0, scale, offsetX, offsetY);
  const player = interpolate(previous?.player, snapshot.player, alpha);
  const previousEnemies = new Map(
    (previous?.enemies ?? []).map((enemy) => [enemy.id, enemy]),
  );
  const previousProjectiles = new Map(
    (previous?.projectiles ?? []).map((projectile) => [
      projectile.id,
      projectile,
    ]),
  );
  const gradient = context.createRadialGradient(
    ACTION_WIDTH / 2,
    2200,
    100,
    ACTION_WIDTH / 2,
    2800,
    3300,
  );
  gradient.addColorStop(0, "#18264a");
  gradient.addColorStop(0.52, "#0a1024");
  gradient.addColorStop(1, "#030610");
  context.fillStyle = gradient;
  context.fillRect(0, 0, ACTION_WIDTH, ACTION_HEIGHT);
  context.strokeStyle = "rgba(103,232,249,.07)";
  context.lineWidth = 8;
  for (let x = 0; x < ACTION_WIDTH; x += 360) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, ACTION_HEIGHT);
    context.stroke();
  }
  for (let y = 0; y < ACTION_HEIGHT; y += 360) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(ACTION_WIDTH, y);
    context.stroke();
  }
  const pulse = 1 + Math.sin(snapshot.tick / 7) * 0.12;
  context.beginPath();
  context.arc(
    snapshot.activeBeacon.x,
    snapshot.activeBeacon.y,
    210 * pulse,
    0,
    Math.PI * 2,
  );
  context.fillStyle = "rgba(250,204,21,.14)";
  context.fill();
  context.lineWidth = 28;
  context.strokeStyle = "rgba(253,224,71,.9)";
  context.stroke();
  context.font = "bold 150px ui-monospace";
  context.fillStyle = "#fde68a";
  context.textAlign = "center";
  context.fillText(
    String(snapshot.routeStep + 1),
    snapshot.activeBeacon.x,
    snapshot.activeBeacon.y + 52,
  );
  for (const enemy of snapshot.enemies) {
    const position = interpolate(
      previousEnemies.get(enemy.id)?.position,
      enemy.position,
      alpha,
    );
    const radius = enemy.boss ? 260 : 150;
    if (enemy.intentTicks > 0) {
      context.save();
      context.setLineDash([55, 38]);
      context.lineWidth = 24;
      context.strokeStyle = `rgba(251,113,133,${0.3 + (12 - Math.min(12, enemy.intentTicks)) / 18})`;
      context.beginPath();
      context.moveTo(position.x, position.y);
      context.lineTo(enemy.intentTarget.x, enemy.intentTarget.y);
      context.stroke();
      context.restore();
      if (enemy.bossPhase === 3) {
        context.beginPath();
        context.arc(position.x, position.y, 440, 0, Math.PI * 2);
        context.strokeStyle = "rgba(251,113,133,.55)";
        context.lineWidth = 28;
        context.stroke();
      }
    }
    context.beginPath();
    context.arc(position.x, position.y, radius + 90, 0, Math.PI * 2);
    context.strokeStyle = enemy.boss
      ? "rgba(244,114,182,.25)"
      : "rgba(167,139,250,.18)";
    context.lineWidth = 22;
    context.stroke();
    context.beginPath();
    context.arc(position.x, position.y, radius, 0, Math.PI * 2);
    context.fillStyle = enemy.boss ? "#be185d" : "#6d28d9";
    context.fill();
    context.strokeStyle = enemy.boss ? "#f9a8d4" : "#c4b5fd";
    context.lineWidth = 18;
    context.stroke();
    context.fillStyle = "rgba(2,6,23,.78)";
    context.fillRect(
      position.x - radius,
      position.y - radius - 95,
      radius * 2,
      34,
    );
    context.fillStyle = enemy.boss ? "#fb7185" : "#a78bfa";
    context.fillRect(
      position.x - radius,
      position.y - radius - 95,
      radius * 2 * Math.min(1, Math.max(0, enemy.health / enemy.maxHealth)),
      34,
    );
    if (enemy.boss) {
      context.font = "bold 82px ui-monospace";
      context.fillStyle = "#fbcfe8";
      context.fillText(
        `P${enemy.bossPhase} / ${enemy.bossMimic.toUpperCase()}`,
        position.x,
        position.y + radius + 125,
      );
    }
  }
  if (
    snapshot.tick % config.buffs.attackInterval < 2 &&
    snapshot.enemies.length > 0
  ) {
    let target = snapshot.enemies[0]!;
    let nearest = Number.MAX_SAFE_INTEGER;
    for (const enemy of snapshot.enemies) {
      const distance =
        (enemy.position.x - snapshot.player.x) ** 2 +
        (enemy.position.y - snapshot.player.y) ** 2;
      if (distance < nearest) {
        nearest = distance;
        target = enemy;
      }
    }
    const targetPosition = interpolate(
      previousEnemies.get(target.id)?.position,
      target.position,
      alpha,
    );
    context.beginPath();
    context.moveTo(player.x, player.y);
    context.lineTo(targetPosition.x, targetPosition.y);
    context.strokeStyle = "rgba(103,232,249,.85)";
    context.lineWidth = 26;
    context.stroke();
  }
  for (const bullet of snapshot.projectiles) {
    const position = interpolate(
      previousProjectiles.get(bullet.id)?.position,
      bullet.position,
      alpha,
    );
    context.beginPath();
    context.arc(
      position.x,
      position.y,
      bullet.grazed ? 48 : 58,
      0,
      Math.PI * 2,
    );
    context.fillStyle = bullet.grazed ? "#f0abfc" : "#fb7185";
    context.shadowBlur = 80;
    context.shadowColor = context.fillStyle;
    context.fill();
    context.shadowBlur = 0;
  }
  context.beginPath();
  context.arc(
    player.x,
    player.y,
    snapshot.invulnerable > 0 ? 150 : 125,
    0,
    Math.PI * 2,
  );
  context.fillStyle = snapshot.invulnerable > 0 ? "#fef3c7" : "#67e8f9";
  context.fill();
  context.strokeStyle = snapshot.routeReady ? "#fde047" : "#f0abfc";
  context.lineWidth = snapshot.routeReady ? 34 : 18;
  context.stroke();
  context.font = "bold 120px system-ui";
  context.fillStyle = "#071018";
  context.fillText("七", player.x, player.y + 42);
  if (snapshot.distortion >= 60) {
    context.fillStyle = `rgba(217,70,239,${0.035 + Math.sin(snapshot.tick) * 0.015})`;
    context.fillRect(0, 0, ACTION_WIDTH, ACTION_HEIGHT);
  }
  if (snapshot.tick < Math.min(config.durationTicks, 150)) {
    context.fillStyle = `rgba(103,232,249,${0.03 * (1 - snapshot.tick / 150)})`;
    context.fillRect(0, 0, ACTION_WIDTH, ACTION_HEIGHT);
  }
};

const interpolate = (
  previous: { x: number; y: number } | undefined,
  current: { x: number; y: number },
  alpha: number,
) =>
  previous
    ? {
        x: previous.x + (current.x - previous.x) * alpha,
        y: previous.y + (current.y - previous.y) * alpha,
      }
    : current;
