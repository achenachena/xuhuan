"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { audioManager, type SoundEffectType } from "@/lib/audio-manager";

type AudioContextValue = {
  readonly playSound: (type: SoundEffectType) => void;
  readonly playBGM: (bgmType: "select" | "battle", loop?: boolean) => void;
  readonly stopBGM: () => void;
  readonly setBGMVolume: (volume: number) => void;
  readonly setSFXVolume: (volume: number) => void;
  readonly setEnabled: (enabled: boolean) => void;
  readonly bgmVolume: number;
  readonly sfxVolume: number;
  readonly enabled: boolean;
  readonly hasUserInteracted: boolean;
};

const AudioContext = createContext<AudioContextValue | null>(null);

type AudioProviderProps = {
  readonly children: ReactNode;
};

export const AudioProvider = ({ children }: AudioProviderProps) => {
  const [bgmVolume, setBGMVolumeState] = useState<number>(audioManager.getBGMVolume());
  const [sfxVolume, setSFXVolumeState] = useState<number>(audioManager.getSFXVolume());
  const [enabled, setEnabledState] = useState<boolean>(audioManager.isEnabled());
  const [hasUserInteracted, setHasUserInteracted] = useState<boolean>(audioManager.hasUserInteracted());

  useEffect(() => {
    const handleUserInteraction = (): void => {
      audioManager.markUserInteracted();
      setHasUserInteracted(true);
    };

    // Listen for user interactions
    const events = ["click", "touchstart", "keydown"];
    events.forEach((event) => {
      document.addEventListener(event, handleUserInteraction, { once: true, passive: true });
    });

    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, handleUserInteraction);
      });
    };
  }, []);

  const playSound = (type: SoundEffectType): void => {
    audioManager.playSound(type);
  };

  const playBGM = (bgmType: "select" | "battle", loop?: boolean): void => {
    // Audio manager will resolve the full URL based on configuration
    audioManager.playBGM(bgmType, loop);
  };

  const stopBGM = (): void => {
    audioManager.stopBGM();
  };

  const setBGMVolume = (volume: number): void => {
    audioManager.setBGMVolume(volume);
    setBGMVolumeState(volume);
  };

  const setSFXVolume = (volume: number): void => {
    audioManager.setSFXVolume(volume);
    setSFXVolumeState(volume);
  };

  const setEnabled = (enabledValue: boolean): void => {
    audioManager.setEnabled(enabledValue);
    setEnabledState(enabledValue);
  };

  const value: AudioContextValue = {
    playSound,
    playBGM,
    stopBGM,
    setBGMVolume,
    setSFXVolume,
    setEnabled,
    bgmVolume,
    sfxVolume,
    enabled,
    hasUserInteracted
  };

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
};

export const useAudio = (): AudioContextValue => {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error("useAudio must be used within AudioProvider");
  }
  return context;
};

