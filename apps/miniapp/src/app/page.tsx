"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEventHandler } from "react";
import clsx from "clsx";
import type {
  BattleOutcomeState,
  Character,
  FightingMoveKind,
  GamePhase,
  RewardBundle
} from "@xuhuan/game-types";

import BattleArena from "@/components/battle-arena";
import CharacterSelect from "@/components/character-select";
import RewardModal from "@/components/reward-modal";
import { useAudio } from "@/components/providers/audio-provider";
import useLocale from "@/components/providers/use-locale";
import { useEncounters } from "@/hooks/use-characters";
import {
  useAuthoritativeBattle,
  useBattleAction,
  usePlayerProfile,
  useStartBattle
} from "@/hooks/use-player";
import {
  APIError,
  createIdempotencyKey,
  type APIActionKind,
  type APIBattle,
  type APIBattleActionResponse
} from "@/lib/api/client";
import {
  encounterToPresentationCharacter,
  toPresentationCharacter
} from "@/lib/api/presentation";
import useTelegramTheme from "@/hooks/use-telegram-theme";

type AnimationState = "idle" | "attack" | "damage" | "block" | "special" | "victory" | "defeat";

type DisplayLogEntry = {
  readonly id: string;
  readonly message: string;
  readonly timestamp: number;
};

type ActionDefinition = {
  readonly kind: FightingMoveKind;
  readonly apiKind: APIActionKind;
  readonly titleKey: string;
  readonly hintKey: string;
  readonly icon: string;
  readonly meterCost: number;
  readonly announcementKey: string;
};

const FIGHTING_ACTION_DEFINITIONS: readonly ActionDefinition[] = [
  {
    kind: "lightAttack",
    apiKind: "light_attack",
    titleKey: "actions.lightAttack.title",
    hintKey: "actions.lightAttack.hint",
    icon: "👊",
    meterCost: 0,
    announcementKey: "battle.log.heroAction.lightAttack"
  },
  {
    kind: "heavyAttack",
    apiKind: "heavy_attack",
    titleKey: "actions.heavyAttack.title",
    hintKey: "actions.heavyAttack.hint",
    icon: "💥",
    meterCost: 0,
    announcementKey: "battle.log.heroAction.heavyAttack"
  },
  {
    kind: "specialMove",
    apiKind: "special_move",
    titleKey: "actions.specialMove.title",
    hintKey: "actions.specialMove.hint",
    icon: "⚡",
    meterCost: 50,
    announcementKey: "battle.log.heroAction.specialMove"
  },
  {
    kind: "block",
    apiKind: "block",
    titleKey: "actions.block.title",
    hintKey: "actions.block.hint",
    icon: "🛡️",
    meterCost: 0,
    announcementKey: "battle.log.heroAction.block"
  },
  {
    kind: "counter",
    apiKind: "counter",
    titleKey: "battle.heroAction.counter",
    hintKey: "battle.heroAction.counter",
    icon: "↩️",
    meterCost: 0,
    announcementKey: "battle.heroAction.counter"
  }
];

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });

const toOutcome = (outcome: APIBattle["outcome"]): BattleOutcomeState => outcome ?? "inProgress";

const toRewards = (battle: APIBattle): RewardBundle | undefined => {
  if (!battle.rewards) {
    return undefined;
  }
  return {
    experience: battle.rewards.experience,
    credits: battle.rewards.credits,
    drops: []
  };
};

