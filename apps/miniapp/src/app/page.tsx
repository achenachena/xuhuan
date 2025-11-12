"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { KeyboardEventHandler } from "react";
import clsx from "clsx";

import CharacterSelect from "@/components/character-select";
import BattleArena from "@/components/battle-arena";
import RewardModal from "@/components/reward-modal";
import useTelegramTheme from "@/hooks/use-telegram-theme";
import { usePlayerProfile } from "@/hooks/use-player";
import { useCharacters } from "@/hooks/use-characters";
import type {
  BattleContext,
  BattleState,
  CombatantState,
  FightingMove,
  FightingMoveKind,
  StatusEffectState
} from "@/lib/game-loop";
import { createBattleState, resolveTurn, updateBattleContext } from "@/lib/game-loop";
import type { Character, GamePhase } from "@xuhuan/game-types";

const FIGHTING_ACTIONS: Array<{ readonly kind: FightingMoveKind; readonly title: string; readonly hint: string; readonly icon: string; readonly meterCost: number }> = [
  {
    kind: "lightAttack",
    title: "Light Attack",
    hint: "Quick strike",
    icon: "👊",
    meterCost: 0
  },
  {
    kind: "heavyAttack",
    title: "Heavy Attack",
    hint: "Power strike",
    icon: "💥",
    meterCost: 0
  },
  {
    kind: "specialMove",
    title: "SPECIAL",
    hint: "Ultimate (50 meter)",
    icon: "⚡",
    meterCost: 50
  },
  {
    kind: "block",
    title: "Block",
    hint: "Reduce damage",
    icon: "🛡️",
    meterCost: 0
  }
];

