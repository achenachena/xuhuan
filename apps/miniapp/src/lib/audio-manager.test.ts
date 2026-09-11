import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const parameter = () => ({
  setValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
});

class TestOscillator {
  type: OscillatorType = "sine";
  frequency = parameter();
  onended: (() => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  private endTimer: ReturnType<typeof setTimeout> | null = null;
  stop = vi.fn((when = Date.now() / 1_000) => {
    if (this.endTimer !== null) clearTimeout(this.endTimer);
    if (this.onended) {
      this.endTimer = setTimeout(() => this.onended?.(), Math.max(0, when * 1_000 - Date.now()));
    }
  });
}

class TestGain {
  gain = parameter();
  connect = vi.fn();
  disconnect = vi.fn();
}

class TestAudioContext {
  static instances: TestAudioContext[] = [];
  state = "running";
  destination = {};
  oscillators: TestOscillator[] = [];
  gains: TestGain[] = [];
  resume = vi.fn(async () => { this.state = "running"; });
  get currentTime() { return Date.now() / 1_000; }
  constructor() { TestAudioContext.instances.push(this); }
  createOscillator = vi.fn(() => {
    const oscillator = new TestOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  });
  createGain = vi.fn(() => {
    const gain = new TestGain();
    this.gains.push(gain);
    return gain;
  });
}

let audio: typeof import("./audio-manager").audioManager;
const context = () => TestAudioContext.instances[0]!;
const notes = (from = 0) => context().oscillators.slice(from)
  .map((voice) => voice.frequency.setValueAtTime.mock.calls[0]![0]);

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  vi.resetModules();
  localStorage.clear();
  vi.clearAllTimers();
  TestAudioContext.instances = [];
  vi.stubGlobal("AudioContext", TestAudioContext);
  audio = (await import("./audio-manager")).audioManager;
});

