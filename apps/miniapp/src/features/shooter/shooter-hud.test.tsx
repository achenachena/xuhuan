import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ShooterHUD } from "@/features/shooter/shooter-hud";
import { createShooterRuntime, createShooterSimulation } from "@/features/shooter/simulation";
import { v4Runtime } from "@/test/v4-fixtures";
import zhCN from "@/locales/zh-CN.json";

const locale = vi.hoisted(() => ({ language: "en" as "en" | "zh-CN" }));
vi.mock("@/components/providers/use-locale", () => ({ default: () => locale }));

describe("ShooterHUD shield indicator", () => {
  beforeEach(() => { locale.language = "en"; });

  it("shows the existing shield beside ON AIR and removes it once consumed", () => {
    const snapshot = createShooterSimulation(createShooterRuntime(v4Runtime)).snapshot();
    const { rerender } = render(<ShooterHUD snapshot={{ ...snapshot, shield: 1 }} segmentIndex={0} boss={false} />);
    expect(screen.getByRole("img", { name: "Shield ready" })).toBeInTheDocument();
    expect(screen.getByText("ON AIR")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    rerender(<ShooterHUD snapshot={{ ...snapshot, shield: 0 }} segmentIndex={0} boss={false} />);
    expect(screen.queryByRole("img", { name: "Shield ready" })).not.toBeInTheDocument();
  });

  it("localizes the shield without adding a separate status panel", () => {
    locale.language = "zh-CN";
    const snapshot = createShooterSimulation(createShooterRuntime(v4Runtime)).snapshot();
    render(<ShooterHUD snapshot={{ ...snapshot, shield: 1 }} segmentIndex={0} boss={false} />);
    expect(screen.getByRole("img", { name: zhCN.shieldReady })).toBeInTheDocument();
    expect(screen.getAllByTestId("shooter-hud")).toHaveLength(1);
  });
});
