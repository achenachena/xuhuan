import {
  SHOOTER_INPUT_COLUMNS,
  SHOOTER_MAX_TICKS,
  clamp,
} from "@/features/shooter/constants";
import type { ShooterInput } from "@/features/shooter/input";
import type { ShooterTrace } from "@/lib/api/types";

export const packShooterInput = (input: ShooterInput): number =>
  clamp(Math.round(input.x), 0, SHOOTER_INPUT_COLUMNS - 1) |
  (input.rescue ? 0x80 : 0);

export const unpackShooterInput = (packed: number): ShooterInput => ({
  x: packed & 0x7f,
  rescue: (packed & 0x80) !== 0,
});

export class ShooterTraceRecorder {
  private readonly frames: number[] = [];

  get ticks(): number {
    return this.frames.length;
  }

  push(input: ShooterInput): void {
    if (this.frames.length >= SHOOTER_MAX_TICKS) {
      throw new Error("Shooter trace exceeds the maximum segment length");
    }
    this.frames.push(packShooterInput(input));
  }

  pad(input: ShooterInput, exactTicks: number): void {
    while (this.frames.length < exactTicks) this.push(input);
  }

  encode(): ShooterTrace {
    if (this.frames.length === 0) {
      throw new Error("Cannot encode an empty shooter trace");
    }
    const runs: [number, number][] = [];
    for (let index = 0; index < this.frames.length; ) {
      const input = this.frames[index]!;
      let count = 1;
      while (
        index + count < this.frames.length &&
        this.frames[index + count] === input &&
        count < 255
      ) {
        count += 1;
      }
      runs.push([input, count]);
      index += count;
    }
    return {
      encoding: "x-position-rle-v1",
      ticks: this.frames.length,
      runs,
    };
  }
}

export const validateShooterTrace = (trace: ShooterTrace): boolean => {
  if (
    trace.encoding !== "x-position-rle-v1" ||
    !Number.isSafeInteger(trace.ticks) ||
    trace.ticks <= 0 ||
    trace.ticks > SHOOTER_MAX_TICKS ||
    trace.runs.length === 0 ||
    trace.runs.length > trace.ticks
  ) {
    return false;
  }
  let ticks = 0;
  let previousInput = -1;
  let previousCount = 0;
  for (const run of trace.runs) {
    if (
      !Array.isArray(run) ||
      run.length !== 2 ||
      !Number.isSafeInteger(run[0]) ||
      run[0] < 0 ||
      run[0] > 255 ||
      !Number.isSafeInteger(run[1]) ||
      run[1] < 1 ||
      run[1] > 255 ||
      (run[0] === previousInput && previousCount < 255)
    ) {
      return false;
    }
    previousInput = run[0];
    previousCount = run[1];
    ticks += run[1];
    if (ticks > trace.ticks) return false;
  }
  return ticks === trace.ticks;
};
