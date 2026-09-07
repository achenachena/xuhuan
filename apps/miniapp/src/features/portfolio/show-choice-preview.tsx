"use client";

import { useEffect, useRef } from "react";

type Props = { readonly weapon: "twin" | "pierce" };

// This is a visual explanation, not a second combat simulation.
export const ShowChoicePreview = ({ weapon }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let lastDraw = 0;
    const started = performance.now();

    const draw = (now: number) => {
      if (now - lastDraw >= 32 || reducedMotion) {
        lastDraw = now;
        const phase = reducedMotion ? 0.62 : ((now - started) % 1_200) / 1_200;
        context.imageSmoothingEnabled = false;
        context.clearRect(0, 0, 144, 136);
        context.fillStyle = "#091524";
        context.fillRect(0, 0, 144, 136);
        context.fillStyle = "#162c3a";
        for (let x = 8; x < 144; x += 16) context.fillRect(x, 0, 1, 136);
        for (let y = 8; y < 136; y += 16) context.fillRect(0, y, 144, 1);

        const targets = weapon === "twin" ? [[42, 26], [90, 26]] : [[66, 12], [66, 48]];
        for (const [x, y] of targets) {
          const hit = phase > (weapon === "pierce" ? (y > 30 ? 0.47 : 0.73) : 0.62);
          context.fillStyle = hit ? "#dffbff" : "#71364f";
          context.fillRect(x - 5, y, 23, 13);
          context.fillStyle = hit ? "#72e4e4" : "#f59ba9";
          context.fillRect(x, y + 4, 13, 5);
          if (hit) {
            context.fillStyle = "#ffdfa2";
            context.fillRect(x - 10, y - 4, 3, 3);
            context.fillRect(x + 23, y + 14, 3, 3);
          }
        }

        const bulletY = Math.round(110 - phase * 134);
        context.fillStyle = weapon === "pierce" ? "#ffdf9c" : "#8decec";
        if (weapon === "twin") {
          for (const x of [48, 96]) {
            context.fillRect(x, bulletY, 3, 12);
            context.fillRect(x, bulletY + 40, 3, 12);
          }
        } else {
          context.fillRect(70, bulletY, 5, 35);
          context.fillStyle = "#fff7dc";
          context.fillRect(72, bulletY + 1, 1, 31);
        }

        context.fillStyle = "#274958";
        context.fillRect(59, 112, 28, 17);
        context.fillStyle = "#f8e3b5";
        context.fillRect(65, 110, 16, 12);
        context.fillStyle = "#b1ffff";
        if (weapon === "twin") {
          context.fillRect(46, 107, 7, 13);
          context.fillRect(94, 107, 7, 13);
          context.fillStyle = "#527c89";
          context.fillRect(49, 119, 49, 4);
        } else {
          context.fillRect(68, 103, 9, 13);
        }
      }
      if (!reducedMotion) frame = requestAnimationFrame(draw);
    };
    draw(started + 33);
    return () => cancelAnimationFrame(frame);
  }, [weapon]);

  return <canvas ref={canvasRef} width={144} height={136} aria-hidden="true" className="w-full [image-rendering:pixelated]" />;
};
