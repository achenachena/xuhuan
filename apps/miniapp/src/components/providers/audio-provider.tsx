"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { audioManager, type SoundEffectType } from "@/lib/audio-manager";

type AudioContextValue = {
  readonly muted: boolean;
  readonly playSound: (type: SoundEffectType) => void;
  readonly toggleMuted: () => void;
};

const AudioContext = createContext<AudioContextValue | null>(null);

export const AudioProvider = ({ children }: { readonly children: ReactNode }) => {
  const [muted, setMuted] = useState(() => audioManager.isMuted());

  useEffect(() => {
    const events = ["pointerdown", "keydown"] as const;
    const markInteraction = () => {
      audioManager.markUserInteracted();
      events.forEach((event) => document.removeEventListener(event, markInteraction));
    };
    events.forEach((event) =>
      document.addEventListener(event, markInteraction, { passive: true }),
    );
    return () =>
      events.forEach((event) => document.removeEventListener(event, markInteraction));
  }, []);

  const toggleMuted = useCallback(() => {
    setMuted((current) => {
      audioManager.setMuted(!current);
      return !current;
    });
  }, []);

  const value = useMemo<AudioContextValue>(
    () => ({ muted, playSound: (type) => audioManager.playSound(type), toggleMuted }),
    [muted, toggleMuted],
  );
  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
};

export const useAudio = (): AudioContextValue => {
  const context = useContext(AudioContext);
  if (!context) throw new Error("useAudio must be used within AudioProvider");
  return context;
};
