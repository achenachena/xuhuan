"use client";

import { useState } from "react";
import clsx from "clsx";
import { useAudio } from "@/components/providers/audio-provider";
import useTelegramTheme from "@/hooks/use-telegram-theme";

const AudioControls = () => {
  const { bgmVolume, sfxVolume, enabled, setBGMVolume, setSFXVolume, setEnabled } = useAudio();
  const { colorScheme } = useTelegramTheme();
  const isDark = colorScheme === "dark";
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  const handleToggleMute = (): void => {
    setEnabled(!enabled);
  };

  const handleBGMVolumeChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const volume = parseFloat(event.target.value);
    setBGMVolume(volume);
  };

  const handleSFXVolumeChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const volume = parseFloat(event.target.value);
    setSFXVolume(volume);
  };

  const toggleExpanded = (): void => {
    setIsExpanded(!isExpanded);
  };

  const buttonClassName = clsx(
    "flex items-center justify-center rounded-full p-2 transition-all",
    {
      "bg-white/10 hover:bg-white/20 text-white": isDark,
      "bg-slate-100 hover:bg-slate-200 text-slate-700": !isDark
    }
  );

  const panelClassName = clsx(
    "absolute bottom-full right-0 mb-2 rounded-2xl border p-4 shadow-lg backdrop-blur-md transition-all",
    {
      "border-white/10 bg-white/10": isDark,
      "border-slate-200 bg-white": !isDark
    }
  );

  return (
    <div className="relative">
      <button
        type="button"
        className={buttonClassName}
        onClick={toggleExpanded}
        aria-label={enabled ? "音频设置" : "音频已静音"}
        aria-expanded={isExpanded}
        tabIndex={0}
      >
        <span className="text-xl">{enabled ? "🔊" : "🔇"}</span>
      </button>

      {isExpanded && (
        <div className={panelClassName} style={{ minWidth: "200px" }}>
          <div className="mb-3 flex items-center justify-between">
            <span className={clsx("text-sm font-semibold", { "text-white": isDark, "text-slate-900": !isDark })}>
              音频设置
            </span>
            <button
              type="button"
              onClick={handleToggleMute}
              className={clsx("rounded px-2 py-1 text-xs", {
                "bg-white/10 hover:bg-white/20 text-white": isDark,
                "bg-slate-100 hover:bg-slate-200 text-slate-700": !isDark
              })}
              aria-label={enabled ? "静音" : "取消静音"}
              tabIndex={0}
            >
              {enabled ? "静音" : "取消静音"}
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label
                className={clsx("mb-1 block text-xs font-medium", {
                  "text-white/80": isDark,
                  "text-slate-700": !isDark
                })}
              >
                背景音乐: {Math.round(bgmVolume * 100)}%
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={bgmVolume}
                onChange={handleBGMVolumeChange}
                disabled={!enabled}
                className="w-full"
                aria-label="背景音乐音量"
              />
            </div>

            <div>
              <label
                className={clsx("mb-1 block text-xs font-medium", {
                  "text-white/80": isDark,
                  "text-slate-700": !isDark
                })}
              >
                音效: {Math.round(sfxVolume * 100)}%
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={sfxVolume}
                onChange={handleSFXVolumeChange}
                disabled={!enabled}
                className="w-full"
                aria-label="音效音量"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AudioControls;

