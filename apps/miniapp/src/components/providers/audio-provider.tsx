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
  readonly setMusicActive: (active: boolean) => void;
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

  useEffect(() => {
    const syncVisibility = () => audioManager.setMusicPaused(document.hidden);
    const pauseMusic = () => audioManager.setMusicPaused(true);
    document.addEventListener("visibilitychange", syncVisibility);
    window.addEventListener("xuhuan:deactivated", pauseMusic);
    window.addEventListener("xuhuan:activated", syncVisibility);
    return () => {
      document.removeEventListener("visibilitychange", syncVisibility);
      window.removeEventListener("xuhuan:deactivated", pauseMusic);
      window.removeEventListener("xuhuan:activated", syncVisibility);
    };
  }, []);

  const toggleMuted = useCallback(() => {
    setMuted((current) => {
      audioManager.setMuted(!current);
      return !current;
    });
  }, []);
  const setMusicActive = useCallback(
    (active: boolean) => audioManager.setMusicActive(active),
    [],
  );

  const value = useMemo<AudioContextValue>(
    () => ({ muted, playSound: (type) => audioManager.playSound(type), setMusicActive, toggleMuted }),
    [muted, setMusicActive, toggleMuted],
  );
  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
};

export const useAudio = (): AudioContextValue => {
  const context = useContext(AudioContext);
  if (!context) throw new Error("useAudio must be used within AudioProvider");
  return context;
};
