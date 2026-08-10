import type { Character } from "@xuhuan/game-types";

import type { APICharacter, APIEncounter } from "@/lib/api/client";

export const toPresentationCharacter = (character: APICharacter): Character => ({
  id: character.id,
  slug: character.slug,
  name: character.name,
  vtuberArchetype: character.archetype,
  bio: character.biography,
  portraitUrl: character.portrait_url,
  spriteUrl: character.model_url,
  baseHealth: character.base_health,
  baseAttack: character.base_attack,
  baseDefense: character.base_defense,
  baseSpeed: character.base_speed,
  specialMoveName: character.special_move_name,
  specialMoveDesc: character.special_move_description,
  rarity: character.rarity,
  colorTheme: character.color_theme
});

export const encounterToPresentationCharacter = (encounter: APIEncounter): Character => ({
  id: encounter.id,
  slug: encounter.slug,
  name: encounter.name,
  vtuberArchetype: "chaotic",
  bio: encounter.description,
  portraitUrl: encounter.image_url ?? "",
  spriteUrl: encounter.image_url ?? "",
  baseHealth: encounter.max_health,
  baseAttack: encounter.attack,
  baseDefense: encounter.defense,
  baseSpeed: encounter.speed,
  specialMoveName: encounter.special_move_name,
  specialMoveDesc: encounter.special_move_description,
  rarity: encounter.level >= 5 ? "legendary" : "rare",
  colorTheme: encounter.color_theme
});
