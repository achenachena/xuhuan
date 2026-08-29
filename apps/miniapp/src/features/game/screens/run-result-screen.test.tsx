import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RunResultScreen } from "@/features/game/screens/run-result-screen";
import { createV3Run, v3BaseState } from "@/test/v3-fixtures";

const writeText = vi.fn<() => Promise<void>>();

vi.mock("@twa-dev/sdk", () => ({
  default: { platform: "unknown" },
}));

describe("RunResultScreen", () => {
  beforeEach(() => {
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  it("shares a cleared daily result directly by its anonymous run ID", async () => {
    const run = createV3Run({
      mode: "daily",
      status: "completed",
      outcome: "cleared",
      state: { ...v3BaseState, phase: "completed", score: 4242 },
    });

    render(
      <RunResultScreen
        run={run}
        characterName="Nana7mi"
        locale="en"
        busy={false}
        onContinue={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("share-daily-result"));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        `${window.location.origin}/daily/${run.id}`,
      ),
    );
    expect(screen.getByTestId("share-daily-result")).toHaveTextContent(
      "Share link copied",
    );
  });
});
