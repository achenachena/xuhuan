"use client";

import Image from "next/image";
import type { KeyboardEvent } from "react";

import {
  gameText,
  type GameCopyKey,
  type GameLocale,
} from "@/features/game/game-copy";
import type { APIGameContent, APIGameRun } from "@/lib/api/client";

type RouteMapProps = {
  readonly content: APIGameContent;
  readonly run: APIGameRun;
  readonly locale: GameLocale;
  readonly busy: boolean;
  readonly onChooseNode: (nodeId: string) => void;
  readonly onAbandon: () => void;
};

const nodeKeys: Record<string, GameCopyKey> = {
  tutorial: "nodeTutorial",
  combat: "nodeCombat",
  elite: "nodeElite",
  event: "nodeEvent",
  story: "nodeStory",
  rest: "nodeRest",
  boss: "nodeBoss",
};

const nodeIcons: Record<string, string> = {
  tutorial: "⌁",
  combat: "⚔",
  elite: "◆",
  event: "?",
  story: "▣",
  rest: "⌂",
  boss: "◉",
};

const objectiveKeys: Record<string, GameCopyKey> = {
  purge: "objectivePurge",
  stabilize: "objectiveStabilize",
  recover: "objectiveRecover",
  holdout: "objectiveHoldout",
  elite: "objectiveElite",
  boss: "objectiveBoss",
};

const hazardKeys: Record<string, GameCopyKey> = {
  crossfire: "hazardCrossfire",
  distortion_rain: "hazardDistortionRain",
  narrow_arena: "hazardNarrowArena",
  signal_decay: "hazardSignalDecay",
};

const rewardKeys: Record<string, GameCopyKey> = {
  surge: "signalSurge",
  guard: "signalGuard",
  echo: "signalEcho",
  glitch: "signalGlitch",
};

const statusKeys: Record<string, GameCopyKey> = {
  available: "available",
  completed: "cleared",
  current: "current",
  locked: "locked",
};

const pointFor = (layer: number, lane: number, peers: number) => ({
  x: peers === 1 ? 150 : lane === 0 ? 88 : 212,
  y: 390 - layer * 52,
});

