import type { components } from "@/lib/api/generated";

type Schemas = components["schemas"];

export type GameLocale = Schemas["GameContent"]["locale"];

export type ShooterEnemySpec = Schemas["RuntimeEnemy"];
export type ShooterBossStage = Schemas["RuntimeBossStage"];
export type ShooterBoss = Schemas["RuntimeBoss"];
export type ShooterRuntimeConfig = Schemas["RuntimeConfig"];

export type ShooterChapterContent = Schemas["LocalizedChapter"];
export type ShooterStoryMessage = Schemas["LocalizedBubble"];
export type ShooterStoryOption = Pick<
  Schemas["LocalizedStoryChoice"],
  "id" | "label"
> & {
  readonly hint?: string;
};

/** Localized view model resolved from a wire RunStory and immutable V4 content. */
export type ShooterStoryScene = {
  readonly id: string;
  readonly title?: string;
  readonly messages: readonly ShooterStoryMessage[];
  readonly options: readonly ShooterStoryOption[];
};

export type ShooterContent = Schemas["GameContent"];
export type ShooterSegment = Schemas["SegmentState"];
export type ShooterRunState = Schemas["RunState"];
export type ShooterGameRun = Schemas["GameRun"];
export type ShooterGameSnapshot = Schemas["GameSnapshot"];
export type ShooterCreateRunRequest = Schemas["CreateRunRequest"];
export type ShooterRunCommand = Schemas["RunCommandRequest"];

export type ShooterRunCommandInput = ShooterRunCommand extends infer Command
  ? Command extends ShooterRunCommand
    ? Omit<Command, "expected_version">
    : never
  : never;

export type ShooterRunCommandResponse = Schemas["RunCommandResponse"];
export type ShooterSegmentOutcome = Schemas["SegmentOutcome"];
export type APIDailyResult = Schemas["DailyResult"];
export type APIErrorEnvelope = Schemas["ErrorEnvelope"];
