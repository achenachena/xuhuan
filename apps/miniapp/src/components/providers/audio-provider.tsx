"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { audioManager, type SoundEffectType } from "@/lib/audio-manager";

type AudioContextValue = {
  readonly playSound: (type: SoundEffectType) => void;
  readonly playBGM: (bgmType: "select" | "battle", loop?: boolean) => void;
  readonly stopBGM: () => void;
};

const AudioContext = createContext<AudioContextValue | null>(null);

const audioContextValue: AudioContextValue = {
  playSound: (type) => audioManager.playSound(type),
  playBGM: (bgmType, loop) => audioManager.playBGM(bgmType, loop),
  stopBGM: () => audioManager.stopBGM()
};

type AudioProviderProps = {
  readonly children: ReactNode;
};

export const AudioProvider = ({ children }: AudioProviderProps) => {
  useEffect(() => {
    const events = ["click", "touchstart", "keydown"] as const;
    const removeListeners = (): void => {
      events.forEach((event) => document.removeEventListener(event, handleUserInteraction));
    };
    const handleUserInteraction = (): void => {
      audioManager.markUserInteracted();
      removeListeners();
    };

    events.forEach((event) => document.addEventListener(event, handleUserInteraction, { passive: true }));

    return removeListeners;
  }, []);

  return <AudioContext.Provider value={audioContextValue}>{children}</AudioContext.Provider>;
};

export const useAudio = (): AudioContextValue => {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error("useAudio must be used within AudioProvider");
  }
  return context;
};
