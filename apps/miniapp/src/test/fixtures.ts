import type { APIBattle, APICharacter, APIEncounter } from "@/lib/api/client";

export const testCharacter: APICharacter = {
  id: "d045d8f2-1ec9-41f4-8f1c-8a0224d70db8",
  slug: "nana7mi",
  name: "七海Nana7mi",
  biography: "测试角色",
  archetype: "idol",
  base_health: 100,
  base_attack: 28,
  base_defense: 22,
  base_speed: 18,
  base_crit_rate: 0.12,
  base_crit_damage: 0.45,
  special_move_name: "星海",
  special_move_description: "测试技能",
  special_move_type: "energy",
  rarity: "legendary",
  color_theme: "#38BDF8",
  portrait_url: "https://assets.example/portrait.png",
  model_url: "https://assets.example/model.png"
};

export const testEncounter: APIEncounter = {
  id: "4c148b96-587d-4623-bb74-f17c90445f15",
  slug: "training-drone",
  name: "训练无人机",
  description: "测试对手",
  level: 1,
  max_health: 90,
  attack: 20,
  defense: 16,
  speed: 12,
  crit_rate: 0.08,
  crit_damage: 0.35,
  special_move_name: "脉冲",
  special_move_description: "测试技能",
  color_theme: "#64748B",
  image_url: null
};

export const createTestBattle = (overrides: Partial<APIBattle> = {}): APIBattle => ({
  id: "c8c6d56d-974f-4c82-8a83-a3c20e736e38",
  status: "active",
  outcome: null,
  version: 1,
  turn: 1,
  character: testCharacter,
  encounter: testEncounter,
  hero: {
    slug: testCharacter.slug,
    name: testCharacter.name,
    level: 1,
    max_health: 100,
    current_health: 100,
    attack: 28,
    defense: 22,
    speed: 18,
    crit_rate: 0.12,
    crit_damage: 0.45,
    special_meter: 50,
    combo_count: 0,
    is_blocking: false
  },
  enemy: {
    slug: testEncounter.slug,
    name: testEncounter.name,
    level: 1,
    max_health: 90,
    current_health: 90,
    attack: 20,
    defense: 16,
    speed: 12,
    crit_rate: 0.08,
    crit_damage: 0.35,
    special_meter: 0,
    combo_count: 0,
    is_blocking: false
  },
  rewards: null,
  created_at: "2026-08-06T12:00:00Z",
  updated_at: "2026-08-06T12:00:00Z",
  completed_at: null,
  ...overrides
});
