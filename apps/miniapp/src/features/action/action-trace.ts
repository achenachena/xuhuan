import type { ActionInput, ActionTrace } from "@/features/action/action-types";

const encodeBase64URL = (bytes: readonly number[]): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=+$/, "");
};

export class TraceRecorder {
  private readonly controls: number[] = [];

  push(input: ActionInput): void {
    this.controls.push(
      (input.direction & 0x0f) |
        ((input.magnitude & 0x03) << 4) |
        (input.skill ? 0x40 : 0),
    );
  }

  padNeutralTo(ticks: number): void {
    while (this.controls.length < ticks) this.controls.push(0);
  }

  encode(): ActionTrace {
    const bytes: number[] = [];
    for (let index = 0; index < this.controls.length; ) {
      const control = this.controls[index]!;
      let count = 1;
      while (
        index + count < this.controls.length &&
        this.controls[index + count] === control &&
        count < 255
      ) {
        count += 1;
      }
      bytes.push(control, count);
      index += count;
    }
    return {
      encoding: "rle8-v1",
      ticks: this.controls.length,
      data: encodeBase64URL(bytes),
    };
  }
}
