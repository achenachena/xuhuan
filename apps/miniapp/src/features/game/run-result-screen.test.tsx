import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RunResultScreen } from "@/features/game/run-result-screen";
import { createV4Run, v4BaseState, v4Content } from "@/test/v4-fixtures";

describe("campaign conclusion", () => {
  it.each(["cleared", "failed", "abandoned"] as const)("offers the appropriate next action after %s", (outcome) => {
    const onReplay = vi.fn();
    const onContinue = vi.fn();
    render(<RunResultScreen content={v4Content} locale="en" busy={false}
      run={createV4Run({ status: "completed", outcome, state: { ...v4BaseState, phase: "completed", segment: undefined } })}
      onContinue={onContinue} onReplay={onReplay} />);
    if (outcome === "cleared") expect(screen.queryByTestId("replay-run")).not.toBeInTheDocument();
    else { fireEvent.click(screen.getByRole("button", { name: "Try again" })); expect(onReplay).toHaveBeenCalledTimes(1); }
    fireEvent.click(screen.getByTestId("return-to-hub"));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
