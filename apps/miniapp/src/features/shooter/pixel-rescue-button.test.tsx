import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PixelRescueButton } from "@/features/shooter/pixel-rescue-button";
import zhCN from "@/locales/zh-CN.json";

const locale = vi.hoisted(() => ({ language: "en" as "en" | "zh-CN" }));
vi.mock("@/components/providers/use-locale", () => ({ default: () => locale }));

describe("PixelRescueButton", () => {
  beforeEach(() => { locale.language = "en"; });

  it("fills the penlight from the existing charge without allowing an early rescue", () => {
    const onRescue = vi.fn();
    const { container, rerender } = render(<PixelRescueButton charge={35} onRescue={onRescue} />);
    const button = screen.getByRole("button", { name: "Build Hype with near misses and support pickups (35%)" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("title", "HYPE: 35%");
    expect(button).toHaveAttribute("data-state", "charging");
    expect(container.querySelector("[style]")).toHaveStyle({ clipPath: "inset(65% 0 0)" });
    fireEvent.click(button);
    expect(onRescue).not.toHaveBeenCalled();

    rerender(<PixelRescueButton charge={100} onRescue={onRescue} />);
    expect(screen.getByRole("button", { name: "Rescue ready" })).toBe(button);
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute("aria-disabled", "false");
    expect(button).toHaveAttribute("data-state", "ready");
    fireEvent.click(button);
    expect(onRescue).toHaveBeenCalledTimes(1);
  });

  it("blocks a full charge while a segment is busy", () => {
    const onRescue = vi.fn();
    render(<PixelRescueButton charge={100} busy onRescue={onRescue} />);
    const button = screen.getByTestId("rescue-button");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("data-state", "busy");
    fireEvent.click(button);
    expect(onRescue).not.toHaveBeenCalled();
  });

  it("uses localized accessible labels and hides decorative pixel artwork", () => {
    locale.language = "zh-CN";
    const { container } = render(<PixelRescueButton charge={100} onRescue={vi.fn()} />);
    expect(screen.getByRole("button", { name: zhCN.rescueReady })).toHaveTextContent(zhCN.rescue);
    expect(screen.getByTestId("rescue-button")).toHaveAttribute("title", `${zhCN.hype}: 100%`);
    expect(container.querySelectorAll('svg[aria-hidden="true"][focusable="false"]')).toHaveLength(2);
  });

  it.each([[-20, 0], [140, 100], [Number.NaN, 0]])("clamps visual charge %s to %s", (charge, expected) => {
    render(<PixelRescueButton charge={charge} onRescue={vi.fn()} />);
    expect(screen.getByTestId("rescue-button")).toHaveAttribute("title", `HYPE: ${expected}%`);
  });
});
