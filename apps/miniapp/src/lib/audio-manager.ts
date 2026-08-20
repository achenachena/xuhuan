import { env } from "@/lib/env";

export type SoundEffectType = "specialMove" | "damage" | "victory" | "defeat";

type AudioFiles = {
  readonly battleBgm: string | null;
  readonly specialMove: string | null;
  readonly damage: string | null;
  readonly victory: string | null;
  readonly defeat: string | null;
};

const soundTypes: readonly SoundEffectType[] = ["specialMove", "damage", "victory", "defeat"];

const withTrailingSlash = (url: string): string => (url.endsWith("/") ? url : `${url}/`);

const resolveAudioURL = (
  baseURL: string | undefined,
  override: string | undefined,
  filename: string,
): string | null => override ?? (baseURL ? `${withTrailingSlash(baseURL)}${filename}` : null);

class AudioManager {
  private readonly files: AudioFiles;
  private readonly soundPool = new Map<SoundEffectType, HTMLAudioElement[]>();
  private bgmAudio: HTMLAudioElement | null = null;
  private currentBgmURL: string | null = null;
  private initialized = false;
  private userInteracted = false;

  constructor() {
    const baseURL = env.NEXT_PUBLIC_AUDIO_BASE_URL;
    this.files = {
      battleBgm: resolveAudioURL(baseURL, env.NEXT_PUBLIC_AUDIO_BGM, "battle-bgm.mp3"),
      specialMove: resolveAudioURL(
        baseURL,
        env.NEXT_PUBLIC_AUDIO_SPECIAL_MOVE,
        "specialMove.mp3",
      ),
      damage: resolveAudioURL(baseURL, env.NEXT_PUBLIC_AUDIO_DAMAGE, "damage.mp3"),
      victory: resolveAudioURL(baseURL, env.NEXT_PUBLIC_AUDIO_VICTORY, "victory.mp3"),
      defeat: resolveAudioURL(baseURL, env.NEXT_PUBLIC_AUDIO_DEFEAT, "defeat.mp3"),
    };
  }

  markUserInteracted(): void {
    if (this.userInteracted) return;
    this.userInteracted = true;
    this.initialize();
  }

  playBattleBGM(loop = true): void {
    const url = this.files.battleBgm;
    if (!this.userInteracted || !url) return;
    if (this.currentBgmURL === url && this.bgmAudio && !this.bgmAudio.paused) return;

    this.stopBGM();
    const audio = this.createAudio(url);
    if (!audio) return;
    audio.volume = 0.5;
    audio.loop = loop;
    this.bgmAudio = audio;
    this.currentBgmURL = url;
    void audio.play().catch(() => {
      if (this.bgmAudio === audio) {
        this.bgmAudio = null;
        this.currentBgmURL = null;
      }
    });
  }

  stopBGM(): void {
    this.bgmAudio?.pause();
    if (this.bgmAudio) this.bgmAudio.currentTime = 0;
    this.bgmAudio = null;
    this.currentBgmURL = null;
  }

  playSound(type: SoundEffectType): void {
    if (!this.userInteracted) return;
    const pool = this.soundPool.get(type);
    if (!pool?.length) return;
    const audio = pool.find((candidate) => candidate.paused || candidate.ended) ?? pool[0];
    if (!audio) return;
    audio.currentTime = 0;
    audio.volume = 0.7;
    void audio.play().catch(() => undefined);
  }

  private initialize(): void {
    if (this.initialized) return;
    this.initialized = true;
    for (const type of soundTypes) {
      const url = this.files[type];
      if (!url) continue;
      const pool = Array.from({ length: 3 }, () => this.createAudio(url)).filter(
        (audio): audio is HTMLAudioElement => audio !== null,
      );
      if (pool.length > 0) this.soundPool.set(type, pool);
    }
  }

  private createAudio(source: string): HTMLAudioElement | null {
    try {
      const audio = new Audio(source);
      audio.preload = "auto";
      return audio;
    } catch {
      return null;
    }
  }
}

export const audioManager = new AudioManager();