const localizedError = (error: unknown, language: string): string => {
  const chinese = language.toLowerCase().startsWith("zh");
  if (error instanceof APIError) {
    if (error.code === "version_conflict") {
      return chinese ? "战斗状态已更新，已同步最新回合。" : "The battle changed; the latest turn was loaded.";
    }
    if (error.code === "insufficient_energy") {
      return chinese ? "能量不足，暂时无法开始战斗。" : "Not enough energy to start a battle.";
    }
    if (error.code === "invalid_action") {
      return chinese ? "当前状态无法使用这个招式。" : "That move is not available in the current state.";
    }
    if (error.status === 401) {
      return chinese ? "Telegram 身份验证失败，请从机器人重新打开游戏。" : "Telegram authentication failed. Reopen the game from the bot.";
    }
  }
  return chinese ? "请求失败，请检查连接后重试。" : "The request failed. Check your connection and try again.";
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
    if (disabled || (actionKind === "specialMove" && specialMeter < meterCost)) {
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
    handleSelect(kind, Number(event.currentTarget.dataset.meterCost));
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-2 py-2 sm:px-4">
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
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
                "flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-3 text-center transition-all sm:px-3",
                isDisabled
                  ? "cursor-not-allowed border border-white/10 bg-white/5 text-white/40"
                  : action.kind === "specialMove"
                    ? "border-2 border-purple-500 bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg hover:shadow-purple-500/70"
                    : action.kind === "block" || action.kind === "counter"
                      ? "border border-blue-500/40 bg-blue-500/20 text-blue-100 hover:bg-blue-500/30"
                      : action.kind === "heavyAttack"
                        ? "border border-red-500/40 bg-red-500/20 text-red-100 hover:bg-red-500/30"
                        : "border border-yellow-500/40 bg-yellow-500/20 text-yellow-100 hover:bg-yellow-500/30"
              )}
              onClick={() => handleSelect(action.kind, action.meterCost)}
              onKeyDown={handleKeyDown}
              disabled={isDisabled}
            >
              <span className="text-2xl sm:text-3xl">{action.icon}</span>
              <span className="truncate text-[10px] font-semibold sm:text-xs">{translate(action.titleKey)}</span>
              <span className="hidden text-[10px] opacity-70 sm:block">{translate(action.hintKey)}</span>
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
  const [battleState, setBattleState] = useState<APIBattle | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [isRewardVisible, setIsRewardVisible] = useState(false);
  const [heroAnimationState, setHeroAnimationState] = useState<AnimationState>("idle");
  const [enemyAnimationState, setEnemyAnimationState] = useState<AnimationState>("idle");
  const [battleLog, setBattleLog] = useState<DisplayLogEntry[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const startLockRef = useRef(false);
  const actionLockRef = useRef(false);

  const { themeParams } = useTelegramTheme();
  const { translate, isReady, language } = useLocale();
  const { playSound, playBGM, stopBGM } = useAudio();
  const { encounters, isLoading: encountersLoading, error: encountersError } = useEncounters();
  const { player, mutatePlayer } = usePlayerProfile();
  const startMutation = useStartBattle();
  const actionMutation = useBattleAction();
  const { refreshBattle } = useAuthoritativeBattle(battleState?.id ?? null);
  const { startBattle, isMutating: isStartingBattle, reset: resetStartBattle } = startMutation;
  const { submitAction, isMutating: isSubmittingAction, reset: resetBattleAction } = actionMutation;

  useEffect(() => {
    if (gamePhase === "select") {
      playBGM("select", true);
    } else if (gamePhase === "battle") {
      playBGM("battle", true);
    }
  }, [gamePhase, playBGM]);

  const handleCharacterSelected = useCallback(
    async (character: Character) => {
      if (!isReady || encounters.length === 0 || startLockRef.current || isStartingBattle) {
        setActionError(localizedError(encountersError ?? new Error("encounters unavailable"), language));
        return;
      }
      startLockRef.current = true;
      setActionError(null);
      const encounter = encounters[0];
      try {
        const started = await startBattle({
          characterSlug: character.slug,
          encounterSlug: encounter.slug,
          idempotencyKey: createIdempotencyKey()
        });
        const authoritativeCharacter = toPresentationCharacter(started.character);
        const authoritativeOpponent = encounterToPresentationCharacter(started.encounter);
        setSelectedCharacter(authoritativeCharacter);
        setOpponentCharacter(authoritativeOpponent);
        setBattleState(started);
        setBattleLog([
          {
            id: "battle-start",
            message: translate("battle.log.start", {
              heroName: authoritativeCharacter.name,
              enemyName: authoritativeOpponent.name
            }),
            timestamp: Date.now()
          }
        ]);
        setGamePhase("battle");
        void mutatePlayer();
      } catch (error) {
        setActionError(localizedError(error, language));
      } finally {
        startLockRef.current = false;
      }
    },
    [encounters, encountersError, isReady, isStartingBattle, language, mutatePlayer, startBattle, translate]
  );

  const appendActionEvents = useCallback(
    (response: APIBattleActionResponse, definition: ActionDefinition) => {
      const entries = response.result.events.map((event, index) => {
        let message = event.description;
        if (event.actor === "hero") {
          message = translate(definition.announcementKey, {
            turn: response.result.sequence.toString(),
            actionName: translate(definition.titleKey),
            enemyName: response.battle.encounter.name
          });
        } else {
          const moveName = translate(
            event.action === "heavy_attack" ? "battle.enemyMove.heavyAttack" : "battle.enemyMove.lightAttack"
          );
          const modifiers: string[] = [];
          if (event.damage?.blocked) {
            modifiers.push(translate("battle.enemyAttack.blocked"));
          }
          if (event.damage?.critical) {
            modifiers.push(translate("battle.enemyAttack.critical"));
          }
          message = translate("battle.enemyAttack.description", {
            enemyName: response.battle.encounter.name,
            moveName,
            damage: event.damage?.amount.toString() ?? "0",
            modifiers: modifiers.join(" ")
          });
        }
        return {
          id: `turn-${response.result.sequence}-${index}`,
          message,
          timestamp: Date.now() + index
        };
      });
      setBattleLog((current) => [...current, ...entries]);
    },
    [translate]
  );

  const handleResolveTurn = useCallback(
    async (actionKind: FightingMoveKind) => {
      const currentBattle = battleState;
      if (
        actionLockRef.current ||
        !isReady ||
        !currentBattle ||
        currentBattle.status !== "active"
      ) {
        if (currentBattle?.status === "completed") {
          setIsRewardVisible(true);
        }
        return;
      }
      const definition = FIGHTING_ACTION_DEFINITIONS.find((item) => item.kind === actionKind);
      if (!definition) {
        return;
      }

      actionLockRef.current = true;
      setIsResolving(true);
      setActionError(null);
      let completed = false;
      if (actionKind === "specialMove") {
        setHeroAnimationState("special");
        playSound("specialMove");
      } else if (actionKind === "block" || actionKind === "counter") {
        setHeroAnimationState("block");
        playSound("block");
      } else {
        setHeroAnimationState("attack");
        playSound(actionKind === "heavyAttack" ? "heavyAttack" : "lightAttack");
      }

      try {
        const response = await submitAction({
          battleId: currentBattle.id,
          action: definition.apiKind,
          expectedVersion: currentBattle.version,
          idempotencyKey: createIdempotencyKey()
        });
        appendActionEvents(response, definition);
        const heroEvent = response.result.events.find((event) => event.actor === "hero");
        const enemyEvent = response.result.events.find((event) => event.actor === "enemy");

        await wait(180);
        if (heroEvent?.damage && heroEvent.damage.amount > 0) {
          setEnemyAnimationState("damage");
          playSound("damage");
          setBattleState({
            ...response.battle,
            status: currentBattle.status,
            outcome: currentBattle.outcome,
            rewards: currentBattle.rewards,
            hero: currentBattle.hero
          });
        }
        await wait(420);
        setHeroAnimationState("idle");
        setEnemyAnimationState("idle");

        if (enemyEvent) {
          setEnemyAnimationState("attack");
          await wait(260);
          if (enemyEvent.damage && enemyEvent.damage.amount > 0) {
            setHeroAnimationState("damage");
            playSound("damage");
          }
          setBattleState(response.battle);
          await wait(420);
        } else {
          setBattleState(response.battle);
        }

        if (response.battle.status === "completed") {
          completed = true;
          stopBGM();
          if (response.battle.outcome === "victory") {
            setHeroAnimationState("victory");
            setEnemyAnimationState("defeat");
            playSound("victory");
            setBattleLog((current) => [
              ...current,
              {
                id: `outcome-${response.battle.version}`,
                message: translate("battle.log.victory", { enemyName: response.battle.encounter.name }),
                timestamp: Date.now()
              }
            ]);
          } else {
            setHeroAnimationState("defeat");
            setEnemyAnimationState("victory");
            playSound("defeat");
            setBattleLog((current) => [
              ...current,
              { id: `outcome-${response.battle.version}`, message: translate("battle.log.defeat"), timestamp: Date.now() }
            ]);
          }
          setIsRewardVisible(true);
          void mutatePlayer();
        } else {
          setHeroAnimationState("idle");
          setEnemyAnimationState("idle");
          if (response.battle.hero.combo_count >= 3 || response.battle.enemy.combo_count >= 3) {
            playSound("combo");
          }
        }
      } catch (error) {
        if (error instanceof APIError && error.status === 409) {
          try {
            const refreshed = await refreshBattle();
            if (refreshed) {
              setBattleState(refreshed);
            }
          } catch {
            // The original conflict remains the useful user-facing error.
          }
        }
        setActionError(localizedError(error, language));
      } finally {
        if (!completed) {
          setHeroAnimationState("idle");
          setEnemyAnimationState("idle");
        }
        actionLockRef.current = false;
        setIsResolving(false);
      }
    },
    [
      appendActionEvents,
      battleState,
      isReady,
      language,
      mutatePlayer,
      playSound,
      refreshBattle,
      stopBGM,
      submitAction,
      translate
    ]
  );

  const handleRestartBattle = useCallback(() => {
    stopBGM();
    startLockRef.current = false;
    actionLockRef.current = false;
    resetStartBattle();
    resetBattleAction();
    setGamePhase("select");
    setSelectedCharacter(null);
    setOpponentCharacter(null);
    setBattleState(null);
    setIsRewardVisible(false);
    setIsResolving(false);
    setHeroAnimationState("idle");
    setEnemyAnimationState("idle");
    setBattleLog([]);
    setActionError(null);
  }, [resetBattleAction, resetStartBattle, stopBGM]);

  if (gamePhase === "select") {
    return (
      <CharacterSelect
        onCharacterSelected={handleCharacterSelected}
        isConfirming={isStartingBattle || encountersLoading}
        actionError={actionError}
        playerSummary={player ? { level: player.level, credits: player.credits, energy: player.energy } : undefined}
      />
    );
  }

  if (gamePhase === "battle" && battleState && selectedCharacter && opponentCharacter) {
    const outcome = toOutcome(battleState.outcome);
    return (
      <>
        <div className="relative flex min-h-screen flex-col bg-gradient-to-br from-gray-900 to-black">
          <div className="flex-1 p-2">
            <BattleArena
              player={{
                character: selectedCharacter,
                currentHealth: battleState.hero.current_health,
                maxHealth: battleState.hero.max_health,
                specialMeter: battleState.hero.special_meter,
                comboCount: battleState.hero.combo_count,
                isBlocking: battleState.hero.is_blocking,
                animationState: heroAnimationState
              }}
              opponent={{
                character: opponentCharacter,
                currentHealth: battleState.enemy.current_health,
                maxHealth: battleState.enemy.max_health,
                specialMeter: battleState.enemy.special_meter,
                comboCount: battleState.enemy.combo_count,
                isBlocking: battleState.enemy.is_blocking,
                animationState: enemyAnimationState
              }}
              turn={battleState.turn}
              outcome={outcome}
              battleLog={battleLog}
            />
          </div>
          {actionError ? (
            <div className="mx-3 mb-2 rounded-xl border border-red-400/40 bg-red-500/15 px-4 py-2 text-center text-sm text-red-100" role="alert">
              {actionError}
            </div>
          ) : null}
          <div className="flex-shrink-0 pb-2">
            <ActionBar
              disabled={isResolving || isSubmittingAction || battleState.status !== "active" || !isReady}
              specialMeter={battleState.hero.special_meter}
              onAction={(action) => void handleResolveTurn(action)}
              translate={translate}
            />
          </div>
        </div>

        <RewardModal
          open={isRewardVisible}
          outcome={outcome}
          rewards={toRewards(battleState)}
          theme={themeParams}
          onClose={handleRestartBattle}
        />
      </>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 to-black">
      <div className="text-center">
        <div className="mb-4 animate-bounce text-6xl">⚔️</div>
        <p className="text-xl font-semibold text-white">Loading game...</p>
      </div>
    </div>
  );
};

export default HomePage;
