"use client";

import { useState } from "react";
import type { Character } from "@xuhuan/game-types";
import { useCharacters } from "@/hooks/use-characters";
import CharacterCard from "./character-card";
import useLocale from "@/components/providers/use-locale";

type CharacterSelectProps = {
  readonly onCharacterSelected: (character: Character) => void | Promise<void>;
  readonly isConfirming?: boolean;
  readonly actionError?: string | null;
  readonly playerSummary?: {
    readonly level: number;
    readonly credits: number;
    readonly energy: number;
  };
};

const CharacterSelect = ({
  onCharacterSelected,
  isConfirming = false,
  actionError,
  playerSummary
}: CharacterSelectProps) => {
  const { translate, isReady } = useLocale();
  const { characters, isLoading, error } = useCharacters();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const handleSelect = (character: Character): void => {
    setSelectedSlug(character.slug);
  };

  const handleConfirm = (): void => {
    const selectedCharacter = characters.find((char) => char.slug === selectedSlug);
    if (selectedCharacter && !isConfirming) {
      void onCharacterSelected(selectedCharacter);
    }
  };

  if (!isReady) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 to-black">
        <div className="text-center">
          <div className="mb-4 text-6xl animate-bounce">⚔️</div>
          <p className="text-xl text-white font-semibold">{translate("characterSelect.loading")}</p>
        </div>
      </div>
    );
  }

  if (error) {
    console.error(error);
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 to-black">
        <div className="text-center max-w-md px-4">
          <div className="mb-4 text-6xl">❌</div>
          <p className="text-xl text-red-400 font-semibold mb-2">{translate("characterSelect.error")}</p>
          <p className="text-sm text-white/60">{translate("characterSelect.errorHint")}</p>
        </div>
      </div>
    );
  }

  if (characters.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 to-black">
        <div className="text-center">
          <div className="mb-4 text-6xl">🎭</div>
          <p className="text-xl text-white font-semibold">{translate("characterSelect.empty")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/30 to-black">
      {/* Header */}
      <div className="mx-auto max-w-7xl pt-4 pb-6 px-4 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold text-white mb-2 tracking-tight">
          {translate("characterSelect.title")}
        </h1>
        <p className="text-base sm:text-lg text-white/70">
          {translate("characterSelect.subtitle")}
        </p>
        {playerSummary ? (
          <div
            className="mt-3 inline-flex items-center gap-3 rounded-full border border-white/15 bg-black/30 px-4 py-2 text-xs text-white/80"
            data-testid="player-progression"
          >
            <span>Lv. {playerSummary.level}</span>
            <span>💳 {playerSummary.credits}</span>
            <span>⚡ {playerSummary.energy}</span>
          </div>
        ) : null}
        {actionError ? (
          <p className="mx-auto mt-3 max-w-md rounded-xl border border-red-400/40 bg-red-500/15 px-4 py-2 text-sm text-red-100" role="alert">
            {actionError}
          </p>
        ) : null}
      </div>

      {/* Character Grid */}
      <div className={`mx-auto max-w-7xl px-4 ${selectedSlug ? "pb-48" : "pb-24"}`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
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
      </div>

      {/* Fixed Button at Bottom */}
      {selectedSlug && (
        <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black to-transparent p-6 z-40">
          <div className="mx-auto max-w-md">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isConfirming}
              className="w-full px-8 py-4 rounded-2xl text-lg font-bold uppercase tracking-wider
                bg-gradient-to-r from-green-500 to-emerald-600 text-white
                hover:scale-105 hover:shadow-2xl shadow-green-500/50
                transition-all duration-300 transform disabled:cursor-wait disabled:opacity-60 disabled:hover:scale-100"
              aria-label={translate("characterSelect.confirm.ariaLabel")}
            >
              {isConfirming ? "…" : translate("characterSelect.confirm.label")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CharacterSelect;
