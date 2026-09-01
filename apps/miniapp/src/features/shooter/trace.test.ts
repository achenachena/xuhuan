import { describe, expect, it } from "vitest";

import {
  ShooterTraceRecorder,
  packShooterInput,
  unpackShooterInput,
  validateShooterTrace,
} from "@/features/shooter/trace";

describe("x-position-rle-v1", () => {
  it("packs normalized X into seven bits and Rescue into the high bit", () => {
    expect(packShooterInput({ x: 127, rescue: false })).toBe(127);
    expect(packShooterInput({ x: 64, rescue: true })).toBe(192);
    expect(unpackShooterInput(192)).toEqual({ x: 64, rescue: true });
  });

  it("encodes long held positions as canonical adjacent 255-count tuples", () => {
    const recorder = new ShooterTraceRecorder();
    for (let tick = 0; tick < 520; tick += 1) {
      recorder.push({ x: 64, rescue: false });
    }
    const trace = recorder.encode();
    expect(trace).toEqual({
      encoding: "x-position-rle-v1",
      ticks: 520,
      runs: [
        [64, 255],
        [64, 255],
        [64, 10],
      ],
    });
    expect(validateShooterTrace(trace)).toBe(true);
  });

  it("rejects noncanonical duplicate runs when the previous count is not 255", () => {
    expect(
      validateShooterTrace({
        encoding: "x-position-rle-v1",
        ticks: 4,
        runs: [
          [64, 2],
          [64, 2],
        ],
      }),
    ).toBe(false);
  });

  it("rejects invalid controls, counts, and total tick mismatches", () => {
    expect(
      validateShooterTrace({
        encoding: "x-position-rle-v1",
        ticks: 2,
        runs: [[256, 2]],
      }),
    ).toBe(false);
    expect(
      validateShooterTrace({
        encoding: "x-position-rle-v1",
        ticks: 3,
        runs: [[64, 2]],
      }),
    ).toBe(false);
  });
});
