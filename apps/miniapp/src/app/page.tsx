"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { KeyboardEventHandler } from "react";

import clsx from "clsx";

import CombatLog from "@/components/combat-log";
import GameScene from "@/components/game-scene";
import GameShell from "@/components/game-shell";
import RewardModal from "@/components/reward-modal";
import useTelegramTheme from "@/hooks/use-telegram-theme";
import { usePlayerProfile } from "@/hooks/use-player";
import type {
  BattleContext,
  BattleState,
  CombatantState,
  HeroAction,
  HeroActionKind
} from "@/lib/game-loop";
import { createBattleState, resolveTurn, updateBattleContext } from "@/lib/game-loop";

type StatusBadgeProps = {
  readonly title: string;
  readonly subtitle: string;
  readonly health: number;
  readonly maxHealth: number;
  readonly tone: "hero" | "enemy";
};

const HERO_TEMPLATE: CombatantState = {
  id: "hero-wanderer",
  name: "Wanderer",
  level: 3,
  kind: "hero",
  attributes: {
    maxHealth: 120,
    attack: 34,
    defense: 20,
    speed: 14,
    critRate: 0.12,
    critDamage: 0.5
  },
  currentHealth: 120,
  statusEffects: []
};

const ENEMY_TEMPLATE: CombatantState = {
  id: "drone-scout",
  name: "Training Drone",
  level: 2,
  kind: "enemy",
  attributes: {
    maxHealth: 90,
    attack: 22,
    defense: 18,
    speed: 12,
    critRate: 0.08,
    critDamage: 0.35
  },
  currentHealth: 90,
  statusEffects: []
};

const ACTIONS: Array<{ readonly kind: HeroActionKind; readonly title: string; readonly hint: string }> = [
  {
    kind: "basicAttack",
    title: "Rapid Strike",
    hint: "Reliable assault with balanced damage."
  },
  {
    kind: "chargedStrike",
    title: "Resonant Burst",
    hint: "Amplified attack with critical potential."
  },
  {
    kind: "fortify",
    title: "Phase Guard",
    hint: "Restore vitality and brace for impact."
  }
];

const createCombatantClone = (base: CombatantState): CombatantState => {
  return {
    ...base,
    attributes: { ...base.attributes },
    statusEffects: base.statusEffects.map((effect) => ({ ...effect })),
    currentHealth: base.attributes.maxHealth
  };
};

