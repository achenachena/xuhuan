/**
 * Audio Manager - Centralized audio management system
 * Handles BGM and sound effects with best practices:
 * - Audio preloading
 * - Volume control
 * - User interaction requirement handling
 * - Sound pool for performance
 * - External URL support (CDN/external storage)
 */

import { env } from "@/lib/env";

type SoundEffectType =
  | "lightAttack"
  | "heavyAttack"
  | "specialMove"
  | "block"
  | "damage"
  | "victory"
  | "defeat"
  | "combo";

type AudioConfig = {
  bgmVolume: number;
  sfxVolume: number;
  enabled: boolean;
};

// Audio file mapping configuration
type AudioFileMap = {
  readonly selectBgm: string | null; // Character selection BGM (can be null)
  readonly battleBgm: string | null; // Battle BGM (can be null)
  readonly lightAttack: string | null;
  readonly heavyAttack: string | null;
  readonly specialMove: string | null;
  readonly block: string | null;
  readonly damage: string | null;
  readonly victory: string | null;
  readonly defeat: string | null;
  readonly combo: string | null;
};

class AudioManager {
  private bgmAudio: HTMLAudioElement | null = null;
  private soundPool: Map<SoundEffectType, HTMLAudioElement[]> = new Map();
  private config: AudioConfig;
  private isInitialized = false;
  private userInteracted = false;
  private audioFiles: AudioFileMap;

  constructor() {
    // Initialize config as mutable object
    this.config = {
      bgmVolume: 0.5,
      sfxVolume: 0.7,
      enabled: true
    };
    // Build audio file URL map
    // Priority: Individual URL > Base URL + filename > null (graceful degradation)
    const baseUrl = env.NEXT_PUBLIC_AUDIO_BASE_URL; // Can be undefined if not configured
    const ensureTrailingSlash = (url: string): string => {
      return url.endsWith("/") ? url : `${url}/`;
    };

    // Helper to build URL or return null if base URL is not configured
    const buildUrl = (individualUrl: string | undefined, filename: string): string | null => {
      // Individual URL has highest priority
      if (individualUrl) {
        return individualUrl;
      }
      // Use base URL if explicitly configured
      if (baseUrl) {
        return `${ensureTrailingSlash(baseUrl)}${filename}`;
      }
      // Graceful degradation: no URL configured, return null
      // This allows the app to run without audio files
      return null;
    };

    // Get unified BGM URL (priority: NEXT_PUBLIC_AUDIO_BGM > individual > base URL + filename)
    const getBgmUrl = (individualBgm: string | undefined, filename: string): string | null => {
      // Use unified BGM if configured (highest priority)
      if (env.NEXT_PUBLIC_AUDIO_BGM) {
        return env.NEXT_PUBLIC_AUDIO_BGM;
      }
      // Fallback to individual BGM or base URL + filename
      return buildUrl(individualBgm, filename);
    };

    this.audioFiles = {
      selectBgm: getBgmUrl(env.NEXT_PUBLIC_AUDIO_SELECT_BGM, "select-bgm.mp3"),
      battleBgm: getBgmUrl(env.NEXT_PUBLIC_AUDIO_BATTLE_BGM, "battle-bgm.mp3"),
      lightAttack: buildUrl(env.NEXT_PUBLIC_AUDIO_LIGHT_ATTACK, "lightAttack.mp3"),
      heavyAttack: buildUrl(env.NEXT_PUBLIC_AUDIO_HEAVY_ATTACK, "heavyAttack.mp3"),
      specialMove: buildUrl(env.NEXT_PUBLIC_AUDIO_SPECIAL_MOVE, "specialMove.mp3"),
      block: buildUrl(env.NEXT_PUBLIC_AUDIO_BLOCK, "block.mp3"),
      damage: buildUrl(env.NEXT_PUBLIC_AUDIO_DAMAGE, "damage.mp3"),
      victory: buildUrl(env.NEXT_PUBLIC_AUDIO_VICTORY, "victory.mp3"),
      defeat: buildUrl(env.NEXT_PUBLIC_AUDIO_DEFEAT, "defeat.mp3"),
      combo: buildUrl(env.NEXT_PUBLIC_AUDIO_COMBO, "combo.mp3")
    };
  }

  /**
   * Initialize audio system after user interaction
   */
  initialize(): void {
    if (this.isInitialized) {
      return;
    }
    this.isInitialized = true;
    this.preloadSounds();
  }

  /**
   * Mark that user has interacted (required for autoplay)
   */
  markUserInteracted(): void {
    if (!this.userInteracted) {
      this.userInteracted = true;
      this.initialize();
    }
  }

  /**
   * Get audio URL for a sound effect type
   * Returns null if not configured (graceful degradation)
   */
  private getSoundUrl(type: SoundEffectType): string | null {
    const urlMap: Record<SoundEffectType, string | null> = {
      lightAttack: this.audioFiles.lightAttack,
      heavyAttack: this.audioFiles.heavyAttack,
      specialMove: this.audioFiles.specialMove,
      block: this.audioFiles.block,
      damage: this.audioFiles.damage,
      victory: this.audioFiles.victory,
      defeat: this.audioFiles.defeat,
      combo: this.audioFiles.combo
    };
    return urlMap[type];
  }

