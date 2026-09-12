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
    expect(context().oscillators.length).toBeGreaterThan(0);
  });

  it("adds demo layers without restarting voices and releases them on campaign return", () => {
    audio.setDemoMusicProgress(0);
    audio.setMusicActive(true);
    audio.markUserInteracted();
    const initialCount = context().oscillators.length;
    vi.advanceTimersByTime(960);
    const baseVoices = context().oscillators.length - initialCount;
    const before = context().oscillators.length;
    const disconnects = context().oscillators.map(voice => voice.disconnect.mock.calls.length);
    audio.setDemoMusicProgress(3);
    expect(context().oscillators).toHaveLength(before);
    expect(context().oscillators.map(voice => voice.disconnect.mock.calls.length)).toEqual(disconnects);
    vi.advanceTimersByTime(960);
    expect(context().oscillators.length - before).toBeGreaterThan(baseVoices);
    audio.setDemoMusicProgress(null);
    expect(context().oscillators.every(voice => voice.disconnect.mock.calls.length === 1)).toBe(true);
    const stopped = context().oscillators.length;
    vi.advanceTimersByTime(480);
    expect(context().oscillators.length).toBeGreaterThan(stopped);
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
    expect(context().oscillators.length - count).toBe(1);
  });

  it("disconnects every oscillator and gain after its short envelope ends", () => {
    audio.markUserInteracted();
    audio.playSound("coreBreak");
    expect(context().oscillators.length).toBeGreaterThan(0);
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
    const musicCount = context().oscillators.length;
    audio.playSound("victory");
    audio.setMusicActive(false);
    expect(context().oscillators.slice(0, musicCount).every((voice) => voice.disconnect.mock.calls.length === 1)).toBe(true);
    expect(context().oscillators.slice(musicCount).every((voice) => voice.disconnect.mock.calls.length === 0)).toBe(true);
    vi.advanceTimersByTime(700);
    expect(context().oscillators.every((voice) => voice.disconnect.mock.calls.length === 1)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
