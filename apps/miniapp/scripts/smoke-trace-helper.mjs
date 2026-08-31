import { constants, accessSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { isAbsolute } from "node:path";

const showOptionPriority = [
  "double-take",
  "headline-break",
  "wide-angle",
  "clean-cut",
  "xingtong-assist",
  "xiangwan-assist",
  "nana7mi-assist",
  "bella-assist",
  "lulu-assist",
  "safety-chat",
  "snack-drop",
  "cohost-cue",
  "instant-replay",
  "no-dead-air",
  "sticky-comment",
  "close-call",
  "still-live",
  "jiaran-assist",
  "nailu-assist",
];

const storyOptionPriority = [
  "delete-learned-reply",
  "join-encore-with-consent",
  "mark-missing-loss",
  "share-one-overnight",
  "post-caption-correction",
  "keep-both-rooms",
  "recreate-photo-later",
  "publish-seven-approved-notes",
];

const chooseByPriority = (available, priority, label) => {
  if (!Array.isArray(available) || available.length === 0) {
    throw new Error(`${label} has no available options`);
  }
  return priority.find((candidate) => available.includes(candidate)) ?? available[0];
};

export const chooseSmokeShowOption = (available) =>
  chooseByPriority(available, showOptionPriority, "Show gate");

export const chooseSmokeStoryOption = (available, override) => {
  if (override && available.includes(override)) return override;
  return chooseByPriority(available, storyOptionPriority, "Story scene");
};

const resolveHelper = () => {
  const helper = process.env.SMOKE_TRACE_HELPER ?? "";
  if (!helper || !isAbsolute(helper)) {
    throw new Error("SMOKE_TRACE_HELPER must be an absolute executable path");
  }
  try {
    accessSync(helper, constants.X_OK);
  } catch {
    throw new Error("SMOKE_TRACE_HELPER is not executable");
  }
  return helper;
};

const validateTrace = (trace, expectedTicks) => {
  if (
    trace?.encoding !== "x-position-rle-v1" ||
    trace.ticks !== expectedTicks ||
    !Array.isArray(trace.runs) ||
    trace.runs.length === 0 ||
    trace.runs.length > expectedTicks
  ) {
    throw new Error("Smoke trace helper returned an invalid trace envelope");
  }
  let total = 0;
  let previous = -1;
  let previousCount = 0;
  for (const run of trace.runs) {
    if (
      !Array.isArray(run) ||
      run.length !== 2 ||
      !Number.isInteger(run[0]) ||
      run[0] < 0 ||
      run[0] > 255 ||
      !Number.isInteger(run[1]) ||
      run[1] < 1 ||
      run[1] > 255 ||
      (run[0] === previous && previousCount !== 255)
    ) {
      throw new Error("Smoke trace helper returned invalid RLE tuples");
    }
    previous = run[0];
    previousCount = run[1];
    total += run[1];
  }
  if (total !== expectedTicks) {
    throw new Error("Smoke trace helper returned the wrong tick count");
  }
  return trace;
};

export const createAuthoritySmokeTrace = (runtimeConfig) => {
  const expectedTicks = runtimeConfig?.duration_ticks;
  if (!Number.isInteger(expectedTicks) || expectedTicks <= 0) {
    throw new Error("Segment runtime_config is missing duration_ticks");
  }
  const output = execFileSync(resolveHelper(), [], {
    input: JSON.stringify(runtimeConfig),
    encoding: "utf8",
    maxBuffer: 1_048_576,
    timeout: 30_000,
  });
  let trace;
  try {
    trace = JSON.parse(output);
  } catch {
    throw new Error("Smoke trace helper returned malformed JSON");
  }
  return validateTrace(trace, expectedTicks);
};
