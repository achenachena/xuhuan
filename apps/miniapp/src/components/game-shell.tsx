"use client";

import type { KeyboardEventHandler, ReactNode } from "react";

import clsx from "clsx";

import useTelegramTheme from "@/hooks/use-telegram-theme";
import useLocale from "@/components/providers/use-locale";

type GameShellProps = {
  readonly headerSlot?: ReactNode;
  readonly heroHudSlot?: ReactNode;
  readonly enemyHudSlot?: ReactNode;
  readonly combatLogSlot?: ReactNode;
  readonly actionBarSlot?: ReactNode;
  readonly children: ReactNode;
};

const GameShell = ({
  headerSlot,
  heroHudSlot,
  enemyHudSlot,
  combatLogSlot,
  actionBarSlot,
  children
}: GameShellProps) => {
  const { colorScheme } = useTelegramTheme();
  const { translate } = useLocale();
  const isDark: boolean = colorScheme === "dark";

  const containerClassName: string = clsx(
    "relative flex min-h-screen flex-col gap-4 bg-telegram-bg px-4 py-4 text-telegram-text transition-colors sm:px-6 lg:px-8"
  );

  const backdropClassName: string = clsx(
    "pointer-events-none absolute inset-0 -z-10 opacity-80 blur-3xl",
    {
      "bg-gradient-to-b from-slate-900/70 via-slate-950/60 to-slate-900/70": isDark,
      "bg-gradient-to-b from-slate-100/70 via-white/60 to-slate-200/60": !isDark
    }
  );

  const surfaceClassName: string = clsx(
    "rounded-3xl border px-4 py-5 shadow-lg backdrop-blur-md sm:px-6 lg:px-8",
    {
      "border-white/10 bg-white/10": isDark,
      "border-slate-200 bg-white": !isDark
    }
  );

  const hudSurfaceClassName: string = clsx(
    "flex items-start justify-between rounded-2xl border px-4 py-3 transition-colors",
    {
      "border-white/10 bg-white/5 text-white": isDark,
      "border-slate-200 bg-slate-50 text-slate-900": !isDark
    }
  );

  const accentBadgeClassName: string = clsx(
    "rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide",
    {
      "border-white/20 text-white/80": isDark,
      "border-slate-300 text-slate-600": !isDark
    }
  );

  const combatLogClassName: string = clsx("flex flex-1 flex-col gap-2 overflow-y-auto pr-1 text-sm", {
    "text-white/80": isDark,
    "text-slate-700": !isDark
  });

  const subtleTextClassName: string = clsx("text-xs uppercase tracking-[0.2em]", {
    "text-white/60": isDark,
    "text-slate-500": !isDark
  });

  const battlefieldContainerClassName: string = clsx(
    surfaceClassName,
    "flex min-h-[360px] flex-col gap-4 rounded-3xl border-2 border-dashed px-0 py-0"
  );

  const battlefieldBorderClassName: string = isDark ? "border-white/10" : "border-slate-200";
  const battlefieldOverlayClassName: string = clsx(
    "absolute inset-0 bg-gradient-to-br from-sky-500/10 via-transparent to-indigo-500/20",
    {
      "from-sky-500/20 to-indigo-500/30": isDark,
      "from-sky-500/10 to-indigo-500/15": !isDark
    }
  );

  const handlePlaceholderAction = () => {
    return;
  };

  const handlePlaceholderKeyDown: KeyboardEventHandler<HTMLButtonElement> = (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
  };

  return (
    <div
      className={containerClassName}
      data-color-scheme={colorScheme}
    >
      <div className={backdropClassName} aria-hidden />
      <header className={clsx(surfaceClassName, "flex items-center justify-between gap-4")}>
        {headerSlot ?? (
          <div className="flex w-full items-center justify-between">
            <div>
              <p className={subtleTextClassName}>{translate("gameShell.header.subtitle")}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">{translate("gameShell.header.title")}</h1>
            </div>
            <span className={accentBadgeClassName} aria-label={translate("gameShell.header.badgeAria")} role="status">
              {translate("gameShell.header.badge")}
            </span>
          </div>
        )}
      </header>

      <div className="flex flex-1 flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_340px]">
        <section
          className={clsx(battlefieldContainerClassName, battlefieldBorderClassName)}
          aria-label={translate("gameShell.battlefield.ariaLabel")}
        >
          <div className={clsx("grid grid-cols-1 gap-3 border-b px-5 py-4 sm:grid-cols-2", battlefieldBorderClassName)}>
            <div
              className={hudSurfaceClassName}
              role="group"
              aria-label={translate("gameShell.hero.ariaLabel")}
            >
              {heroHudSlot ?? (
                <div className="w-full">
                  <p className={clsx(subtleTextClassName, "tracking-[0.15em]")}>{translate("gameShell.hero.label")}</p>
                  <p className="mt-1 text-lg font-semibold">{translate("gameShell.hero.name")}</p>
                  <p className="mt-2 text-xs opacity-80">{translate("gameShell.hero.health")}</p>
                </div>
              )}
            </div>
            <div
              className={clsx(hudSurfaceClassName, "sm:justify-end")}
              role="group"
              aria-label={translate("gameShell.enemy.ariaLabel")}
            >
              {enemyHudSlot ?? (
                <div className="w-full text-right sm:w-auto">
                  <p className={clsx(subtleTextClassName, "tracking-[0.15em]")}>{translate("gameShell.enemy.label")}</p>
                  <p className="mt-1 text-lg font-semibold">{translate("gameShell.enemy.name")}</p>
                  <p className="mt-2 text-xs opacity-80">{translate("gameShell.enemy.health")}</p>
                </div>
              )}
            </div>
          </div>

          <div className="relative flex-1 overflow-hidden">
            <div className={battlefieldOverlayClassName} />
            <div className="relative h-full w-full overflow-hidden px-5 py-4">{children}</div>
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          <section
            className={clsx(surfaceClassName, "min-h-[220px] overflow-hidden")}
            aria-label={translate("gameShell.log.ariaLabel")}
          >
            {combatLogSlot ?? (
              <div className="flex h-full flex-col justify-between gap-3 text-sm">
                <p className={subtleTextClassName}>{translate("gameShell.log.title")}</p>
                <ol className={combatLogClassName}>
                  <li>{translate("gameShell.log.entryOne")}</li>
                  <li>{translate("gameShell.log.entryTwo")}</li>
                  <li>{translate("gameShell.log.entryThree")}</li>
                </ol>
              </div>
            )}
          </section>
          <section
            className={clsx(surfaceClassName, "flex flex-col gap-3")}
            aria-label={translate("gameShell.actions.ariaLabel")}
          >
            {actionBarSlot ?? (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  className="w-full rounded-2xl bg-telegram-button px-4 py-3 text-sm font-semibold text-telegram-text"
                  aria-label={translate("gameShell.actions.primary.ariaLabel")}
                  tabIndex={0}
                  onClick={handlePlaceholderAction}
                  onKeyDown={handlePlaceholderKeyDown}
                >
                  {translate("gameShell.actions.primary.label")}
                </button>
                <button
                  type="button"
                  className={clsx(
                    "w-full rounded-2xl border px-4 py-3 text-sm font-semibold",
                    {
                      "border-white/20 text-white/90": isDark,
                      "border-slate-300 text-slate-700": !isDark
                    }
                  )}
                  aria-label={translate("gameShell.actions.secondary.ariaLabel")}
                  tabIndex={0}
                  onClick={handlePlaceholderAction}
                  onKeyDown={handlePlaceholderKeyDown}
                >
                  {translate("gameShell.actions.secondary.label")}
                </button>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
};

export default GameShell;

