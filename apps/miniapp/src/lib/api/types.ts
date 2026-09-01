import type { components } from "@/lib/api/generated";

type Schemas = components["schemas"];

export type GameLocale = Schemas["GameContent"]["locale"];

export type ShooterTraceRun = Schemas["InputTrace"]["runs"][number];
export type ShooterTrace = Schemas["InputTrace"];

export type ShooterEffectKind = Schemas["RuntimeEffect"]["kind"];
export type ShooterEffect = Schemas["RuntimeEffect"];
export type ShooterKit = Schemas["RuntimeKit"];
export type ShooterCompanion = Schemas["RuntimeCompanion"];
export type ShooterEnemySpec = Schemas["RuntimeEnemy"];
export type ShooterWaveSpawn = Schemas["Spawn"];
export type ShooterWave = Schemas["Wave"];
export type ShooterBossStage = Schemas["RuntimeBossStage"];
export type ShooterBoss = Schemas["RuntimeBoss"];
export type ShooterLimits = Schemas["RuntimeLimits"];
export type ShooterRuntimeConfig = Schemas["RuntimeConfig"];

export type ShooterRules = Schemas["Rules"];
export type ShooterShowEffectContent = Schemas["LocalizedShowEffect"];
export type ShooterCharacterContent = Schemas["LocalizedCharacter"];
export type ShooterCompanionContent = Schemas["LocalizedCompanion"];
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
export type ShooterStoryState = Schemas["RunStory"];
export type ShooterRunState = Schemas["RunState"];
export type ShooterGameRun = Schemas["GameRun"];
export type ShooterChapterProgress = Schemas["ChapterProgress"];
export type ShooterGameProgress = Schemas["GameProgress"];
export type ShooterGameSnapshot = Schemas["GameSnapshot"];
export type ShooterCreateRunRequest = Schemas["CreateRunRequest"];
export type ShooterRunCommand = Schemas["RunCommandRequest"];

export type ShooterRunCommandInput = ShooterRunCommand extends infer Command
  ? Command extends ShooterRunCommand
    ? Omit<Command, "expected_version">
    : never
  : never;

export type ShooterRunEvent = Schemas["RunEvent"];
export type ShooterRunCommandResponse = Schemas["RunCommandResponse"];
export type APIDailyResult = Schemas["DailyResult"];
export type APIErrorEnvelope = Schemas["ErrorEnvelope"];

export type APIShooterPosition = Schemas["Position"];
export type APIShooterEnemySnapshot = Schemas["EnemySnapshot"];
export type APIShooterProjectileSnapshot = Schemas["ProjectileSnapshot"];
export type APIShooterPickupSnapshot = Schemas["PickupSnapshot"];
export type APIShooterThreatSnapshot = Schemas["ThreatSnapshot"];
export type APIShooterEffectSnapshot = Schemas["VisualEffectSnapshot"];
export type APIShooterSnapshot = Schemas["ShooterSnapshot"];
export type APIShooterResult = Schemas["ShooterResult"];