const StatusBadge = ({ title, subtitle, health, maxHealth, tone }: StatusBadgeProps) => {
  const ratio = Math.max(0, Math.min(100, Math.round((health / maxHealth) * 100)));
  const badgeClassName = clsx(
    "flex w-full flex-col gap-3 rounded-2xl border px-4 py-4 transition-colors",
    {
      "border-sky-500/40 bg-sky-500/10 text-sky-100": tone === "hero",
      "border-rose-500/40 bg-rose-500/10 text-rose-100": tone === "enemy"
    }
  );
  return (
    <div className={badgeClassName} tabIndex={0} aria-label={`${title} status`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] opacity-80">{title}</p>
          <p className="text-lg font-semibold tracking-tight">{subtitle}</p>
        </div>
        <span className="text-xs uppercase tracking-[0.2em] opacity-70">{ratio}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full border border-white/20 bg-white/10">
        <div
          className={clsx("h-full rounded-full", {
            "bg-sky-400": tone === "hero",
            "bg-rose-400": tone === "enemy"
          })}
          style={{ width: `${ratio}%` }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={maxHealth}
          aria-valuenow={health}
          aria-label={`${subtitle} health`}
        />
      </div>
      <p className="text-xs uppercase tracking-[0.2em] opacity-80">
        HP {health} / {maxHealth}
      </p>
    </div>
  );
};

const ActionBar = ({
  disabled,
  onAction
}: {
  readonly disabled: boolean;
  readonly onAction: (action: HeroActionKind) => void;
}) => {
  const handleSelect = (actionKind: HeroActionKind) => {
    if (disabled) {
      return;
    }
    onAction(actionKind);
  };

  const handleKeyDown: KeyboardEventHandler<HTMLButtonElement> = (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    const kind = event.currentTarget.dataset.kind as HeroActionKind;
    handleSelect(kind);
  };

  return (
    <div className="flex flex-col gap-3">
      {ACTIONS.map((action) => (
        <button
          key={action.kind}
          data-kind={action.kind}
          type="button"
          className={clsx(
            "w-full rounded-2xl px-4 py-3 text-left",
            disabled
              ? "cursor-not-allowed border border-white/10 bg-white/5 text-white/40"
              : "border border-white/20 bg-white/10 text-white hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          )}
          aria-label={`${action.title}: ${action.hint}`}
          onClick={() => {
            handleSelect(action.kind);
          }}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          disabled={disabled}
        >
          <span className="block text-sm font-semibold">{action.title}</span>
          <span className="block text-xs opacity-70">{action.hint}</span>
        </button>
      ))}
    </div>
  );
};

const HomePage = () => {
  const battleContextRef = useRef<BattleContext | null>(null);
  const [battleState, setBattleState] = useState<BattleState>(() => {
    const context = createBattleState({
      hero: createCombatantClone(HERO_TEMPLATE),
      enemy: createCombatantClone(ENEMY_TEMPLATE),
      seed: "tutorial-seed"
    });
    battleContextRef.current = context;
    return context.state;
  });
  const [isResolving, setIsResolving] = useState<boolean>(false);
  const [isRewardVisible, setIsRewardVisible] = useState<boolean>(false);
  const { themeParams } = useTelegramTheme();
  const { player, isLoading: isPlayerLoading } = usePlayerProfile();

  const handleResolveTurn = useCallback(
    (actionKind: HeroActionKind) => {
      if (isResolving || battleState.outcome !== "inProgress" || !battleContextRef.current) {
        if (battleState.outcome !== "inProgress") {
          setIsRewardVisible(true);
        }
        return;
      }
      setIsResolving(true);
      const result = resolveTurn(battleContextRef.current, { kind: actionKind } satisfies HeroAction);
      battleContextRef.current = updateBattleContext(battleContextRef.current, result.state);
      setBattleState(result.state);
      setIsResolving(false);
      if (result.state.outcome !== "inProgress") {
        setIsRewardVisible(true);
      }
    },
    [battleState.outcome, isResolving]
  );

  const handleRestartBattle = useCallback(() => {
    const context = createBattleState({
      hero: createCombatantClone(HERO_TEMPLATE),
      enemy: createCombatantClone(ENEMY_TEMPLATE),
      seed: `tutorial-${Date.now()}`
    });
    battleContextRef.current = context;
    setBattleState(context.state);
    setIsRewardVisible(false);
    setIsResolving(false);
  }, []);

  const heroBadge = useMemo(() => {
    return (
      <StatusBadge
        title="Operative"
        subtitle={player?.username ?? battleState.hero.name}
        health={battleState.hero.currentHealth}
        maxHealth={battleState.hero.attributes.maxHealth}
        tone="hero"
      />
    );
  }, [battleState.hero, player?.username]);

  const enemyBadge = useMemo(() => {
    return (
      <StatusBadge
        title="Encounter"
        subtitle={battleState.enemy.name}
        health={battleState.enemy.currentHealth}
        maxHealth={battleState.enemy.attributes.maxHealth}
        tone="enemy"
      />
    );
  }, [battleState.enemy]);

  const instructionOverlay = useMemo(() => {
    if (battleState.outcome !== "inProgress") {
      return null;
    }
    return (
      <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-xs uppercase tracking-[0.25em] text-sky-100">
        Select an action to resolve the turn
      </span>
    );
  }, [battleState.outcome]);

  return (
    <>
      <GameShell
        headerSlot={
          <div className="flex w-full flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] opacity-80">Telegram Mini App</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">虚环 Mini</h1>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-sm">
                <span className="block text-xs uppercase tracking-[0.2em] opacity-70">
                  Operative
                </span>
                <span className="text-base font-semibold">
                  {player?.username ?? (isPlayerLoading ? "Loading…" : "Wanderer")}
                </span>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-sm">
                <span className="block text-xs uppercase tracking-[0.2em] opacity-70">Energy</span>
                <span className="text-base font-semibold">
                  {player?.energy ?? (isPlayerLoading ? "—" : "120")}
                </span>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-sm">
                <span className="block text-xs uppercase tracking-[0.2em] opacity-70">
                  Credits
                </span>
                <span className="text-base font-semibold">
                  {player?.credits ?? (isPlayerLoading ? "—" : "4,200")}
                </span>
              </div>
            </div>
          </div>
        }
        heroHudSlot={heroBadge}
        enemyHudSlot={enemyBadge}
        combatLogSlot={<CombatLog entries={battleState.log} />}
        actionBarSlot={
          <ActionBar
            disabled={isResolving || battleState.outcome !== "inProgress"}
            onAction={handleResolveTurn}
          />
        }
      >
        <GameScene
          hero={battleState.hero}
          enemy={battleState.enemy}
          turn={battleState.turn}
          outcome={battleState.outcome}
          overlaySlot={instructionOverlay}
        />
      </GameShell>
      <RewardModal
        open={isRewardVisible}
        outcome={battleState.outcome}
        rewards={battleState.rewards}
        theme={themeParams}
        onClose={handleRestartBattle}
      />
    </>
  );
};

export default HomePage;

