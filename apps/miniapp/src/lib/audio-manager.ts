export type SoundEffectType =
  | "pickup"
  | "enemyHit"
  | "enemyBreak"
  | "coreBreak"
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
  enemyHit: [
    { frequency: 120, duration: 0.032, volume: 0.035, wave: "square" },
    { frequency: 310, duration: 0.045, offset: 0.008, volume: 0.026, wave: "sawtooth" },
    { frequency: 760, duration: 0.028, offset: 0.018, volume: 0.02, wave: "square" },
  ],
  enemyBreak: [
    { frequency: 150, duration: 0.06, volume: 0.025, wave: "square" },
    { frequency: 420, duration: 0.08, offset: 0.025, volume: 0.022, wave: "sawtooth" },
    { frequency: 760, duration: 0.1, offset: 0.05, volume: 0.018, wave: "triangle" },
  ],
  coreBreak: [
    { frequency: 95, duration: 0.08, volume: 0.04, wave: "square" },
    { frequency: 523, duration: 0.1, offset: 0.04, volume: 0.035, wave: "triangle" },
    { frequency: 784, duration: 0.12, offset: 0.1, volume: 0.03, wave: "square" },
    { frequency: 1046, duration: 0.15, offset: 0.18, volume: 0.02, wave: "triangle" },
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
const musicIntervalMs = 240;
const maximumVoices = 24;

// Original, local oscillator scores. The existing campaign arrangement stays
// separate from the opt-in demo's gradually restored livestream arrangement.
const campaignMelody = [659, 0, 784, 880, 0, 784, 659, 587, 659, 0, 988, 880, 784, 0, 659, 587] as const;
const campaignBass = [110, 110, 147, 147, 98, 98, 131, 131] as const;
const demoMelody = [523, 0, 659, 784, 659, 0, 587, 659, 440, 0, 523, 659, 587, 523, 392, 0] as const;
const demoBass = [131, 131, 110, 110, 87, 87, 98, 98] as const;
const demoHarmony = [330, 392, 262, 330, 220, 262, 294, 392] as const;

type Voice = {
  readonly oscillator: OscillatorNode;
  readonly gain: GainNode;
  readonly music: boolean;
};

class AudioManager {
  private context: AudioContext | null = null;
  private interacted = false;
  private muted = false;
  private musicRequested = false;
  private musicPaused = false;
  private musicStep = 0;
  private musicTimer: number | null = null;
  private demoMusicProgress: number | null = null;
  private demoFullUntil = 0;
  private demoGlitchUntil = 0;
  private demoGlitchCooldownUntil = 0;
  private readonly voices = new Set<Voice>();

  constructor() {
    if (typeof window !== "undefined") {
      try {
        this.muted = window.localStorage.getItem(muteStorageKey) === "true";
      } catch {
        // Restricted WebViews can still play audio without persisting mute.
      }
    }
  }

  markUserInteracted(): void {
    this.interacted = true;
    // Create/resume in the gesture itself, even while the next scene loads.
    const context = this.audioContext();
    if (context?.state === "suspended") void context.resume().catch(() => undefined);
    this.startMusicScheduler();
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(muteStorageKey, String(muted));
      } catch {
        // Storage availability is not an audio permission boundary.
      }
    }
    if (muted) {
      this.stopMusicScheduler();
      this.stopVoices(false);
    }
    else this.startMusicScheduler();
  }

  setMusicActive(active: boolean): void {
    this.musicRequested = active;
    if (active) this.startMusicScheduler();
    else this.stopMusicScheduler();
  }

  setMusicPaused(paused: boolean): void {
    this.musicPaused = paused;
    if (paused) {
      this.stopMusicScheduler();
      this.stopVoices(false);
    }
    else this.startMusicScheduler();
  }

  // Only the browser demo opts in. The count is already-known game progress,
  // not a second scoring system; null restores the unchanged campaign score.
  setDemoMusicProgress(breaks: number | null): void {
    const progress = breaks === null ? null : Math.max(0, Math.min(3, Math.floor(breaks) || 0));
    const reset = (progress === null) !== (this.demoMusicProgress === null)
      || (progress !== null && this.demoMusicProgress !== null && progress < this.demoMusicProgress);
    this.demoMusicProgress = progress;
    if (reset) {
      this.musicStep = 0;
      this.demoFullUntil = 0;
      this.demoGlitchUntil = 0;
      this.demoGlitchCooldownUntil = 0;
      this.stopVoices(true);
    }
  }

  playSound(type: SoundEffectType): void {
    if (!this.interacted || this.muted || this.musicPaused || typeof window === "undefined") return;
    const context = this.audioContext();
    if (!context) return;
    if (context.state === "suspended") void context.resume().catch(() => undefined);
    const start = context.currentTime;
    if (this.demoMusicProgress !== null) {
      if (type === "rescue") {
        this.demoFullUntil = start + 8;
        this.demoGlitchUntil = 0;
      } else if (type === "bossWarning" && start >= this.demoFullUntil && start >= this.demoGlitchCooldownUntil) {
        // With the 240 ms scheduler, a 250 ms disruption restores the next
        // phrase within 490 ms even when a warning lands between beats.
        this.demoGlitchUntil = start + 0.25;
        this.demoGlitchCooldownUntil = start + 10;
        this.stopVoices(true);
      }
    }
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

  private startMusicScheduler(): void {
    if (
      this.musicTimer !== null ||
      !this.musicRequested ||
      this.musicPaused ||
      !this.interacted ||
      this.muted ||
      typeof window === "undefined"
    ) {
      return;
    }
    const context = this.audioContext();
    if (!context) return;
    if (context.state === "suspended") void context.resume().catch(() => undefined);
    this.playMusicStep(context);
    this.musicTimer = window.setInterval(() => this.playMusicStep(context), musicIntervalMs);
  }

  private stopMusicScheduler(): void {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
    this.stopVoices(true);
  }

  private playMusicStep(context: AudioContext): void {
    if (this.demoMusicProgress !== null) {
      this.playDemoMusicStep(context);
      this.musicStep = (this.musicStep + 1) % demoMelody.length;
      return;
    }
    const melodyNote = campaignMelody[this.musicStep % campaignMelody.length] ?? 0;
    const start = context.currentTime + 0.01;
    if (melodyNote > 0) {
      this.playTone(context, start, {
        frequency: melodyNote,
        duration: 0.15,
        volume: 0.022,
        wave: "square",
      }, true);
    }
    if ((this.musicStep & 1) === 0) {
      this.playTone(context, start, {
        frequency: campaignBass[Math.floor(this.musicStep / 2) % campaignBass.length]!,
        duration: 0.38,
        volume: 0.028,
        wave: "triangle",
      }, true);
    }
    // A steady backbeat and chord accents make the original chiptune audible
    // under combat without downloading music or interrupting scene changes.
    this.playTone(context, start, { frequency: this.musicStep % 4 === 0 ? 65 : this.musicStep % 4 === 2 ? 180 : 1760,
      duration: this.musicStep % 2 === 0 ? 0.08 : 0.025, volume: this.musicStep % 2 === 0 ? 0.018 : 0.005,
      wave: this.musicStep % 4 === 0 ? "triangle" : "square" }, true);
    if (this.musicStep % 4 === 0) this.playTone(context, start, { frequency: campaignBass[Math.floor(this.musicStep / 2)]! * 3,
      duration: 0.42, volume: 0.009, wave: "triangle" }, true);
    this.musicStep = (this.musicStep + 1) % campaignMelody.length;
  }

  private playDemoMusicStep(context: AudioContext): void {
    const start = context.currentTime + 0.01;
    if (context.currentTime < this.demoGlitchUntil) {
      this.playTone(context, start, { frequency: 82, duration: 0.04, volume: 0.004, wave: "square" }, true);
      return;
    }
    const layers = context.currentTime < this.demoFullUntil ? 3 : this.demoMusicProgress ?? 0;
    const beat = this.musicStep;
    const melody = demoMelody[beat]!;
    if (melody) {
      this.playTone(context, start, { frequency: melody, duration: 0.17, volume: 0.022, wave: "square" }, true);
    }
    if (layers >= 1) {
      // Short pitched envelopes provide kick/snare ticks without noise buffers.
      this.playTone(context, start, {
        frequency: beat % 4 === 0 ? 72 : beat % 4 === 2 ? 185 : 1_760,
        duration: beat % 2 === 0 ? 0.07 : 0.018,
        volume: beat % 2 === 0 ? 0.007 : 0.002,
        wave: beat % 4 === 0 ? "triangle" : "square",
      }, true);
    }
    if (layers >= 2 && beat % 2 === 0) {
      this.playTone(context, start, { frequency: demoBass[beat / 2]!, duration: 0.32, volume: 0.028, wave: "triangle" }, true);
    }
    if (layers >= 3 && beat % 2 === 0) {
      this.playTone(context, start, { frequency: demoHarmony[beat / 2]!, duration: 0.27, volume: 0.004, wave: "triangle" }, true);
    }
  }

  private stopVoices(musicOnly: boolean): void {
    this.voices.forEach((voice) => {
      if (!musicOnly || voice.music) this.releaseVoice(voice, true);
    });
  }

  private releaseVoice(voice: Voice, stop = false): void {
    if (!this.voices.delete(voice)) return;
    voice.oscillator.onended = null;
    if (stop) {
      try { voice.oscillator.stop(); } catch { /* An ended oscillator is already silent. */ }
    }
    voice.oscillator.disconnect();
    voice.gain.disconnect();
  }

  private playTone(context: AudioContext, start: number, tone: Tone, music = false): void {
    if (this.voices.size >= maximumVoices) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const voice: Voice = { oscillator, gain, music };
    this.voices.add(voice);
    oscillator.onended = () => this.releaseVoice(voice);
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
