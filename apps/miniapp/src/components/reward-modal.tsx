"use client";

import { useCallback, useEffect } from "react";
import type { MouseEventHandler } from "react";

import clsx from "clsx";

import type { BattleOutcome, RewardBundle, RewardDrop } from "@/lib/game-loop";
import { summarizeBattleTheme } from "@/lib/game-loop";
import type { TelegramThemeParams } from "@/lib/telegram-theme";
import useLocale from "@/components/providers/use-locale";

type RewardModalProps = {
  readonly open: boolean;
  readonly outcome: BattleOutcome;
  readonly rewards?: RewardBundle;
  readonly theme?: TelegramThemeParams;
  readonly onClose: () => void;
};

const RewardModal = ({ open, outcome, rewards, theme, onClose }: RewardModalProps) => {
  const { translate } = useLocale();
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!open) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    },
    [onClose, open]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  if (!open) {
    return null;
  }

  const accentColor = summarizeBattleTheme(theme, outcome);

  const handleOverlayClick = () => {
    onClose();
  };

  const handleDialogClick: MouseEventHandler<HTMLDivElement> = (event) => {
    event.stopPropagation();
  };

  const dropItems = rewards?.drops ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-xs"
      role="presentation"
      onClick={handleOverlayClick}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={translate("rewardModal.ariaLabel")}
        className="w-full max-w-md rounded-3xl border border-white/10 bg-telegram-bg px-6 py-8 text-telegram-text shadow-2xl"
        onClick={handleDialogClick}
      >
        <div
          className="flex items-center justify-between gap-4 border-b border-white/10 pb-4"
          style={{ borderColor: `${accentColor}33` }}
        >
          <h4 className="text-xl font-semibold tracking-tight">
            {translate(outcome === "victory" ? "rewardModal.title.victory" : "rewardModal.title.defeat")}
          </h4>
          <button
            type="button"
            className="rounded-full border border-white/20 px-3 py-1 text-xs uppercase tracking-[0.2em]"
            onClick={onClose}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClose();
              }
            }}
          >
            {translate("rewardModal.action.close")}
          </button>
        </div>
        <div className="mt-4 flex flex-col gap-4 text-sm">
          <div className="flex items-center justify-between rounded-2xl border border-white/10 px-4 py-3">
            <span className="text-xs uppercase tracking-[0.2em] opacity-70">
              {translate("rewardModal.label.experience")}
            </span>
            <span className="text-lg font-semibold">{rewards?.experience ?? 0}</span>
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-white/10 px-4 py-3">
            <span className="text-xs uppercase tracking-[0.2em] opacity-70">
              {translate("rewardModal.label.credits")}
            </span>
            <span className="text-lg font-semibold">{rewards?.credits ?? 0}</span>
          </div>
          <div className="rounded-2xl border border-white/10 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.2em] opacity-70">
              {translate("rewardModal.label.drops")}
            </p>
            {dropItems.length === 0 ? (
              <p className="mt-3 text-sm opacity-70">{translate("rewardModal.drops.empty")}</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {dropItems.map((drop: RewardDrop) => (
                  <li
                    key={drop.id}
                    className={clsx(
                      "flex items-center justify-between rounded-2xl px-3 py-2 text-sm",
                      drop.rarity === "epic"
                        ? "bg-purple-500/10 text-purple-100"
                        : drop.rarity === "rare"
                          ? "bg-sky-500/10 text-sky-100"
                          : "bg-emerald-500/10 text-emerald-100"
                    )}
                  >
                    <span className="font-medium">
                      {drop.name} × {drop.quantity}
                    </span>
                    <span className="text-xs uppercase tracking-[0.2em] opacity-80">
                      {translate(`rewardModal.rarity.${drop.rarity}`)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RewardModal;

