import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RunResultScreen } from "@/features/game/run-result-screen";
import { createV4Run, v4BaseState, v4Content } from "@/test/v4-fixtures";

describe("campaign conclusion", () => {
  it.each(["cleared", "failed", "abandoned"] as const)("offers replay and backstage after %s", (outcome) => {
    const onReplay = vi.fn();
    const onContinue = vi.fn();
    render(<RunResultScreen content={v4Content} locale="en" busy={false}
      run={createV4Run({ status: "completed", outcome, state: { ...v4BaseState, phase: "completed", segment: undefined } })}
      onContinue={onContinue} onReplay={onReplay} />);
    fireEvent.click(screen.getByRole("button", { name: "Play again" }));
    fireEvent.click(screen.getByRole("button", { name: "Return to backstage" }));
    expect(onReplay).toHaveBeenCalledTimes(1);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
