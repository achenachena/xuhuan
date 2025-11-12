"use client";

import { useEffect, useState } from "react";
import type { Character } from "@xuhuan/game-types";
import { generateCharacterPortrait, avatarToDataUrl } from "@/lib/avatar-generator";
import clsx from "clsx";

type HealthBarTopProps = {
  readonly character: Character;
  readonly currentHealth: number;
  readonly maxHealth: number;
  readonly specialMeter: number;
  readonly comboCount: number;
  readonly isBlocking: boolean;
  readonly alignment: "left" | "right";
};

const HealthBarTop = ({
  character,
  currentHealth,
  maxHealth,
  specialMeter,
  comboCount,
  isBlocking,
  alignment
}: HealthBarTopProps) => {
  const [portraitUrl, setPortraitUrl] = useState<string>("");
  const [useFallback, setUseFallback] = useState<boolean>(false);

  useEffect(() => {
    // Use real portrait URL if available, otherwise fallback to generator
    if (character.portraitUrl && !useFallback) {
      setPortraitUrl(character.portraitUrl);
    } else {
      const svgString = generateCharacterPortrait(character, 80);
      const dataUrl = avatarToDataUrl(svgString);
      setPortraitUrl(dataUrl);
    }
  }, [character, useFallback]);

  const handleImageError = () => {
    setUseFallback(true);
  };

  const healthPercentage = Math.max(0, Math.min(100, (currentHealth / maxHealth) * 100));
  const isLowHealth = healthPercentage < 30;
  const isCriticalHealth = healthPercentage < 15;

  return (
    <div
      className={clsx(
        "flex items-center gap-3 p-3 bg-black/60 backdrop-blur-sm rounded-xl border-2",
        {
          "flex-row": alignment === "left",
          "flex-row-reverse": alignment === "right",
          "border-red-500 animate-pulse": isCriticalHealth,
          "border-yellow-500": isLowHealth && !isCriticalHealth,
          "border-white/20": !isLowHealth
        }
      )}
      style={{
        borderColor: !isLowHealth ? `${character.colorTheme}40` : undefined
      }}
    >
      {/* Portrait */}
      <div className="relative flex-shrink-0">
        <div
          className="w-16 h-16 rounded-full overflow-hidden border-2"
          style={{ borderColor: character.colorTheme }}
        >
          {portraitUrl && (
            <img
              src={portraitUrl}
              alt={`${character.name} portrait`}
              className="w-full h-full object-cover"
              onError={handleImageError}
            />
          )}
        </div>

        {/* Blocking indicator */}
        {isBlocking && (
          <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-xs animate-pulse">
            🛡️
          </div>
        )}

        {/* Combo indicator */}
        {comboCount > 0 && (
          <div
            className={clsx(
              "absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
              {
                "bg-orange-500 animate-pulse": comboCount >= 3,
                "bg-yellow-500": comboCount < 3
              }
            )}
          >
            {comboCount}
          </div>
        )}
      </div>

      {/* Stats Container */}
      <div className="flex-1 min-w-0">
        {/* Name */}
        <div className={clsx("flex items-baseline gap-1 mb-1", {
          "justify-start": alignment === "left",
          "justify-end flex-row-reverse": alignment === "right"
        })}>
          <h3
            className="text-sm font-bold tracking-tight truncate"
            style={{ color: character.colorTheme, maxWidth: "calc(100% - 40px)" }}
            title={character.name}
          >
            {character.name}
          </h3>
          <span className="text-[10px] text-white/60 uppercase tracking-wide flex-shrink-0">
            Lv.{character.baseHealth > 100 ? 3 : 2}
          </span>
        </div>

        {/* Health Bar */}
        <div className="mb-1.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-white/80 font-semibold">HP</span>
            <span className="text-xs text-white/90 font-bold">
              {currentHealth}/{maxHealth}
            </span>
          </div>
          <div className="h-3 bg-black/50 rounded-full overflow-hidden border border-white/20">
            <div
              className={clsx(
                "h-full rounded-full transition-all duration-300",
                {
                  "bg-gradient-to-r from-red-600 to-red-400 animate-pulse": isCriticalHealth,
                  "bg-gradient-to-r from-yellow-600 to-yellow-400": isLowHealth && !isCriticalHealth
                }
              )}
              style={{
                width: `${healthPercentage}%`,
                backgroundColor: !isLowHealth ? character.colorTheme : undefined
              }}
            />
          </div>
        </div>

        {/* Special Meter */}
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[9px] text-purple-300/80 font-semibold uppercase tracking-tight">
              SPECIAL
            </span>
            <span className="text-[9px] text-purple-300/90 font-bold">
              {specialMeter}/100
            </span>
          </div>
          <div className="h-1.5 bg-black/50 rounded-full overflow-hidden border border-purple-500/30">
            <div
              className={clsx(
                "h-full rounded-full bg-gradient-to-r from-purple-600 to-pink-500 transition-all duration-300",
                {
                  "animate-pulse shadow-lg shadow-purple-500/50": specialMeter >= 50
                }
              )}
              style={{ width: `${specialMeter}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default HealthBarTop;