export const RouteMap = ({
  content,
  run,
  locale,
  busy,
  onChooseNode,
  onAbandon,
}: RouteMapProps) => {
  const state = run.state;
  const nodes = state.map.nodes ?? [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const layerCounts = new Map<number, number>();
  for (const node of nodes) {
    layerCounts.set(node.layer, (layerCounts.get(node.layer) ?? 0) + 1);
  }
  const position = (node: (typeof state.map.nodes)[number]) =>
    pointFor(node.layer, node.lane, layerCounts.get(node.layer) ?? 1);
  const availableNodes = nodes.filter((node) => node.status === "available");

  const choose = (nodeId: string, status: string) => {
    if (!busy && status === "available") onChooseNode(nodeId);
  };
  const onKeyDown = (
    event: KeyboardEvent<SVGGElement>,
    nodeId: string,
    status: string,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(nodeId, status);
    }
  };
  const nodeLabel = (type: string) =>
    gameText(locale, nodeKeys[type] ?? "nodeCombat");

  return (
    <main
      data-game-surface="true"
      className="mx-auto min-h-[var(--xuhuan-stable-height,100dvh)] w-full max-w-lg bg-[#060b15] text-white"
    >
      <header
        data-testid="route-map-header"
        className="border-b-2 border-cyan-300/20 bg-[#0b1424]/95 px-4 pb-3 pt-[var(--xuhuan-host-safe-top)] backdrop-blur"
      >
        <div className="flex items-center justify-between gap-2 pr-[4.5rem]">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-200">
              {gameText(locale, "map")}
            </p>
            <p className="mt-1 truncate text-sm font-bold">
              {content.chapters.find(
                (item) => item.slug === state.chapter_slug,
              )?.title ?? state.chapter_slug}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onAbandon}
            className="shrink-0 border-2 border-rose-400/25 bg-rose-500/5 px-2.5 py-1.5 text-[10px] text-rose-200 disabled:opacity-40"
          >
            {gameText(locale, "abandon")}
          </button>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2 font-mono text-[10px]">
          <div className="border border-white/10 bg-white/5 px-2 py-2 text-slate-400">
            {gameText(locale, "hp")}
            <strong className="block text-emerald-300">
              {state.health}/{state.max_health}
            </strong>
          </div>
          <div className="border border-white/10 bg-white/5 px-2 py-2 text-slate-400">
            {gameText(locale, "modules")}
            <strong className="block text-white">{state.modules.length}/6</strong>
          </div>
          <div className="border border-white/10 bg-white/5 px-2 py-2 text-slate-400">
            {gameText(locale, "noise")}
            <strong className="block text-cyan-200">N-{state.noise_level}</strong>
          </div>
          <div className="border border-white/10 bg-white/5 px-2 py-2 text-slate-400">
            {gameText(locale, "score")}
            <strong className="block text-violet-200">{state.score}</strong>
          </div>
        </div>
      </header>

      <section className="px-3 py-3">
        <p className="px-2 text-xs leading-5 text-slate-400">
          {gameText(locale, "mapHint")}
        </p>
        <svg
          viewBox="0 0 300 410"
          role="img"
          aria-label={gameText(locale, "map")}
          className="mx-auto block h-[min(48dvh,390px)] w-full max-w-sm"
        >
          <defs>
            <filter id="node-glow">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {nodes.flatMap((node) => {
            const start = position(node);
            return (node.next ?? []).map((nextId) => {
              const next = nodeById.get(nextId);
              if (!next) return null;
              const end = position(next);
              const open = node.status !== "locked" && next.status !== "locked";
              return (
                <line
                  key={`${node.id}-${nextId}`}
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  stroke={open ? "#22d3ee" : "#263247"}
                  strokeWidth={open ? 2 : 1.5}
                  strokeDasharray={open ? undefined : "4 5"}
                  opacity={open ? 0.65 : 0.8}
                />
              );
            });
          })}
          {nodes.map((node) => {
            const { x, y } = position(node);
            const available = node.status === "available";
            const completed = node.status === "completed";
            return (
              <g
                key={node.id}
                role="button"
                tabIndex={available ? 0 : -1}
                aria-label={`${nodeLabel(node.type)} ${gameText(locale, statusKeys[node.status] ?? "locked")}`}
                aria-disabled={!available}
                onClick={() => choose(node.id, node.status)}
                onKeyDown={(event) => onKeyDown(event, node.id, node.status)}
                className={available ? "cursor-pointer" : "cursor-default"}
                filter={available ? "url(#node-glow)" : undefined}
              >
                <rect
                  x={x - (node.type === "boss" ? 24 : 20)}
                  y={y - (node.type === "boss" ? 24 : 20)}
                  width={node.type === "boss" ? 48 : 40}
                  height={node.type === "boss" ? 48 : 40}
                  rx="4"
                  fill={completed ? "#17253a" : available ? "#67e8f9" : "#111827"}
                  stroke={completed ? "#475569" : available ? "#a78bfa" : "#334155"}
                  strokeWidth={available ? 3 : 2}
                />
                <text
                  x={x}
                  y={y + 5}
                  textAnchor="middle"
                  fill={available ? "#071018" : completed ? "#94a3b8" : "#64748b"}
                  fontSize="15"
                  fontWeight="700"
                >
                  {completed ? "✓" : (nodeIcons[node.type] ?? "◆")}
                </text>
                <text
                  x={x}
                  y={y + 34}
                  textAnchor="middle"
                  fill={available ? "#e0f2fe" : "#64748b"}
                  fontSize="9"
                >
                  {nodeLabel(node.type)}
                </text>
              </g>
            );
          })}
        </svg>
      </section>

      {availableNodes.length > 0 ? (
        <section className="px-4 pb-5">
          <div className="grid gap-3">
            {availableNodes.map((node) => {
              const enemies = (node.enemy_slugs ?? [])
                .map((slug) => content.enemies.find((enemy) => enemy.slug === slug))
                .filter((enemy): enemy is APIGameContent["enemies"][number] => Boolean(enemy));
              const risk = Math.max(1, Math.min(3, node.risk ?? 1));
              const riskKey: GameCopyKey = risk === 1 ? "riskLow" : risk === 2 ? "riskMedium" : "riskHigh";
              return (
                <button
                  key={node.id}
                  data-testid={`route-node-${node.id}`}
                  data-node-type={node.type}
                  type="button"
                  disabled={busy}
                  onClick={() => onChooseNode(node.id)}
                  className="border-2 border-cyan-300/35 bg-[#0a1726] p-3 text-left shadow-[4px_4px_0_rgba(8,145,178,.3)] active:translate-x-1 active:translate-y-1 active:shadow-none disabled:opacity-50"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span>
                      <strong className="block text-sm text-white">{nodeLabel(node.type)}</strong>
                      <span className="mt-1 block text-xs leading-5 text-cyan-100">
                        {node.objective && objectiveKeys[node.objective]
                          ? gameText(locale, objectiveKeys[node.objective])
                          : node.event_slug
                            ? gameText(locale, "event")
                            : gameText(locale, "rest")}
                      </span>
                    </span>
                    <span className={`border px-2 py-1 font-mono text-[9px] font-bold ${risk === 3 ? "border-rose-300/50 bg-rose-400/10 text-rose-200" : "border-amber-300/40 bg-amber-300/10 text-amber-100"}`}>
                      {gameText(locale, "risk")} {gameText(locale, riskKey)}
                    </span>
                  </span>
                  {enemies.length > 0 ? (
                    <span className="mt-3 flex items-center gap-2">
                      {enemies.slice(0, 3).map((enemy) => (
                        <span key={enemy.slug} className="flex min-w-0 items-center gap-1.5 border border-white/10 bg-black/25 px-2 py-1">
                          <span className="relative h-6 w-6 shrink-0">
                            <Image src={enemy.image_url} alt="" fill sizes="24px" className="object-contain [image-rendering:pixelated]" />
                          </span>
                          <span className="max-w-20 truncate text-[9px] text-slate-300">{enemy.name}</span>
                        </span>
                      ))}
                    </span>
                  ) : null}
                  <span className="mt-3 flex flex-wrap gap-1.5 font-mono text-[9px]">
                    {node.reward_bias && rewardKeys[node.reward_bias] ? (
                      <span className="border border-violet-300/25 bg-violet-400/10 px-2 py-1 text-violet-200">
                        {gameText(locale, "rewardBias")}: {gameText(locale, rewardKeys[node.reward_bias])}
                      </span>
                    ) : null}
                    {(node.hazards ?? []).map((hazard) => (
                      <span key={hazard} className="border border-rose-300/25 bg-rose-400/10 px-2 py-1 text-rose-200">
                        {hazardKeys[hazard] ? gameText(locale, hazardKeys[hazard]) : hazard.replaceAll("_", " ")}
                      </span>
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <footer className="px-4 pb-[var(--xuhuan-host-safe-bottom)]">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
          {gameText(locale, "plugins")}
        </p>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {state.plugins.length === 0 ? (
            <span className="text-xs text-slate-600">{gameText(locale, "noPlugins")}</span>
          ) : (
            state.plugins.map((slug) => {
              const plugin = content.plugins.find((item) => item.slug === slug);
              return (
                <span key={slug} title={plugin?.description} className="shrink-0 border border-violet-400/25 bg-violet-500/10 px-3 py-1 text-[11px] text-violet-100">
                  {plugin?.name ?? slug}
                </span>
              );
            })
          )}
        </div>
      </footer>
    </main>
  );
};
