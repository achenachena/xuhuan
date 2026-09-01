export const shooterSeedFromString = (seed: string): number => {
  let value = 2_166_136_261;
  const bytes = new TextEncoder().encode(seed);
  for (let index = 0; index < bytes.length; index += 1) {
    value ^= bytes[index]!;
    value = Math.imul(value, 16_777_619) >>> 0;
  }
  return value === 0 ? 0x9e3779b9 : value;
};

export class ShooterRandom {
  private state: number;

  constructor(seed: string) {
    this.state = shooterSeedFromString(seed);
  }

  next(): number {
    let value = this.state || 0x9e3779b9;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state;
  }

  integer(limit: number): number {
    return limit <= 1 ? 0 : this.next() % limit;
  }
}
