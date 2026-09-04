"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { useAudio } from "@/components/providers/audio-provider";
import useLocale from "@/components/providers/use-locale";
import { gameText } from "@/features/game/game-copy";
import {
  GATE_DWELL_TICKS,
  PLAYER_MAX_X,
  PLAYER_MIN_X,
  SHOOTER_TPS,
  SHOOTER_WIDTH,
} from "@/features/shooter/constants";
import {
  beginShooterPointer,
  endShooterPointer,
  initialShooterControl,
  moveShooterPointer,
  type ShooterControl,
} from "@/features/shooter/input";
import {
  drawShooterGates,
  observeShooterCanvas,
  preloadShooterVisuals,
  resolveShooterVisualSources,
  type ShooterVisuals,
} from "@/features/shooter/renderer";
import { ShooterHUD } from "@/features/shooter/shooter-hud";
import { resolveShooterGateOptions } from "@/features/shooter/types";
import { enterTelegramCombatMode } from "@/lib/telegram-combat-mode";
import { playTelegramHaptic } from "@/lib/telegram-haptics";
import type { ShooterContent, ShooterGameRun } from "@/lib/api/types";

type Props = {
  readonly content: ShooterContent;
  readonly run: ShooterGameRun;
  readonly busy: boolean;
  readonly onChoose: (optionId: string) => Promise<boolean>;
};

const gateIndexForX = (x: number): number | null => {
  if (x <= SHOOTER_WIDTH / 2 - 180) return 0;
  if (x >= SHOOTER_WIDTH / 2 + 180) return 1;
  return null;
};

export const ShooterGates = ({ content, run, busy, onChoose }: Props) => {
  const { language } = useLocale();
  const audio = useAudio();
  const setMusicActive = audio.setMusicActive;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const controlRef = useRef<ShooterControl>(
    initialShooterControl((PLAYER_MIN_X + PLAYER_MAX_X) / 2),
  );
  const visualsRef = useRef<ShooterVisuals>(new Map());
  const choosingRef = useRef(false);
  const [choosing, setChoosing] = useState(false);
  const chooseRef = useRef(onChoose);
  const options = useMemo(
    () => resolveShooterGateOptions(content, run),
    [content, run],
  );
  const sources = useMemo(
    () => resolveShooterVisualSources(content, run),
    [content, run],
  );

  useEffect(() => {
    chooseRef.current = onChoose;
  }, [onChoose]);

  useEffect(() => observeShooterCanvas(canvasRef.current), []);

  useEffect(() => enterTelegramCombatMode(), []);
  useEffect(() => {
    setMusicActive(true);
    return () => setMusicActive(false);
  }, [setMusicActive]);

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
    let frame = 0;
    let previous = performance.now();
    let accumulator = 0;
    let active: number | null = null;
    let dwell = 0;
    let animationTick = 0;
    const step = async () => {
      animationTick += 1;
      const next = gateIndexForX(controlRef.current.playerX);
      if (next === active && next !== null) dwell += 1;
      else {
        active = next;
        dwell = next === null ? 0 : 1;
      }
      if (
        active !== null &&
        dwell >= GATE_DWELL_TICKS &&
        !choosingRef.current &&
        !busy
      ) {
        const option = options[active];
        if (option) {
          choosingRef.current = true;
          setChoosing(true);
          audio.playSound("gateSelect");
          void playTelegramHaptic("selection");
          const accepted = await chooseRef.current(option.id);
          if (!accepted) {
            choosingRef.current = false;
            setChoosing(false);
            dwell = 0;
          }
        }
      }
    };
    const draw = () =>
      drawShooterGates(
        canvasRef.current,
        sources,
        visualsRef.current,
        options,
        active,
        dwell / GATE_DWELL_TICKS,
        gameText(language, "gateInstruction"),
        animationTick,
        controlRef.current.playerX,
      );
    const loop = (now: number) => {
      const delta = Math.min(100, now - previous);
      previous = now;
      if (!document.hidden && !choosingRef.current) accumulator += delta;
      while (accumulator >= 1_000 / SHOOTER_TPS) {
        accumulator -= 1_000 / SHOOTER_TPS;
        void step();
      }
      draw();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [audio, busy, language, options, sources]);

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
    controlRef.current = moveShooterPointer(
      controlRef.current,
      event.pointerId,
      event.clientX,
      event.clientY,
      rect,
    );
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
    <main data-game-surface="true" className="fixed inset-0 overflow-hidden bg-[#02050e]">
      <div
        data-testid="shooter-gate-battlefield"
        className="absolute bottom-[var(--xuhuan-host-safe-bottom)] left-0 right-0 top-[calc(var(--xuhuan-host-safe-top)+3rem)] overflow-hidden"
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={gameText(language, "tutorialGate")}
          data-testid="shooter-gate-canvas"
          className="absolute inset-0 h-full w-full"
        />
        <div
          data-testid="shooter-gate-copy-layer"
          className="pointer-events-none absolute bottom-0 top-0 z-10"
          style={{
            left: "var(--xuhuan-host-safe-left)",
            right: "var(--xuhuan-host-safe-right)",
          }}
        >
          {options.slice(0, 2).map((option, index) => (
            <section
              key={option.id}
              data-testid={`gate-option-${option.id}`}
              className={`absolute top-[51%] w-[42%] text-center ${index === 0 ? "left-[4%]" : "right-[4%]"}`}
            >
              <h2 className="overflow-hidden text-[clamp(11px,3.6vw,15px)] font-black leading-tight text-slate-50 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                {option.title}
              </h2>
              <p className="mt-1 overflow-hidden text-[clamp(9px,2.8vw,12px)] leading-snug text-slate-300 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                {option.description}
              </p>
            </section>
          ))}
        </div>
        <div
          ref={surfaceRef}
          data-testid="shooter-gate-surface"
          data-control-x={(PLAYER_MIN_X + PLAYER_MAX_X) / 2}
          data-pointer-active="false"
          role="group"
          aria-label={gameText(language, "gateInstruction")}
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
        snapshot={null}
        segmentIndex={run.state.segment_index}
        boss={false}
        busy={busy || choosing}
        fallbackHealth={run.state.hearts}
        showMeter={false}
      />
    </main>
  );
};
