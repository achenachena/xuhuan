import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { toPresentationCharacter } from "@/lib/api/presentation";
import { testCharacter } from "@/test/fixtures";

const useCharacters = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-characters", () => ({ useCharacters }));
vi.mock("@/components/providers/use-locale", () => ({
  default: () => ({ translate: (key: string) => key, isReady: true, language: "zh-CN" })
}));
vi.mock("@/components/character-card", () => ({
  default: ({ character, onSelect }: { character: { name: string }; onSelect: () => void }) => (
    <button type="button" onClick={onSelect}>
      {character.name}
    </button>
  )
}));

import CharacterSelect from "@/components/character-select";

describe("CharacterSelect", () => {
  beforeEach(() => {
    useCharacters.mockReturnValue({
      characters: [toPresentationCharacter(testCharacter)],
      isLoading: false,
      error: undefined
    });
  });

  it("renders loading and error states from the API hook", () => {
    useCharacters.mockReturnValueOnce({ characters: [], isLoading: true, error: undefined });
    const { rerender } = render(<CharacterSelect onCharacterSelected={vi.fn()} />);
    expect(screen.getByText("characterSelect.loading")).toBeInTheDocument();

    useCharacters.mockReturnValueOnce({ characters: [], isLoading: false, error: new Error("offline") });
    rerender(<CharacterSelect onCharacterSelected={vi.fn()} />);
    expect(screen.getByText("characterSelect.error")).toBeInTheDocument();
  });

  it("keeps the confirmation action disabled while a start request is pending", () => {
    render(<CharacterSelect onCharacterSelected={vi.fn()} isConfirming />);
    fireEvent.click(screen.getByRole("button", { name: testCharacter.name }));
    expect(screen.getByRole("button", { name: "characterSelect.confirm.ariaLabel" })).toBeDisabled();
  });
});
