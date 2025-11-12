"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEventHandler } from "react";
import clsx from "clsx";

import CharacterSelect from "@/components/character-select";
import BattleArena from "@/components/battle-arena";
import RewardModal from "@/components/reward-modal";
import AudioControls from "@/components/audio-controls";
import useTelegramTheme from "@/hooks/use-telegram-theme";
import useLocale from "@/components/providers/use-locale";
import { useAudio } from "@/components/providers/audio-provider";
import { useCharacters } from "@/hooks/use-characters";
import type {
  BattleContext,
  BattleState,
  CombatantState,
  FightingMove,
  FightingMoveKind
} from "@/lib/game-loop";
import { createBattleState, resolveTurn, updateBattleContext } from "@/lib/game-loop";
import type { Character, GamePhase } from "@xuhuan/game-types";

const FIGHTING_ACTION_DEFINITIONS: Array<{
  readonly kind: FightingMoveKind;
  readonly titleKey: string;
  readonly hintKey: string;
  readonly icon: string;
  readonly meterCost: number;
  readonly announcementKey: string;
}> = [
  {
    kind: "lightAttack",
    titleKey: "actions.lightAttack.title",
    hintKey: "actions.lightAttack.hint",
    icon: "👊",
    meterCost: 0,
    announcementKey: "battle.log.heroAction.lightAttack"
  },
  {
    kind: "heavyAttack",
    titleKey: "actions.heavyAttack.title",
    hintKey: "actions.heavyAttack.hint",
    icon: "💥",
    meterCost: 0,
    announcementKey: "battle.log.heroAction.heavyAttack"
  },
  {
    kind: "specialMove",
    titleKey: "actions.specialMove.title",
    hintKey: "actions.specialMove.hint",
    icon: "⚡",
    meterCost: 50,
    announcementKey: "battle.log.heroAction.specialMove"
  },
  {
    kind: "block",
    titleKey: "actions.block.title",
    hintKey: "actions.block.hint",
    icon: "🛡️",
    meterCost: 0,
    announcementKey: "battle.log.heroAction.block"
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
  onAction,
  translate
}: {
  readonly disabled: boolean;
  readonly specialMeter: number;
  readonly onAction: (action: FightingMoveKind) => void;
  readonly translate: (key: string, params?: Record<string, string>) => string;
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
    <div className="w-full max-w-4xl mx-auto px-4 py-2">
      <div className="grid grid-cols-4 gap-2">
        {FIGHTING_ACTION_DEFINITIONS.map((action) => {
          const canUse = action.kind !== "specialMove" || specialMeter >= action.meterCost;
          const isDisabled = disabled || !canUse;

          return (
            <button
              key={action.kind}
              data-kind={action.kind}
              data-meter-cost={action.meterCost}
              type="button"
              className={clsx(
                "rounded-xl px-3 py-3 text-center transition-all flex flex-col items-center gap-1",
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
              <span className="text-xs font-semibold">{translate(action.titleKey)}</span>
              <span className="text-[10px] opacity-70">{translate(action.hintKey)}</span>
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

  // Battle log
  type BattleLogEntry = {
    readonly id: string;
    readonly message: string;
    readonly timestamp: number;
  };
  const [battleLog, setBattleLog] = useState<BattleLogEntry[]>([]);

  const { themeParams } = useTelegramTheme();
  const { translate, isReady } = useLocale();
  const { characters } = useCharacters();
  const { playSound, playBGM, stopBGM } = useAudio();

  const handleCharacterSelected = useCallback((character: Character) => {
    if (!isReady) {
      return;
    }
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
    setBattleLog([
      {
        id: "log-0",
        message: translate("battle.log.start", {
          heroName: character.name,
          enemyName: randomOpponent.name
        }),
        timestamp: Date.now()
      }
    ]);
    setGamePhase("battle");
    // Play battle BGM
    playBGM("battle", true);
  }, [characters, isReady, translate, playBGM]);

  const handleResolveTurn = useCallback(
    (actionKind: FightingMoveKind) => {
      if (!isReady || isResolving || !battleState || battleState.outcome !== "inProgress" || !battleContextRef.current) {
        if (battleState && battleState.outcome !== "inProgress") {
          setIsRewardVisible(true);
        }
        return;
      }

      setIsResolving(true);

      // PHASE 1: Hero attacks
      const actionDefinition = FIGHTING_ACTION_DEFINITIONS.find((definition) => definition.kind === actionKind);
      const actionAnnouncementKey = actionDefinition ? actionDefinition.announcementKey : "battle.log.heroAction.fallback";
      const actionName = actionDefinition ? translate(actionDefinition.titleKey) : translate("actions.fallback.title");
      setBattleLog(prev => [...prev, {
        id: `log-${Date.now()}-hero-action`,
        message: translate(actionAnnouncementKey, {
          turn: battleState.turn.toString(),
          actionName
        }),
        timestamp: Date.now()
      }]);

      // Set hero animation based on action and play sound
      if (actionKind === "specialMove") {
        setHeroAnimationState("special");
        playSound("specialMove");
      } else if (actionKind === "block") {
        setHeroAnimationState("block");
        playSound("block");
      } else if (actionKind === "heavyAttack") {
        setHeroAnimationState("attack");
        playSound("heavyAttack");
      } else {
        setHeroAnimationState("attack");
        playSound("lightAttack");
      }

      // Execute full turn resolution to get the complete result
      setTimeout(() => {
        if (!battleContextRef.current) return;

        const currentBattleState = battleState;
        const result = resolveTurn(battleContextRef.current, { kind: actionKind } satisfies FightingMove);

        // First, show only hero's action effect on enemy
        const enemyTookDamage = result.state.enemy.currentHealth < currentBattleState.enemy.currentHealth;

        if (enemyTookDamage) {
          // Show enemy taking damage animation and play sound
          setTimeout(() => {
            setEnemyAnimationState("damage");
            playSound("damage");
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
            stopBGM();
            playSound("victory");
            setBattleLog(prev => [
              ...prev,
              {
                id: `log-${Date.now()}-victory`,
                message: translate("battle.log.victory", {
                  enemyName: currentBattleState.enemy.name
                }),
                timestamp: Date.now()
              }
            ]);
            battleContextRef.current = updateBattleContext(battleContextRef.current!, result.state);
            setBattleState(result.state);
            setIsResolving(false);
            setIsRewardVisible(true);
            return;
          }

          // PHASE 2: Enemy retaliates
          setTimeout(() => {
            setBattleLog(prev => [
              ...prev,
              {
                id: `log-${Date.now()}-enemy-turn`,
                message: translate("battle.log.enemyRetaliates", {
                  enemyName: currentBattleState.enemy.name
                }),
                timestamp: Date.now()
              }
            ]);

            // Show enemy attack animation
            const enemyActionType = Math.random() > 0.6 ? "attack" : "attack"; // Could vary this
            setEnemyAnimationState(enemyActionType);

            setTimeout(() => {
              // Hero takes damage
              const heroTookDamage = result.state.hero.currentHealth < currentBattleState.hero.currentHealth;

              if (heroTookDamage) {
                setHeroAnimationState("damage");
                playSound("damage");
              }

              // Update to final state with both hero and enemy health
              battleContextRef.current = updateBattleContext(battleContextRef.current!, result.state);
              setBattleState(result.state);

              // Reset animations
              setTimeout(() => {
                if (result.state.hero.currentHealth <= 0) {
                  setHeroAnimationState("defeat");
                  setEnemyAnimationState("victory");
                  stopBGM();
                  playSound("defeat");
                  setBattleLog(prev => [
                    ...prev,
                    {
                      id: `log-${Date.now()}-defeat`,
                      message: translate("battle.log.defeat"),
                      timestamp: Date.now()
                    }
                  ]);
                  setIsRewardVisible(true);
                } else {
                  setHeroAnimationState("idle");
                  setEnemyAnimationState("idle");
                  // Play combo sound if combo count is high
                  if (result.state.hero.comboCount >= 3 || result.state.enemy.comboCount >= 3) {
                    playSound("combo");
                  }
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
    [battleState, isReady, isResolving, translate, playSound, stopBGM]
  );

  const handleRestartBattle = useCallback(() => {
    stopBGM();
    setGamePhase("select");
    setSelectedCharacter(null);
    setOpponentCharacter(null);
    setBattleState(null);
    setIsRewardVisible(false);
    setIsResolving(false);
    setHeroAnimationState("idle");
    setEnemyAnimationState("idle");
    setBattleLog([]);
  }, [stopBGM]);

  // Character Selection Phase
  if (gamePhase === "select") {
    // Play BGM when entering character select (uses unified BGM)
    useEffect(() => {
      playBGM("select", true);
      return () => {
        // Don't stop BGM here, let it continue to battle phase
      };
    }, [playBGM]);

    return <CharacterSelect onCharacterSelected={handleCharacterSelected} />;
  }

  // Battle Phase
  if (gamePhase === "battle" && battleState && selectedCharacter && opponentCharacter) {
    return (
      <>
        <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black flex flex-col relative">
          {/* Audio Controls */}
          <div className="absolute top-4 right-4 z-50">
            <AudioControls />
          </div>

          {/* Battle Arena */}
          <div className="flex-1 p-2">
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
              battleLog={battleLog}
            />
          </div>

          {/* Action Bar */}
          <div className="pb-2">
            <ActionBar
              disabled={isResolving || battleState.outcome !== "inProgress" || !isReady}
              specialMeter={battleState.hero.specialMeter}
              onAction={handleResolveTurn}
              translate={translate}
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
        
        {/* Keep BGM playing during reward phase */}
        {isRewardVisible && (
          <div style={{ display: "none" }} aria-hidden="true">
            {/* BGM continues playing from battle phase */}
          </div>
        )}
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
