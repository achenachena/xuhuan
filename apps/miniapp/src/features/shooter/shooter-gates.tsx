"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useAudio } from "@/components/providers/audio-provider";
import useLocale from "@/components/providers/use-locale";
import { gameText } from "@/features/game/game-copy";
import {
  drawShooterGates,
  observeShooterCanvas,
  preloadShooterVisuals,
  resolveShooterVisualSources,
  type ShooterVisuals,
} from "@/features/shooter/renderer";
import { ShooterHUD } from "@/features/shooter/shooter-hud";
import { resolveShooterGateOptions } from "@/features/shooter/types";
import { playTelegramHaptic } from "@/lib/telegram-haptics";
import type { ShooterContent, ShooterGameRun } from "@/lib/api/types";

type Props = {
  readonly content: ShooterContent;
  readonly run: ShooterGameRun;
  readonly busy: boolean;
  readonly onChoose: (optionId: string) => Promise<boolean>;
};

// Choices are ordinary buttons over a harmless animated stage. They do not
// need a second movement controller, dwell timer, or Telegram gesture lock.
export const ShooterGates = ({ content, run, busy, onChoose }: Props) => {
  const { language } = useLocale();
  const { playSound, setMusicActive } = useAudio();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visualsRef = useRef<ShooterVisuals>(new Map());
  const selectedRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const options = useMemo(() => resolveShooterGateOptions(content, run), [content, run]);
  const sources = useMemo(() => resolveShooterVisualSources(content, run), [content, run]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  useEffect(() => observeShooterCanvas(canvasRef.current), []);
  useEffect(() => {
    setMusicActive(true);
    return () => setMusicActive(false);
  }, [setMusicActive]);
  useEffect(() => {
    let active = true;
    void preloadShooterVisuals(sources).then((visuals) => {
      if (active) visualsRef.current = visuals;
    });
    return () => { active = false; };
  }, [sources]);
  useEffect(() => {
    let frame = 0;
    let lastDraw = 0;
    let animationTick = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const loop = (now: number) => {
      if (!document.hidden && now - lastDraw >= 1_000 / 30) {
        lastDraw = now;
        if (!reducedMotion) animationTick += 1;
        drawShooterGates(canvasRef.current, sources, visualsRef.current, options, selectedRef.current, animationTick);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [options, sources]);

  const choose = async (index: number) => {
    if (busy || selectedRef.current !== null) return;
    const option = options[index];
    if (!option) return;
    selectedRef.current = index;
    setSelected(index);
    setFailed(false);
    playSound("gateSelect");
    void playTelegramHaptic("selection");
    let accepted = false;
    try { accepted = await onChoose(option.id); }
    catch { /* Keep the same choice available after a network interruption. */ }
    if (!accepted && mountedRef.current) {
      selectedRef.current = null;
      setSelected(null);
      setFailed(true);
    }
  };

  return (
    <main data-game-surface="true" className="fixed inset-0 shooter-stage overflow-hidden bg-[#02050e]">
      <div data-testid="shooter-gate-battlefield" className="shooter-battlefield overflow-hidden">
        <canvas ref={canvasRef} aria-hidden="true" data-testid="shooter-gate-canvas" className="absolute inset-0 h-full w-full" />
        <p className="absolute left-3 right-3 top-[3%] text-center font-mono text-xs font-bold text-cyan-100">
          {gameText(language, "gateInstruction")}
        </p>
        <div data-testid="shooter-gate-copy-layer" className="absolute inset-0">
          {options.map((option, index) => (
            <button key={option.id} type="button" data-testid={`gate-option-${option.id}`}
              disabled={busy || selected !== null} onClick={() => void choose(index)}
              aria-label={`${option.title}. ${option.description}`}
              className={`absolute top-[14%] flex h-[59%] w-[38%] flex-col justify-end border-2 border-transparent px-1 pb-[16%] text-center text-white outline-none focus-visible:border-amber-200 active:bg-cyan-200/10 disabled:cursor-wait ${index === 0 ? "left-[8.5%]" : "right-[8.5%]"}`}>
              <span className="text-[clamp(12px,3.6vw,16px)] font-black leading-tight">{option.title}</span>
              <span className="mt-2 text-[clamp(10px,2.8vw,12px)] leading-snug text-slate-200">{option.description}</span>
            </button>
          ))}
        </div>
        <p role="status" className="pointer-events-none absolute bottom-[12%] left-4 right-4 text-center font-mono text-xs text-cyan-100">
          {selected !== null ? gameText(language, "syncing") : failed ? gameText(language, "choiceRetry") : ""}
        </p>
      </div>
      <ShooterHUD snapshot={null} segmentIndex={run.state.segment_index} boss={false}
        busy={busy || selected !== null} fallbackHealth={run.state.hearts} showMeter={false} />
    </main>
  );
};
