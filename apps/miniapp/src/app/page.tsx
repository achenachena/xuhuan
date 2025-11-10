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
  HeroActionKind,
  FightingMove,
  FightingMoveKind,
  StatusEffectState
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
  statusEffects: [],
  specialMeter: 0,
  comboCount: 0,
  isBlocking: false
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
  statusEffects: [],
  specialMeter: 0,
  comboCount: 0,
  isBlocking: false
};

const FIGHTING_ACTIONS: Array<{ readonly kind: FightingMoveKind; readonly title: string; readonly hint: string; readonly icon: string; readonly meterCost: number }> = [
  {
    kind: "lightAttack",
    title: "Light Attack",
    hint: "Quick strike with low damage",
    icon: "👊",
    meterCost: 0
  },
  {
    kind: "heavyAttack",
    title: "Heavy Attack",
    hint: "Powerful strike with high damage",
    icon: "💥",
    meterCost: 0
  },
  {
    kind: "specialMove",
    title: "SPECIAL MOVE",
    hint: "Ultimate technique (Costs 50 meter)",
    icon: "⚡",
    meterCost: 50
  },
  {
    kind: "block",
    title: "Block",
    hint: "Reduce damage from next attack",
    icon: "🛡️",
    meterCost: 0
  }
];

const createCombatantClone = (base: CombatantState): CombatantState => {
  return {
    ...base,
    attributes: { ...base.attributes },
    statusEffects: base.statusEffects.map((effect: StatusEffectState) => ({ ...effect })),
    currentHealth: base.attributes.maxHealth,
    specialMeter: 0,
    comboCount: 0,
    isBlocking: false
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
  specialMeter,
  onAction
}: {
  readonly disabled: boolean;
  readonly specialMeter: number;
  readonly onAction: (action: FightingMoveKind) => void;
}) => {
  const handleSelect = (actionKind: FightingMoveKind, meterCost: number) => {
    if (disabled) {
      return;
    }
    // Check if player has enough meter for special move
    if (actionKind === "specialMove" && specialMeter < meterCost) {
      return; // Can't use special move
    }
    onAction(actionKind);
  };

  const handleKeyDown: KeyboardEventHandler<HTMLButtonElement> = (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    const kind = event.currentTarget.dataset.kind as FightingMoveKind;
    const meterCost = Number(event.currentTarget.dataset.meterCost);
    handleSelect(kind, meterCost);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Special Meter Display */}
      <div className="rounded-2xl border border-purple-500/40 bg-purple-500/10 p-4">
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-purple-100">Special Meter</p>
        <div className="h-3 overflow-hidden rounded-full border border-purple-400/30 bg-black/30">
          <div
            className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
            style={{ width: `${specialMeter}%` }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={specialMeter}
            aria-label="Special meter"
          />
        </div>
        <p className="mt-1 text-right text-xs text-purple-100/70">{specialMeter}/100</p>
      </div>

      {/* Fighting Actions */}
      <div className="grid grid-cols-2 gap-3">
        {FIGHTING_ACTIONS.map((action) => {
          const canUse = action.kind !== "specialMove" || specialMeter >= action.meterCost;
          const isDisabled = disabled || !canUse;

          return (
            <button
              key={action.kind}
              data-kind={action.kind}
              data-meter-cost={action.meterCost}
              type="button"
              className={clsx(
                "rounded-2xl px-4 py-3 text-center transition-all",
                action.kind === "specialMove"
                  ? "col-span-2"
                  : "",
                isDisabled
                  ? "cursor-not-allowed border border-white/10 bg-white/5 text-white/40"
                  : action.kind === "specialMove"
                  ? "border-2 border-purple-500 bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/50 hover:shadow-purple-500/70"
                  : action.kind === "block"
                  ? "border border-blue-500/40 bg-blue-500/20 text-blue-100 hover:bg-blue-500/30"
                  : action.kind === "heavyAttack"
                  ? "border border-red-500/40 bg-red-500/20 text-red-100 hover:bg-red-500/30"
                  : "border border-yellow-500/40 bg-yellow-500/20 text-yellow-100 hover:bg-yellow-500/30"
              )}
              aria-label={`${action.title}: ${action.hint}`}
              onClick={() => {
                handleSelect(action.kind, action.meterCost);
              }}
              onKeyDown={handleKeyDown}
              tabIndex={0}
              disabled={isDisabled}
            >
              <span className="block text-2xl">{action.icon}</span>
              <span className={clsx("block font-semibold", action.kind === "specialMove" ? "text-base" : "text-sm")}>
                {action.title}
              </span>
              <span className="block text-xs opacity-70">{action.hint}</span>
            </button>
          );
        })}
      </div>
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
    (actionKind: FightingMoveKind) => {
      if (isResolving || battleState.outcome !== "inProgress" || !battleContextRef.current) {
        if (battleState.outcome !== "inProgress") {
          setIsRewardVisible(true);
        }
        return;
      }
      setIsResolving(true);
      const result = resolveTurn(battleContextRef.current, { kind: actionKind } satisfies FightingMove);
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
            specialMeter={battleState.hero.specialMeter}
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

