export const fnvDigest = (values: readonly number[]): string => {
  let hash = 2166136261 >>> 0;
  for (const raw of values) {
    const value = raw >>> 0;
    for (let shift = 0; shift < 32; shift += 8) {
      hash =
        Math.imul((hash ^ ((value >>> shift) & 0xff)) >>> 0, 16777619) >>> 0;
    }
  }
  return hash.toString(16).padStart(8, "0");
};
