"use client";

import { useState } from "react";
import type { Character } from "@xuhuan/game-types";
import { useCharacters } from "@/hooks/use-characters";
import CharacterCard from "./character-card";

type CharacterSelectProps = {
  readonly onCharacterSelected: (character: Character) => void;
};

const CharacterSelect = ({ onCharacterSelected }: CharacterSelectProps) => {
  const { characters, isLoading, error } = useCharacters();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const handleSelect = (character: Character): void => {
    setSelectedSlug(character.slug);
  };

  const handleConfirm = (): void => {
    const selectedCharacter = characters.find((char) => char.slug === selectedSlug);
    if (selectedCharacter) {
      onCharacterSelected(selectedCharacter);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 to-black">
        <div className="text-center">
          <div className="mb-4 text-6xl animate-bounce">⚔️</div>
          <p className="text-xl text-white font-semibold">Loading fighters...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 to-black">
        <div className="text-center max-w-md px-4">
          <div className="mb-4 text-6xl">❌</div>
          <p className="text-xl text-red-400 font-semibold mb-2">Failed to load characters</p>
          <p className="text-sm text-white/60">{error.message}</p>
        </div>
      </div>
    );
  }

  if (characters.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 to-black">
        <div className="text-center">
          <div className="mb-4 text-6xl">🎭</div>
          <p className="text-xl text-white font-semibold">No characters available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/30 to-black p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mx-auto max-w-7xl mb-8 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold text-white mb-2 tracking-tight">
          Choose Your Fighter
        </h1>
        <p className="text-base sm:text-lg text-white/70">
          Select a VTuber to represent you in battle
        </p>
      </div>

      {/* Character Grid */}
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {characters.map((character) => (
            <CharacterCard
              key={character.id}
              character={character}
              isSelected={selectedSlug === character.slug}
              onSelect={() => {
                handleSelect(character);
              }}
            />
          ))}
        </div>

        {/* Confirm Button */}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedSlug}
            className={`
              px-8 py-4 rounded-2xl text-lg font-bold uppercase tracking-wider
              transition-all duration-300 transform
              ${
                selectedSlug
                  ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:scale-105 hover:shadow-2xl shadow-green-500/50"
                  : "bg-gray-700 text-gray-400 cursor-not-allowed opacity-50"
              }
            `}
            aria-label="Confirm character selection"
          >
            {selectedSlug ? "Ready to Fight! ⚔️" : "Select a Character"}
          </button>
        </div>
      </div>

      {/* Character Bio Overlay (for selected character) */}
      {selectedSlug && (
        <div className="fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-md border-t border-white/10 p-4 sm:p-6 z-50">
          {(() => {
            const selectedCharacter = characters.find((char) => char.slug === selectedSlug);
            if (!selectedCharacter) return null;

            return (
              <div className="mx-auto max-w-4xl">
                <h3 className="text-2xl font-bold text-white mb-2" style={{ color: selectedCharacter.colorTheme }}>
                  {selectedCharacter.name}
                </h3>
                <p className="text-sm text-white/80 mb-3">{selectedCharacter.bio}</p>
                <div className="flex items-center gap-2 text-xs text-white/60">
                  <span className="px-2 py-1 rounded bg-white/10">
                    {selectedCharacter.vtuberArchetype.replace("-", " ").toUpperCase()}
                  </span>
                  <span>•</span>
                  <span>⚡ {selectedCharacter.specialMoveName}</span>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

export default CharacterSelect;
