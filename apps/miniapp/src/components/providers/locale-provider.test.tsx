import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import LanguageToggle from "@/components/language-toggle";
import LocaleProvider from "@/components/providers/locale-provider";
import { gameText } from "@/features/game/game-copy";

describe("LocaleProvider", () => {
  beforeEach(() => window.localStorage.clear());

  it("defaults to English and persists a switch to Chinese", async () => {
    render(
      <LocaleProvider>
        <LanguageToggle />
      </LocaleProvider>,
    );

    const toggle = screen.getByRole("button", {
      name: "Switch language to Chinese",
    });
    expect(toggle).toHaveTextContent("ZH");
    fireEvent.click(toggle);

    expect(
      screen.getByRole("button", {
        name: gameText("zh-CN", "switchToEnglish"),
      }),
    ).toHaveTextContent("EN");
    expect(window.localStorage.getItem("xuhuan.locale.v1")).toBe("zh-CN");
    await waitFor(() => expect(document.documentElement.lang).toBe("zh-CN"));
  });
});
