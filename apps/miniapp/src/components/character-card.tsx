"use client";

import { useEffect, useState } from "react";
import type { Character } from "@xuhuan/game-types";
import { generateCharacterPortrait, avatarToDataUrl } from "@/lib/avatar-generator";
import clsx from "clsx";

type CharacterCardProps = {
  readonly character: Character;
  readonly isSelected: boolean;
  readonly onSelect: () => void;
};

const CHARACTER_CARD_HEIGHT = "320px";

const CharacterCard = ({ character, isSelected, onSelect }: CharacterCardProps) => {
  const [portraitUrl, setPortraitUrl] = useState<string>("");

  useEffect(() => {
    const svgString = generateCharacterPortrait(character, 160);
    const dataUrl = avatarToDataUrl(svgString);
    setPortraitUrl(dataUrl);
  }, [character]);

  const rarityColors = {
    common: "from-gray-500 to-gray-700",
    rare: "from-blue-500 to-blue-700",
    epic: "from-purple-500 to-purple-700",
    legendary: "from-yellow-500 to-orange-600"
  };

  const rarityGradient = rarityColors[character.rarity as keyof typeof rarityColors] || rarityColors.common;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={clsx(
        "group relative w-full overflow-hidden rounded-2xl border-2 transition-all duration-300",
        "hover:scale-105 hover:shadow-2xl",
        isSelected
          ? `border-4 shadow-2xl ${character.colorTheme ? `shadow-[${character.colorTheme}]` : "shadow-white"}`
          : "border-white/20 hover:border-white/40"
      )}
      style={{
        borderColor: isSelected ? character.colorTheme : undefined,
        minHeight: CHARACTER_CARD_HEIGHT
      }}
      aria-label={`Select ${character.name}`}
    >
      {/* Background gradient */}
      <div
        className={`absolute inset-0 bg-gradient-to-br ${rarityGradient} opacity-20 group-hover:opacity-30 transition-opacity`}
      />

      {/* Selected glow effect */}
      {isSelected && (
        <div
          className="absolute inset-0 animate-pulse"
          style={{
            background: `radial-gradient(circle at center, ${character.colorTheme}40 0%, transparent 70%)`
          }}
        />
      )}

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center p-4 text-white">
        {/* Portrait */}
        <div className="mb-4 w-32 h-32 rounded-full overflow-hidden border-4 border-white/30 bg-black/30">
          {portraitUrl && (
            <img
              src={portraitUrl}
              alt={`${character.name} portrait`}
              className="w-full h-full object-cover"
            />
          )}
        </div>

        {/* Name and Archetype */}
        <h3 className="text-xl font-bold tracking-tight mb-1" style={{ color: character.colorTheme }}>
          {character.name}
        </h3>
        <p className="text-xs uppercase tracking-wider text-white/70 mb-2">
          {character.vtuberArchetype.replace("-", " ")}
        </p>

        {/* Rarity Badge */}
        <div className={`mb-3 rounded-full bg-gradient-to-r ${rarityGradient} px-3 py-1`}>
          <span className="text-xs font-bold uppercase tracking-wide text-white">
            {character.rarity}
          </span>
        </div>

        {/* Stats Preview */}
        <div className="w-full mb-3 space-y-1.5">
          {[
            { label: "HP", value: character.baseHealth, max: 120 },
            { label: "ATK", value: character.baseAttack, max: 50 },
            { label: "DEF", value: character.baseDefense, max: 40 },
            { label: "SPD", value: character.baseSpeed, max: 25 }
          ].map((stat) => (
            <div key={stat.label} className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white/80 w-8">{stat.label}</span>
              <div className="flex-1 h-1.5 bg-black/30 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${(stat.value / stat.max) * 100}%`,
                    backgroundColor: character.colorTheme
                  }}
                />
              </div>
              <span className="text-xs font-bold text-white/90 w-6 text-right">{stat.value}</span>
            </div>
          ))}
        </div>

        {/* Special Move */}
        <div className="w-full rounded-lg bg-black/40 p-2 border border-white/10">
          <p className="text-xs font-semibold text-white/90 mb-1">
            ⚡ {character.specialMoveName}
          </p>
          <p className="text-[10px] text-white/70 line-clamp-2">
            {character.specialMoveDesc}
          </p>
        </div>
      </div>

      {/* Selected checkmark */}
      {isSelected && (
        <div className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-lg">
          <span className="text-xl">✓</span>
        </div>
      )}
    </button>
  );
};

export default CharacterCard;
