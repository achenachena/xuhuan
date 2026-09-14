"use client";

import type { GameLocale } from "@/features/game/game-copy";
import type { ShooterStoryScene } from "@/lib/api/types";
import styles from "./story-actions.module.css";
import { StoryAction, storyActions } from "./story-actions";

type Props = {
  readonly backgroundURL?: string;
  readonly portraitURL?: string;
  readonly scene: ShooterStoryScene;
  readonly locale: GameLocale;
  readonly busy: boolean;
  readonly selectedID?: string;
  readonly retryStart?: () => void;
  readonly onChoose: (sceneID: string, optionID: string) => void;
};

export const StageIntermission = ({
  scene,
  locale,
  busy,
  onChoose,
  backgroundURL,
  portraitURL,
  selectedID,
  retryStart,
}: Props) => {
  const english = locale === "en";
  return (
    <main
      data-game-surface="true"
      style={
        backgroundURL
          ? {
              backgroundImage: `linear-gradient(rgba(2,5,14,.82), rgba(2,5,14,.94)), url("${backgroundURL}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
      className="grid min-h-[var(--xuhuan-stable-height,100dvh)] place-items-center bg-[#02050e] px-4 pb-[var(--xuhuan-host-safe-bottom)] pt-[calc(var(--xuhuan-host-safe-top)+3rem)] text-white"
    >
      <article
        data-testid="intermission-story"
        className="w-full max-w-md py-5 text-center"
      >
        <h1 className="font-mono text-xl font-black tracking-widest text-cyan-200">
          {scene.id === "zero-channel-ending"
            ? english
              ? "YOUR ENDING"
              : "你的结局"
            : english
              ? "STAGE CLEAR!"
              : "通关！"}
        </h1>
        {portraitURL && (
          <svg
            aria-hidden="true"
            viewBox="0 0 160 110"
            className={`mx-auto mt-4 h-32 w-48 [image-rendering:pixelated] ${styles.float}`}
          >
            <path
              d="M25 30h6v6h-6zM132 49h7v7h-7zM113 15h5v5h-5z"
              fill="#fde68a"
            />
            <image href={portraitURL} x="35" y="6" width="90" height="100" />
          </svg>
        )}
        <div
          className={`mt-3 grid gap-3 ${scene.options.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}
        >
          {scene.options.map((option) => (
            <button
              key={option.id}
              type="button"
              data-testid={`story-option-${option.id}`}
              disabled={busy || !!selectedID}
              aria-label={`${option.label}. ${option.hint ?? ""}`}
              aria-pressed={selectedID === option.id}
              onClick={() => onChoose(scene.id, option.id)}
              className={`min-h-44 rounded-xl border-2 bg-[#102338]/90 px-2 pb-5 text-center transition-opacity hover:bg-[#19354f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200 ${selectedID === option.id ? "border-amber-200" : "border-cyan-200/30"} ${selectedID && selectedID !== option.id ? "opacity-25" : ""}`}
            >
              <StoryAction
                id={option.id}
                portraitURL={portraitURL}
                selected={selectedID === option.id}
              />
              <span className="block text-sm font-black text-cyan-50">
                {storyActions[option.id]?.[english ? "en" : "zh"] ??
                  option.label}
              </span>
            </button>
          ))}
        </div>
        {retryStart ? (
          <button
            type="button"
            disabled={busy}
            onClick={retryStart}
            className="mt-5 min-h-12 rounded bg-cyan-200 px-6 font-bold text-slate-950"
          >
            {english ? "Retry next stage →" : "重试进入下一关 →"}
          </button>
        ) : selectedID ? (
          <p role="status" className="mt-5 text-sm text-cyan-100">
            →
          </p>
        ) : null}
        <details className="mt-5 text-left text-sm text-slate-300">
          <summary className="mx-auto w-fit cursor-pointer p-3 text-cyan-200">
            {english ? "Story" : "剧情"}
          </summary>
          <h2 className="my-3 font-bold">{scene.title}</h2>
          <div className="space-y-3 leading-6">
            {scene.messages.map((message, index) => (
              <p key={index}>{message.text}</p>
            ))}
            {scene.options.map((option) => (
              <p key={option.id}>
                <strong>{option.label}</strong>
                <br />
                {option.hint}
              </p>
            ))}
          </div>
        </details>
      </article>
    </main>
  );
};
