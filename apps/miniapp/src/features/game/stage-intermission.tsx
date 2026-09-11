"use client";

import type { GameLocale } from "@/features/game/game-copy";
import type { ShooterStoryScene } from "@/lib/api/types";

type Props = {
  readonly stageCleared?: boolean;
  readonly backgroundURL?: string;
  readonly scene: ShooterStoryScene;
  readonly locale: GameLocale;
  readonly busy: boolean;
  readonly onChoose: (sceneID: string, optionID: string) => void;
};

export const StageIntermission = ({ scene, locale, busy, onChoose, backgroundURL, stageCleared = true }: Props) => {
  const ending = scene.id === "zero-channel-ending";
  const english = locale === "en";
  const context = scene.messages.find(message => message.sender_id !== "system");
  return (
    <main data-game-surface="true" style={backgroundURL ? { backgroundImage: `linear-gradient(rgba(2,5,14,.88), rgba(2,5,14,.94)), url("${backgroundURL}")`, backgroundSize: "cover", backgroundPosition: "center" } : undefined} className="grid min-h-[var(--xuhuan-stable-height,100dvh)] place-items-center bg-[#02050e] px-4 pb-[var(--xuhuan-host-safe-bottom)] pt-[calc(var(--xuhuan-host-safe-top)+3rem)] text-white">
      <article data-testid="intermission-story" className="w-full max-w-sm border border-cyan-200/30 bg-gradient-to-b from-[#122841] to-[#071225] p-5 shadow-[6px_6px_0_#172554]">
        <p className="font-mono text-xs font-bold tracking-widest text-cyan-300">
          {ending ? (english ? "FINAL SIGNAL" : "最终信号") : (stageCleared ? (english ? "STAGE CLEAR" : "关卡已通关") : (english ? "RESTORED SIGNAL" : "恢复的信号"))}
        </p>
        <h1 className="mt-3 text-2xl font-black leading-tight">{scene.title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-200">
          {ending ? (english ? "The battle is over. Choose how the story ends." : "战斗结束了。选择故事的结局。") : (english ? "Choose what happens to the restored signal." : "决定如何处理恢复的信号。")}
        </p>
        {context && <p className="mt-3 border-l-2 border-cyan-300/50 pl-3 text-sm leading-6 text-slate-200">
          {context.text}
        </p>}
        <details className="my-4 border-y border-white/10 py-3 text-sm text-slate-300">
          <summary className="cursor-pointer text-cyan-200">{english ? "Story so far" : "剧情回顾"}</summary>
          <div className="mt-3 space-y-3 leading-6">
            {scene.messages.filter(message => message !== context).map((message, index) => <p key={index}>{message.text}</p>)}
          </div>
        </details>
        <div className="grid gap-3">
          {scene.options.map(option => <button key={option.id} type="button" data-testid={`story-option-${option.id}`} disabled={busy}
            onClick={() => onChoose(scene.id, option.id)}
            className="min-h-14 border border-cyan-200/30 bg-cyan-300/10 p-3 text-left hover:bg-cyan-300/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200 disabled:opacity-50">
            <span className="block text-sm font-bold text-cyan-50">{option.label}</span>
            {option.hint && <span className="mt-1 block text-xs leading-5 text-slate-300">{option.hint}</span>}
          </button>)}
        </div>
      </article>
    </main>
  );
};
