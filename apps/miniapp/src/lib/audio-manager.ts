export type SoundEffectType =
  | "pickup"
  | "hit"
  | "shield"
  | "combo"
  | "rescue"
  | "bossWarning"
  | "gateSelect"
  | "victory"
  | "defeat";

type Tone = {
  readonly frequency: number;
  readonly duration: number;
  readonly offset?: number;
  readonly volume?: number;
  readonly wave?: OscillatorType;
};

const sounds: Record<SoundEffectType, readonly Tone[]> = {
  pickup: [
    { frequency: 660, duration: 0.05, volume: 0.035 },
    { frequency: 990, duration: 0.08, offset: 0.045, volume: 0.03 },
  ],
  hit: [{ frequency: 105, duration: 0.09, volume: 0.055, wave: "square" }],
  shield: [
    { frequency: 290, duration: 0.08, volume: 0.04, wave: "triangle" },
    { frequency: 580, duration: 0.1, offset: 0.04, volume: 0.025 },
  ],
  combo: [
    { frequency: 720, duration: 0.05, volume: 0.03 },
    { frequency: 960, duration: 0.05, offset: 0.035, volume: 0.03 },
    { frequency: 1_280, duration: 0.08, offset: 0.07, volume: 0.025 },
  ],
  rescue: [
    { frequency: 180, duration: 0.2, volume: 0.055, wave: "sawtooth" },
    { frequency: 420, duration: 0.22, offset: 0.04, volume: 0.04 },
    { frequency: 840, duration: 0.25, offset: 0.09, volume: 0.035 },
  ],
  bossWarning: [
    { frequency: 140, duration: 0.12, volume: 0.045, wave: "square" },
    { frequency: 140, duration: 0.12, offset: 0.18, volume: 0.045, wave: "square" },
  ],
  gateSelect: [
    { frequency: 410, duration: 0.07, volume: 0.035, wave: "triangle" },
    { frequency: 820, duration: 0.14, offset: 0.05, volume: 0.03 },
  ],
  victory: [
    { frequency: 523, duration: 0.12, volume: 0.035 },
    { frequency: 659, duration: 0.12, offset: 0.1, volume: 0.035 },
    { frequency: 784, duration: 0.24, offset: 0.2, volume: 0.04 },
  ],
  defeat: [
    { frequency: 260, duration: 0.12, volume: 0.035, wave: "triangle" },
    { frequency: 180, duration: 0.3, offset: 0.1, volume: 0.04, wave: "triangle" },
  ],
};

const muteStorageKey = "xuhuan.audio-muted.v1";

class AudioManager {
  private context: AudioContext | null = null;
  private interacted = false;
  private muted = false;

  constructor() {
    if (typeof window !== "undefined") {
      this.muted = window.localStorage.getItem(muteStorageKey) === "true";
    }
  }

  markUserInteracted(): void {
    this.interacted = true;
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(muteStorageKey, String(muted));
    }
  }

  playSound(type: SoundEffectType): void {
    if (!this.interacted || this.muted || typeof window === "undefined") return;
    const context = this.audioContext();
    if (!context) return;
    if (context.state === "suspended") void context.resume().catch(() => undefined);
    const start = context.currentTime;
    for (const tone of sounds[type]) this.playTone(context, start, tone);
  }

  private audioContext(): AudioContext | null {
    if (this.context) return this.context;
    const Constructor = window.AudioContext;
    if (!Constructor) return null;
    try {
      this.context = new Constructor({ latencyHint: "interactive" });
    } catch {
      this.context = null;
    }
    return this.context;
  }

  private playTone(context: AudioContext, start: number, tone: Tone): void {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const begins = start + (tone.offset ?? 0);
    const ends = begins + tone.duration;
    oscillator.type = tone.wave ?? "sine";
    oscillator.frequency.setValueAtTime(tone.frequency, begins);
    gain.gain.setValueAtTime(0.0001, begins);
    gain.gain.exponentialRampToValueAtTime(tone.volume ?? 0.03, begins + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, ends);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(begins);
    oscillator.stop(ends + 0.01);
  }
}

export const audioManager = new AudioManager();