  /**
   * Preload all sound effects (only if URLs are configured)
   */
  private preloadSounds(): void {
    const soundTypes: SoundEffectType[] = [
      "lightAttack",
      "heavyAttack",
      "specialMove",
      "block",
      "damage",
      "victory",
      "defeat",
      "combo"
    ];

    soundTypes.forEach((type) => {
      const url = this.getSoundUrl(type);
      // Skip if URL is not configured (graceful degradation)
      if (!url) {
        return;
      }

      const pool: (HTMLAudioElement | null)[] = [];
      // Create pool of 3 audio instances per sound type for overlapping sounds
      for (let i = 0; i < 3; i++) {
        const audio = this.createAudioElement(url);
        if (audio) {
          audio.volume = this.config.sfxVolume;
        }
        pool.push(audio);
      }
      // Only set pool if at least one audio element was created successfully
      if (pool.some((a) => a !== null)) {
        this.soundPool.set(type, pool.filter((a): a is HTMLAudioElement => a !== null));
      }
    });
  }

  /**
   * Create audio element with error handling
   * Gracefully handles loading failures without breaking the app
   */
  private createAudioElement(src: string | null): HTMLAudioElement | null {
    if (!src) {
      return null;
    }

    const audio = new Audio(src);
    audio.preload = "auto";
    audio.volume = 0;
    // Handle errors gracefully - don't throw, just log
    audio.addEventListener("error", () => {
      // Silent failure - audio file missing is acceptable
      console.debug(`Audio file not available: ${src}`);
    });
    return audio;
  }

  /**
   * Play background music
   * @param bgmType - Type of BGM: "select" or "battle"
   * @param loop - Whether to loop the music
   */
  playBGM(bgmType: "select" | "battle", loop: boolean = true): void {
    if (!this.config.enabled || !this.userInteracted) {
      return;
    }

    // Stop current BGM if playing
    this.stopBGM();

    // Get the appropriate BGM URL
    const bgmUrl = bgmType === "select" ? this.audioFiles.selectBgm : this.audioFiles.battleBgm;

    // Graceful degradation: if URL is not configured, silently skip
    if (!bgmUrl) {
      return;
    }

    const audioElement = this.createAudioElement(bgmUrl);
    if (!audioElement) {
      return;
    }

    this.bgmAudio = audioElement;
    this.bgmAudio.volume = this.config.bgmVolume;
    this.bgmAudio.loop = loop;

    const playPromise = this.bgmAudio.play();

    if (playPromise !== undefined) {
      playPromise.catch((error) => {
        // Silent failure - audio file missing is acceptable
        console.debug(`BGM playback failed (${bgmType}):`, error);
        this.bgmAudio = null;
      });
    }
  }

  /**
   * Stop background music
   */
  stopBGM(): void {
    if (this.bgmAudio) {
      this.bgmAudio.pause();
      this.bgmAudio.currentTime = 0;
      this.bgmAudio = null;
    }
  }

  /**
   * Play sound effect
   * Gracefully handles missing audio files (silent failure)
   */
  playSound(type: SoundEffectType): void {
    if (!this.config.enabled || !this.userInteracted) {
      return;
    }

    const pool = this.soundPool.get(type);
    // Graceful degradation: if pool doesn't exist or is empty, silently skip
    if (!pool || pool.length === 0) {
      return;
    }

    // Find an available audio instance (not currently playing)
    let audio = pool.find((a) => a && (a.paused || a.ended));

    // If all are playing, use the first one (will interrupt)
    if (!audio) {
      audio = pool[0];
    }

    // Skip if audio element is null (failed to load)
    if (!audio) {
      return;
    }

    // Reset and play
    audio.currentTime = 0;
    audio.volume = this.config.sfxVolume;

    const playPromise = audio.play();

    if (playPromise !== undefined) {
      playPromise.catch((error) => {
        // Silent failure - audio file missing is acceptable
        console.debug(`Sound effect playback failed (${type}):`, error);
      });
    }
  }

  /**
   * Set BGM volume (0.0 to 1.0)
   */
  setBGMVolume(volume: number): void {
    this.config.bgmVolume = Math.max(0, Math.min(1, volume));
    if (this.bgmAudio) {
      this.bgmAudio.volume = this.config.bgmVolume;
    }
  }

  /**
   * Set SFX volume (0.0 to 1.0)
   */
  setSFXVolume(volume: number): void {
    this.config.sfxVolume = Math.max(0, Math.min(1, volume));
    // Update all sound pool volumes
    this.soundPool.forEach((pool) => {
      pool.forEach((audio) => {
        audio.volume = this.config.sfxVolume;
      });
    });
  }

  /**
   * Enable/disable audio
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    if (!enabled) {
      this.stopBGM();
    }
  }

  /**
   * Get current BGM volume
   */
  getBGMVolume(): number {
    return this.config.bgmVolume;
  }

  /**
   * Get current SFX volume
   */
  getSFXVolume(): number {
    return this.config.sfxVolume;
  }

  /**
   * Check if audio is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Check if user has interacted
   */
  hasUserInteracted(): boolean {
    return this.userInteracted;
  }
}

// Singleton instance
export const audioManager = new AudioManager();

// Export types
export type { SoundEffectType, AudioConfig };