// Create combatant from character
const createCombatantFromCharacter = (character: Character, kind: "hero" | "enemy", level: number = 3): CombatantState => {
  const scalingFactor = 1 + (level - 1) * 0.15;
  return {
    id: character.slug,
    name: character.name,
    level,
    kind,
    attributes: {
      maxHealth: Math.round(character.baseHealth * scalingFactor),
      attack: Math.round(character.baseAttack * scalingFactor),
      defense: Math.round(character.baseDefense * scalingFactor),
      speed: Math.round(character.baseSpeed * scalingFactor),
      critRate: character.baseCritRate,
      critDamage: character.baseCritDamage
    },
    currentHealth: Math.round(character.baseHealth * scalingFactor),
    statusEffects: [],
    specialMeter: 0,
    comboCount: 0,
    isBlocking: false
  };
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
  const handleSelect = (actionKind: FightingMoveKind, meterCost: number): void => {
    if (disabled) {
      return;
    }
    if (actionKind === "specialMove" && specialMeter < meterCost) {
      return;
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
    <div className="w-full max-w-4xl mx-auto p-4">
      <div className="grid grid-cols-4 gap-3">
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
                "rounded-xl px-3 py-4 text-center transition-all flex flex-col items-center gap-1",
                isDisabled
                  ? "cursor-not-allowed border border-white/10 bg-white/5 text-white/40"
                  : action.kind === "specialMove"
                  ? "border-2 border-purple-500 bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg hover:shadow-purple-500/70"
                  : action.kind === "block"
                  ? "border border-blue-500/40 bg-blue-500/20 text-blue-100 hover:bg-blue-500/30"
                  : action.kind === "heavyAttack"
                  ? "border border-red-500/40 bg-red-500/20 text-red-100 hover:bg-red-500/30"
                  : "border border-yellow-500/40 bg-yellow-500/20 text-yellow-100 hover:bg-yellow-500/30"
              )}
              onClick={() => {
                handleSelect(action.kind, action.meterCost);
              }}
              onKeyDown={handleKeyDown}
              tabIndex={0}
              disabled={isDisabled}
            >
              <span className="text-3xl">{action.icon}</span>
              <span className="text-xs font-semibold">{action.title}</span>
              <span className="text-[10px] opacity-70">{action.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

const HomePage = () => {
  const [gamePhase, setGamePhase] = useState<GamePhase>("select");
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [opponentCharacter, setOpponentCharacter] = useState<Character | null>(null);

  const battleContextRef = useRef<BattleContext | null>(null);
  const [battleState, setBattleState] = useState<BattleState | null>(null);
  const [isResolving, setIsResolving] = useState<boolean>(false);
  const [isRewardVisible, setIsRewardVisible] = useState<boolean>(false);

  // Animation states for sprites
  const [heroAnimationState, setHeroAnimationState] = useState<"idle" | "attack" | "damage" | "block" | "special" | "victory" | "defeat">("idle");
  const [enemyAnimationState, setEnemyAnimationState] = useState<"idle" | "attack" | "damage" | "block" | "special" | "victory" | "defeat">("idle");

  // Battle log message
  const [battleMessage, setBattleMessage] = useState<string>("");

  const { themeParams } = useTelegramTheme();
  const { player, isLoading: isPlayerLoading } = usePlayerProfile();
  const { characters } = useCharacters();

  const handleCharacterSelected = useCallback((character: Character) => {
    setSelectedCharacter(character);

    // Select a random opponent from the other characters
    const availableOpponents = characters.filter((c) => c.slug !== character.slug);
    const randomOpponent = availableOpponents[Math.floor(Math.random() * availableOpponents.length)];

    setOpponentCharacter(randomOpponent);

    // Create battle state
    const heroCombatant = createCombatantFromCharacter(character, "hero");
    const enemyCombatant = createCombatantFromCharacter(randomOpponent, "enemy", 2);

    const context = createBattleState({
      hero: heroCombatant,
      enemy: enemyCombatant,
      seed: `battle-${Date.now()}`
    });

    battleContextRef.current = context;
    setBattleState(context.state);
    setBattleMessage("Your Turn!");
    setGamePhase("battle");
  }, [characters]);

  const handleResolveTurn = useCallback(
    (actionKind: FightingMoveKind) => {
      if (isResolving || !battleState || battleState.outcome !== "inProgress" || !battleContextRef.current) {
        if (battleState && battleState.outcome !== "inProgress") {
          setIsRewardVisible(true);
        }
        return;
      }

      setIsResolving(true);

      // PHASE 1: Hero attacks
      const actionName = actionKind === "specialMove" ? "SPECIAL MOVE" : actionKind === "heavyAttack" ? "Heavy Attack" : actionKind === "lightAttack" ? "Light Attack" : "Block";
      setBattleMessage(`Your Turn! You used ${actionName}!`);

      // Set hero animation based on action
      if (actionKind === "specialMove") {
        setHeroAnimationState("special");
      } else if (actionKind === "block") {
        setHeroAnimationState("block");
      } else {
        setHeroAnimationState("attack");
      }

      // Execute full turn resolution to get the complete result
      setTimeout(() => {
        if (!battleContextRef.current) return;

        const currentBattleState = battleState;
        const result = resolveTurn(battleContextRef.current, { kind: actionKind } satisfies FightingMove);

        // First, show only hero's action effect on enemy
        const enemyTookDamage = result.state.enemy.currentHealth < currentBattleState.enemy.currentHealth;

        if (enemyTookDamage) {
          // Show enemy taking damage animation
          setTimeout(() => {
            setEnemyAnimationState("damage");
          }, 200);
        }

        // Update state after hero action to show enemy health decrease
        const stateAfterHeroAction: BattleState = {
          ...currentBattleState,
          hero: {
            ...result.state.hero,
            // Keep hero health unchanged until enemy attacks
            currentHealth: currentBattleState.hero.currentHealth
          },
          enemy: result.state.enemy, // Update enemy health
          turn: currentBattleState.turn,
          log: result.state.log
        };

        setBattleState(stateAfterHeroAction);

        // Reset hero animation after attack
        setTimeout(() => {
          setHeroAnimationState("idle");
          if (enemyTookDamage) {
            setEnemyAnimationState("idle");
          }

          // Check if battle ended after hero action
          if (result.state.enemy.currentHealth <= 0) {
            setHeroAnimationState("victory");
            setEnemyAnimationState("defeat");
            setBattleMessage("Victory!");
            battleContextRef.current = updateBattleContext(battleContextRef.current!, result.state);
            setBattleState(result.state);
            setIsResolving(false);
            setIsRewardVisible(true);
            return;
          }

          // PHASE 2: Enemy retaliates
          setTimeout(() => {
            setBattleMessage(`${currentBattleState.enemy.name}'s Turn!`);

            // Show enemy attack animation
            const enemyActionType = Math.random() > 0.6 ? "attack" : "attack"; // Could vary this
            setEnemyAnimationState(enemyActionType);

            setTimeout(() => {
              // Hero takes damage
              const heroTookDamage = result.state.hero.currentHealth < currentBattleState.hero.currentHealth;

              if (heroTookDamage) {
                setHeroAnimationState("damage");
              }

              // Update to final state with both hero and enemy health
              battleContextRef.current = updateBattleContext(battleContextRef.current!, result.state);
              setBattleState(result.state);

              // Reset animations
              setTimeout(() => {
                if (result.state.hero.currentHealth <= 0) {
                  setHeroAnimationState("defeat");
                  setEnemyAnimationState("victory");
                  setBattleMessage("Defeat...");
                  setIsRewardVisible(true);
                } else {
                  setHeroAnimationState("idle");
                  setEnemyAnimationState("idle");
                  setBattleMessage("Your Turn!");
                }

                setIsResolving(false);

                if (result.state.outcome !== "inProgress") {
                  setIsRewardVisible(true);
                }
              }, 600);
            }, 300);
          }, 400);
        }, 600);
      }, 100);
    },
    [battleState, isResolving]
  );

  const handleRestartBattle = useCallback(() => {
    setGamePhase("select");
    setSelectedCharacter(null);
    setOpponentCharacter(null);
    setBattleState(null);
    setIsRewardVisible(false);
    setIsResolving(false);
    setHeroAnimationState("idle");
    setEnemyAnimationState("idle");
    setBattleMessage("");
  }, []);

  // Character Selection Phase
  if (gamePhase === "select") {
    return <CharacterSelect onCharacterSelected={handleCharacterSelected} />;
  }

  // Battle Phase
  if (gamePhase === "battle" && battleState && selectedCharacter && opponentCharacter) {
    return (
      <>
        <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black flex flex-col">
          {/* Battle Arena */}
          <div className="flex-1 p-4">
            <BattleArena
              player={{
                character: selectedCharacter,
                currentHealth: battleState.hero.currentHealth,
                maxHealth: battleState.hero.attributes.maxHealth,
                specialMeter: battleState.hero.specialMeter,
                comboCount: battleState.hero.comboCount,
                isBlocking: battleState.hero.isBlocking,
                animationState: heroAnimationState
              }}
              opponent={{
                character: opponentCharacter,
                currentHealth: battleState.enemy.currentHealth,
                maxHealth: battleState.enemy.attributes.maxHealth,
                specialMeter: battleState.enemy.specialMeter,
                comboCount: battleState.enemy.comboCount,
                isBlocking: battleState.enemy.isBlocking,
                animationState: enemyAnimationState
              }}
              turn={battleState.turn}
              outcome={battleState.outcome}
              centerSlot={
                battleMessage && (
                  <div className="px-6 py-3 rounded-2xl bg-black/80 border-2 border-white/30 backdrop-blur-sm animate-pulse">
                    <p className="text-lg font-bold text-white text-center tracking-wide">
                      {battleMessage}
                    </p>
                  </div>
                )
              }
            />
          </div>

          {/* Action Bar */}
          <div className="pb-4">
            <ActionBar
              disabled={isResolving || battleState.outcome !== "inProgress"}
              specialMeter={battleState.hero.specialMeter}
              onAction={handleResolveTurn}
            />
          </div>
        </div>

        {/* Reward Modal */}
        <RewardModal
          open={isRewardVisible}
          outcome={battleState.outcome}
          rewards={battleState.rewards}
          theme={themeParams}
          onClose={handleRestartBattle}
        />
      </>
    );
  }

  // Fallback loading state
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 to-black">
      <div className="text-center">
        <div className="mb-4 text-6xl animate-bounce">⚔️</div>
        <p className="text-xl text-white font-semibold">Loading game...</p>
      </div>
    </div>
  );
};

export default HomePage;
