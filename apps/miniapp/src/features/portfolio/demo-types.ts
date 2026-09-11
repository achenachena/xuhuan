import type {
  ShooterContent,
  ShooterSegment,
} from "@/lib/api/types";

export type PortfolioDemoStage = ShooterSegment;

export type PortfolioDemoOption = {
  readonly id: string;
  readonly name: string;
  readonly boss: PortfolioDemoStage;
};

export type PortfolioDemoManifest = {
  readonly version: "demo-v3";
  readonly locale: "en" | "zh-CN";
  readonly opening: string;
  readonly content: ShooterContent;
  readonly wave: PortfolioDemoStage;
  readonly options: readonly PortfolioDemoOption[];
};
