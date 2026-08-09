import { describe, expect, it } from "vitest";

import en from "@/lib/localization/locales/en";
import zhCN from "@/lib/localization/locales/zh-CN";

const supportedArchetypes = [
  "idol",
  "artist",
  "gamer",
  "singer",
  "seiso",
  "apex-predator",
  "chaotic"
] as const;

describe("bundled locale character archetypes", () => {
  it.each([
    ["en", en],
    ["zh-CN", zhCN]
  ])("defines every supported archetype in %s", (_language, bundle) => {
    for (const archetype of supportedArchetypes) {
      const key = `characterCard.archetype.${archetype}`;
      expect(bundle[key]).toBeTruthy();
      expect(bundle[key]).not.toBe(key);
    }
  });
});
