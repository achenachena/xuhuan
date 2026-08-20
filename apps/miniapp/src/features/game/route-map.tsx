import type { KeyboardEvent } from "react";

import type { APIGameContent, APIGameRun } from "@/lib/api/client";
import {
  gameText,
  type GameCopyKey,
  type GameLocale,
} from "@/features/game/game-copy";

type RouteMapProps = {
  readonly content: APIGameContent;
  readonly run: APIGameRun;
  readonly locale: GameLocale;
  readonly busy: boolean;
  readonly onChooseNode: (nodeId: string) => void;
  readonly onAbandon: () => void;
};

const nodeKey: Record<string, GameCopyKey> = {
  tutorial: "nodeTutorial",
  combat: "nodeCombat",
  elite: "nodeElite",
  event: "nodeEvent",
  story: "nodeStory",
  rest: "nodeRest",
  boss: "nodeBoss",
};

const nodeIcon: Record<string, string> = {
  tutorial: "⌁",
  combat: "⚔",
  elite: "◆",
  event: "?",
  story: "▣",
  rest: "⌂",
  boss: "◉",
};

const pointFor = (layer: number, lane: number, peers: number) => ({
  x: peers === 1 ? 150 : lane === 0 ? 86 : 214,
  y: 390 - layer * 55,
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
  const pluginSlugs = state.plugins ?? [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const layerCounts = new Map<number, number>();
  for (const node of nodes) {
    layerCounts.set(node.layer, (layerCounts.get(node.layer) ?? 0) + 1);
  }
  const position = (node: (typeof state.map.nodes)[number]) =>
    pointFor(node.layer, node.lane, layerCounts.get(node.layer) ?? 1);

  const choose = (nodeId: string, status: string) => {
    if (!busy && status === "available") {
      onChooseNode(nodeId);
    }
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

  return (
    <main className="mx-auto min-h-[100dvh] w-full max-w-lg bg-[#080d18] text-white">
      <header
        data-testid="route-map-header"
        className="border-b border-white/10 bg-[#101827]/95 px-4 pb-3 pt-[var(--xuhuan-host-safe-top)] backdrop-blur"
      >
        <div className="flex items-center justify-between gap-2 pr-[4.5rem]">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-300">
              {gameText(locale, "map")}
            </p>
            <p className="mt-1 truncate text-sm font-semibold">
              {
                content.chapters.find(
                  (item) => item.slug === state.chapter_slug,
                )?.title
              }
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onAbandon}
            className="shrink-0 rounded-lg border border-rose-400/20 px-2.5 py-1.5 text-[10px] text-rose-300 disabled:opacity-40"
          >
            {gameText(locale, "abandon")}
          </button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-lg bg-white/5 px-2 py-2">
            <span className="text-slate-500">{gameText(locale, "hp")}</span>
            <strong className="ml-1 text-emerald-300">
              {state.health}/{state.max_health}
            </strong>
          </div>
          <div className="rounded-lg bg-white/5 px-2 py-2">
            <span className="text-slate-500">
              {gameText(locale, "modules")}
            </span>
            <strong className="ml-1">{state.modules.length}/6</strong>
          </div>
          <div className="rounded-lg bg-white/5 px-2 py-2">
            <span className="text-slate-500">N-</span>
            <strong className="text-cyan-300">{state.noise_level}</strong>
          </div>
        </div>
      </header>

      <section className="px-3 py-3">
        <p className="px-2 text-xs leading-5 text-slate-500">
          {gameText(locale, "mapHint")}
        </p>
        <svg
          viewBox="0 0 300 410"
          role="img"
          aria-label={gameText(locale, "map")}
          className="mx-auto mt-1 block h-[min(59dvh,430px)] w-full max-w-sm"
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
                  opacity={open ? 0.55 : 0.75}
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
                aria-label={`${gameText(locale, nodeKey[node.type])} ${node.status}`}
                aria-disabled={!available}
                onClick={() => choose(node.id, node.status)}
                onKeyDown={(event) => onKeyDown(event, node.id, node.status)}
                className={available ? "cursor-pointer" : "cursor-default"}
                filter={available ? "url(#node-glow)" : undefined}
              >
                <circle
                  cx={x}
                  cy={y}
                  r={node.type === "boss" ? 24 : 20}
                  fill={
                    completed ? "#17253a" : available ? "#67e8f9" : "#111827"
                  }
                  stroke={
                    completed ? "#475569" : available ? "#a78bfa" : "#334155"
                  }
                  strokeWidth={available ? 3 : 2}
                />
                <text
                  x={x}
                  y={y + 5}
                  textAnchor="middle"
                  fill={
                    available ? "#071018" : completed ? "#94a3b8" : "#64748b"
                  }
                  fontSize="15"
                  fontWeight="700"
                >
                  {completed ? "✓" : nodeIcon[node.type]}
                </text>
                <text
                  x={x}
                  y={y + 34}
                  textAnchor="middle"
                  fill={available ? "#e0f2fe" : "#64748b"}
                  fontSize="9"
                >
                  {gameText(locale, nodeKey[node.type])}
                </text>
              </g>
            );
          })}
        </svg>
      </section>

      <footer className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <p className="text-[10px] uppercase tracking-[0.18em] text-slate-600">
          {gameText(locale, "plugins")}
        </p>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {pluginSlugs.length === 0 ? (
            <span className="text-xs text-slate-600">
              {gameText(locale, "noPlugins")}
            </span>
          ) : (
            pluginSlugs.map((slug) => {
              const plugin = content.plugins.find((item) => item.slug === slug);
              return (
                <span
                  key={slug}
                  title={plugin?.description}
                  className="shrink-0 rounded-full border border-violet-400/25 bg-violet-500/10 px-3 py-1 text-[11px] text-violet-200"
                >
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