afterEach(() => {
  audio.setMusicActive(false);
  audio.setMusicPaused(true);
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("gesture-gated local soundtrack", () => {
  it("never allocates audio or timers before a real interaction", () => {
    audio.setDemoMusicProgress(2);
    audio.setMusicActive(true);
    audio.playSound("bossWarning");
    audio.playSound("rescue");
    vi.advanceTimersByTime(10_000);
    expect(TestAudioContext.instances).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    audio.markUserInteracted();
    expect(notes()).toEqual([523, 72, 131]);
  });

  it("keeps the original campaign melody and bass by default", () => {
    audio.setMusicActive(true);
    audio.markUserInteracted();
    expect(notes()).toEqual([659, 110, 65, 330]);
    vi.advanceTimersByTime(480);
    expect(notes()).toEqual([659, 110, 65, 330, 1760, 784, 110, 180]);
  });

  it.each([
    [0, [523]],
    [1, [523, 72]],
    [2, [523, 72, 131]],
    [3, [523, 72, 131, 330]],
    [8, [523, 72, 131, 330]],
  ])("restores the expected layers after %i cores", (breaks, expected) => {
    audio.setDemoMusicProgress(breaks);
    audio.setMusicActive(true);
    audio.markUserInteracted();
    expect(notes()).toEqual(expected);
  });

  it("adds earned layers without restarting the playing phrase", () => {
    audio.setDemoMusicProgress(0);
    audio.setMusicActive(true);
    audio.markUserInteracted();
    audio.setDemoMusicProgress(1);
    vi.advanceTimersByTime(240);
    expect(notes()).toEqual([523, 1_760]);
    audio.setDemoMusicProgress(2);
    vi.advanceTimersByTime(240);
    expect(notes().slice(-3)).toEqual([659, 185, 131]);
    audio.setDemoMusicProgress(3);
    vi.advanceTimersByTime(480);
    expect(notes().slice(-4)).toEqual([659, 72, 110, 262]);
  });

  it("restores the unchanged campaign score on demo exit", () => {
    audio.setDemoMusicProgress(3);
    audio.setMusicActive(true);
    audio.markUserInteracted();
    audio.setDemoMusicProgress(null);
    expect(context().oscillators.every((voice) => voice.disconnect.mock.calls.length === 1)).toBe(true);
    const previous = context().oscillators.length;
    vi.advanceTimersByTime(240);
    expect(notes(previous)).toEqual([659, 110, 65, 330]);
  });
});

describe("livestream interruptions and Rescue", () => {
  beforeEach(() => {
    audio.setDemoMusicProgress(0);
    audio.setMusicActive(true);
    audio.markUserInteracted();
  });

  it("glitches for less than half a second and ignores frequent warnings", () => {
    audio.playSound("bossWarning");
    vi.advanceTimersByTime(240);
    expect(notes().at(-1)).toBe(82);
    vi.advanceTimersByTime(240);
    expect(notes().at(-1)).toBe(659);
    audio.playSound("bossWarning");
    vi.advanceTimersByTime(240);
    expect(notes().at(-1)).toBe(784);
    expect(notes().filter((frequency) => frequency === 82)).toHaveLength(1);
    vi.advanceTimersByTime(9_360);
    audio.playSound("bossWarning");
    vi.advanceTimersByTime(240);
    expect(notes().at(-1)).toBe(82);
  });

  it("also restores the phrase within half a second for off-beat warnings", () => {
    vi.advanceTimersByTime(100);
    audio.playSound("bossWarning");
    vi.advanceTimersByTime(140);
    expect(notes().at(-1)).toBe(82);
    vi.advanceTimersByTime(240);
    expect(notes().at(-1)).toBe(659);
    expect(notes().filter((frequency) => frequency === 82)).toHaveLength(1);
  });

  it("lets Rescue immediately cancel an interruption and protect the full mix for eight seconds", () => {
    audio.playSound("bossWarning");
    vi.advanceTimersByTime(240);
    audio.playSound("rescue");
    vi.advanceTimersByTime(240);
    expect(notes().slice(-4)).toEqual([659, 185, 131, 392]);
    // Reset the warning cooldown by entering a fresh demo, then Rescue must
    // still take priority even when a new boss warning would otherwise qualify.
    audio.setDemoMusicProgress(null);
    audio.setDemoMusicProgress(0);
    audio.playSound("rescue");
    audio.playSound("bossWarning");
    const before = context().oscillators.length;
    vi.advanceTimersByTime(240);
    expect(notes(before)).toEqual([523, 72, 131, 330]);
    vi.advanceTimersByTime(7_440);
    expect(notes().filter((frequency) => frequency === 82)).toHaveLength(1);
    vi.advanceTimersByTime(320);
    const restored = context().oscillators.length;
    vi.advanceTimersByTime(400);
    expect(notes(restored)).toEqual([659]);
  });
});

describe("voice and lifecycle bounds", () => {
  it("stops scheduled voices immediately when muted and persists mute", () => {
    audio.setDemoMusicProgress(3);
    audio.setMusicActive(true);
    audio.markUserInteracted();
    audio.playSound("rescue");
    audio.setMuted(true);
    expect(localStorage.getItem("xuhuan.audio-muted.v1")).toBe("true");
    expect(context().oscillators.every((voice) => voice.disconnect.mock.calls.length === 1)).toBe(true);
    expect(context().gains.every((gain) => gain.disconnect.mock.calls.length === 1)).toBe(true);
    const count = context().oscillators.length;
    vi.advanceTimersByTime(5_000);
    audio.playSound("hit");
    expect(context().oscillators).toHaveLength(count);
    expect(vi.getTimerCount()).toBe(0);
    audio.setMuted(false);
    expect(context().oscillators.length).toBeGreaterThan(count);
  });

  it("pauses on background without sound leakage or catch-up voices", () => {
    audio.setDemoMusicProgress(2);
    audio.setMusicActive(true);
    audio.markUserInteracted();
    audio.setMusicPaused(true);
    expect(vi.getTimerCount()).toBe(0);
    const count = context().oscillators.length;
    vi.advanceTimersByTime(60_000);
    audio.playSound("rescue");
    expect(context().oscillators).toHaveLength(count);
    audio.setMusicPaused(false);
    expect(notes(count)).toEqual([1_760]);
    expect(context().oscillators.length - count).toBe(1);
  });

  it("disconnects every oscillator and gain after its short envelope ends", () => {
    audio.markUserInteracted();
    audio.playSound("coreBreak");
    expect(context().oscillators).toHaveLength(4);
    vi.advanceTimersByTime(400);
    expect(context().oscillators.every((voice) => voice.disconnect.mock.calls.length === 1 && voice.onended === null)).toBe(true);
    expect(context().gains.every((gain) => gain.disconnect.mock.calls.length === 1)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds concurrent and future scheduled voices even under repeated hit events", () => {
    audio.markUserInteracted();
    for (let index = 0; index < 200; index += 1) audio.playSound("enemyHit");
    expect(context().oscillators).toHaveLength(24);
    vi.advanceTimersByTime(150);
    audio.playSound("pickup");
    expect(context().oscillators).toHaveLength(26);
  });

  it("stops music at the result screen without cutting off the victory jingle", () => {
    audio.setMusicActive(true);
    audio.markUserInteracted();
    audio.playSound("victory");
    audio.setMusicActive(false);
    expect(context().oscillators.slice(0, 4).every((voice) => voice.disconnect.mock.calls.length === 1)).toBe(true);
    expect(context().oscillators.slice(4).every((voice) => voice.disconnect.mock.calls.length === 0)).toBe(true);
    vi.advanceTimersByTime(700);
    expect(context().oscillators.every((voice) => voice.disconnect.mock.calls.length === 1)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
