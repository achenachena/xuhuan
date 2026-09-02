import type {
  ShooterContent,
  ShooterSegment,
} from "@/lib/api/types";

export type PortfolioDemoStage = ShooterSegment;

export type PortfolioDemoOption = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly boss: PortfolioDemoStage;
};

export type PortfolioDemoManifest = {
  readonly version: "demo-v1";
  readonly locale: "en" | "zh-CN";
  readonly content: ShooterContent;
  readonly wave: PortfolioDemoStage;
  readonly options: readonly PortfolioDemoOption[];
};
