"use client";

import { useEffect, useState } from "react";
import type { Character } from "@xuhuan/game-types";
import { generateCharacterAvatar, avatarToDataUrl } from "@/lib/avatar-generator";

type AnimationState = "idle" | "attack" | "damage" | "block" | "special" | "victory" | "defeat";

type CharacterSpriteProps = {
  readonly character: Character;
  readonly animationState: AnimationState;
  readonly scale?: number;
  readonly flip?: boolean;
};

const CharacterSprite = ({
  character,
  animationState,
  scale = 1,
  flip = false
}: CharacterSpriteProps) => {
  const [svgDataUrl, setSvgDataUrl] = useState<string>("");
  const [isAnimating, setIsAnimating] = useState<boolean>(false);

  useEffect(() => {
    const svgString = generateCharacterAvatar(character, animationState, 280 * scale);
    const dataUrl = avatarToDataUrl(svgString);
    setSvgDataUrl(dataUrl);

    // Trigger animation class when state changes
    if (animationState !== "idle") {
      setIsAnimating(true);
      const timeout = setTimeout(() => {
        setIsAnimating(false);
      }, 500);
      return () => {
        clearTimeout(timeout);
      };
    }
  }, [character, animationState, scale]);

  const getAnimationClasses = (): string => {
    if (!isAnimating) {
      return "";
    }

    switch (animationState) {
      case "attack":
        return "animate-attack-pulse";
      case "damage":
        return "animate-damage-shake";
      case "block":
        return "animate-block-bounce";
      case "special":
        return "animate-special-glow";
      case "victory":
        return "animate-victory-bounce";
      case "defeat":
        return "animate-defeat-fade";
      default:
        return "";
    }
  };

  return (
    <div
      className={`relative transition-all duration-300 ${getAnimationClasses()}`}
      style={{
        transform: flip ? "scaleX(-1)" : "scaleX(1)",
        transformOrigin: "center"
      }}
    >
      {svgDataUrl && (
        <img
          src={svgDataUrl}
          alt={`${character.name} sprite`}
          className="w-full h-auto"
          style={{
            filter: animationState === "damage" ? "brightness(1.5) saturate(0.5)" : "none",
            imageRendering: "crisp-edges"
          }}
        />
      )}

      {/* Special move effect overlay */}
      {animationState === "special" && (
        <div
          className="absolute inset-0 rounded-full animate-ping"
          style={{
            background: `radial-gradient(circle, ${character.colorTheme}40 0%, transparent 70%)`,
            pointerEvents: "none"
          }}
        />
      )}

      {/* Block shield effect */}
      {animationState === "block" && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(100, 200, 255, 0.3) 0%, transparent 60%)"
          }}
        >
          <div className="text-6xl animate-pulse">🛡️</div>
        </div>
      )}
    </div>
  );
};

export default CharacterSprite;
