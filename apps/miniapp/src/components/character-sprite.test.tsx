import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import CharacterSprite from "@/components/character-sprite";
import { toPresentationCharacter } from "@/lib/api/presentation";
import { testCharacter } from "@/test/fixtures";

vi.mock("@/components/providers/use-locale", () => ({
  default: () => ({
    translate: (key: string) => key,
    isReady: true,
    language: "zh-CN"
  })
}));

describe("CharacterSprite", () => {
  it("renders a generated image when the encounter has no artwork", () => {
    const character = {
      ...toPresentationCharacter(testCharacter),
      spriteUrl: ""
    };

    render(<CharacterSprite character={character} animationState="idle" />);

    expect(screen.getByRole("img", { name: "characterSprite.alt" })).toHaveAttribute(
      "src",
      expect.stringMatching(/^data:image\/svg\+xml/)
    );
  });

  it("switches to the generated image after a remote sprite fails", () => {
    const character = {
      ...toPresentationCharacter(testCharacter),
      spriteUrl: "https://lsx1nt3pdo55zsho.public.blob.vercel-storage.com/broken-model.png"
    };
    render(<CharacterSprite character={character} animationState="damage" />);
    const remoteImage = screen.getByRole("img", {
      name: "characterSprite.alt"
    });

    expect(remoteImage.getAttribute("src")).toContain("broken-model.png");
    fireEvent.error(remoteImage);

    expect(screen.getByRole("img", { name: "characterSprite.alt" })).toHaveAttribute(
      "src",
      expect.stringMatching(/^data:image\/svg\+xml/)
    );
  });
});
