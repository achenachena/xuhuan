"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import type { Character } from "@xuhuan/game-types";
import { generateCharacterAvatar, avatarToDataUrl } from "@/lib/avatar-generator";
import useLocale from "@/components/providers/use-locale";

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
  const { translate } = useLocale();
  const [failedSpriteUrl, setFailedSpriteUrl] = useState<string | null>(null);
  const fallbackSpriteUrl = useMemo(
    () => avatarToDataUrl(generateCharacterAvatar(character, animationState, 280 * scale)),
    [animationState, character, scale]
  );
  const spriteUrl =
    character.spriteUrl && character.spriteUrl !== failedSpriteUrl
      ? character.spriteUrl
      : fallbackSpriteUrl;

  const handleImageError = () => {
    if (character.spriteUrl && spriteUrl === character.spriteUrl) {
      setFailedSpriteUrl(character.spriteUrl);
    }
  };

  const getAnimationClasses = (): string => {
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
      className={`relative transition-all duration-300 ${getAnimationClasses()} flex items-end justify-center`}
      style={{
        transform: flip ? "scaleX(-1)" : "scaleX(1)",
        transformOrigin: "center",
        height: "300px",
        width: "180px",
        margin: "0 auto"
      }}
    >
      {spriteUrl && (
        <Image
          src={spriteUrl}
          alt={translate("characterSprite.alt", { name: character.name })}
          width={180}
          height={300}
          sizes="180px"
          loading="eager"
          style={{
            filter: animationState === "damage" ? "brightness(1.5) saturate(0.5)" : "none",
            imageRendering: "crisp-edges",
            objectFit: "contain",
            objectPosition: "center bottom",
            width: "180px",
            height: "300px"
          }}
          onError={handleImageError}
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
