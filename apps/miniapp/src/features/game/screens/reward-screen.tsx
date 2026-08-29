"use client";

import {
  gameText,
  type GameCopyKey,
  type GameLocale,
} from "@/features/game/game-copy";
import { SignalPanel } from "@/features/game/screens/signal-panel";
import type { APIGameContent, APIGameRun } from "@/lib/api/client";

type RewardScreenProps = {
  readonly content: APIGameContent;
  readonly run: APIGameRun;
  readonly locale: GameLocale;
  readonly busy: boolean;
  readonly onChoose: (slug: string) => void;
  readonly onReroll: () => void;
};

const archetypes = {
  surge: {
    accent: "from-rose-400 via-amber-300 to-rose-400",
    panel: "border-rose-300/45 bg-rose-950/20",
    badge: "border-rose-200/50 bg-rose-400/15 text-rose-100",
    glyph: "ϟ",
  },
  guard: {
    accent: "from-emerald-300 via-cyan-300 to-emerald-300",
    panel: "border-emerald-300/40 bg-emerald-950/20",
    badge: "border-emerald-200/50 bg-emerald-400/15 text-emerald-100",
    glyph: "⬡",
  },
  echo: {
    accent: "from-cyan-300 via-violet-300 to-cyan-300",
    panel: "border-cyan-300/40 bg-cyan-950/20",
    badge: "border-cyan-200/50 bg-cyan-400/15 text-cyan-100",
    glyph: "◈",
  },
  glitch: {
    accent: "from-fuchsia-300 via-violet-500 to-fuchsia-300",
    panel: "border-fuchsia-300/40 bg-fuchsia-950/20",
    badge: "border-fuchsia-200/50 bg-fuchsia-400/15 text-fuchsia-100",
    glyph: "//",
  },
} as const;

const effectKeys: Record<string, GameCopyKey> = {
  attack_damage: "effectAttackDamage",
  attack_speed: "effectAttackInterval",
  move_speed: "effectMoveSpeed",
  warp_cooldown: "effectWarpCooldown",
  warp_damage: "effectWarpDamage",
  starting_shield: "effectStartingShield",
  max_health: "effectMaxHealth",
  overload_bonus: "effectOverloadBonus",
  distortion_gain: "effectDistortionGain",
  protocol_damage: "effectProtocolDamage",
  protocol_shield: "effectProtocolShield",
  echo_power: "effectEchoPower",
  resonance_power: "effectResonancePower",
  projectile_pierce: "effectProjectilePierce",
  projectile_count: "effectProjectileCount",
  projectile_speed: "effectProjectileSpeed",
  graze_radius: "effectGrazeRadius",
  heal_on_protocol: "effectHealOnProtocol",
  reflect_damage: "effectReflectDamage",
  reroll_charge: "effectRerollCharge",
};

const formatEffect = (
  locale: GameLocale,
  effect: { readonly kind: string; readonly amount?: number },
) => {
  const key = effectKeys[effect.kind];
  const label = key ? gameText(locale, key) : effect.kind.toUpperCase();
  const amount = effect.amount ?? 0;
  const sign = ["attack_speed", "warp_cooldown"].includes(effect.kind)
    ? "−"
    : "+";
  return `${label} ${sign}${amount}`;
};

export const RewardScreen = ({
  content,
  run,
  locale,
  busy,
  onChoose,
  onReroll,
}: RewardScreenProps) => {
  const reward = run.state.reward;
  if (!reward) return null;
  const plugin = content.plugins.find(
    (item) => item.slug === reward.granted_plugin,
  );
  return (
    <SignalPanel
      title={gameText(locale, "reward")}
      subtitle={gameText(locale, "rewardHint")}
      eyebrow={
        plugin ? gameText(locale, "pluginFound") : gameText(locale, "moduleCache")
      }
    >
      {plugin ? (
        <aside className="mb-4 border-2 border-amber-300/45 bg-amber-300/10 p-3 shadow-[3px_3px_0_rgba(217,119,6,.3)]">
          <p className="font-mono text-[9px] tracking-[.18em] text-amber-200">
            {gameText(locale, "pluginAcquiredLabel")}
          </p>
          <strong className="mt-1 block text-sm text-amber-50">
            {plugin.name}
          </strong>
          <p className="mt-1 text-xs leading-5 text-amber-100/70">
            {plugin.description}
          </p>
        </aside>
      ) : null}

      <div className="grid gap-3">
        {reward.module_choices.map((slug, index) => {
          const definition = content.modules.find((item) => item.slug === slug);
          if (!definition) return null;
          const owned = run.state.modules.find((item) => item.slug === slug);
          const nextLevel = Math.min(3, (owned?.level ?? 0) + 1);
          const level = definition.levels[nextLevel - 1];
          const style = archetypes[definition.archetype];
          return (
            <button
              key={slug}
              data-testid={`module-reward-${slug}`}
              type="button"
              disabled={busy}
              onClick={() => onChoose(slug)}
              className={`group relative w-full overflow-hidden border-2 p-0 text-left text-white shadow-[5px_5px_0_rgba(2,6,23,.85)] transition active:translate-x-1 active:translate-y-1 active:shadow-none disabled:opacity-50 ${style.panel}`}
            >
              <span className={`block h-1.5 bg-gradient-to-r ${style.accent}`} />
              <span className="grid grid-cols-[3.25rem_1fr] gap-3 bg-[#071225]/90 p-4">
                <span
                  className={`grid h-12 w-12 place-items-center border-2 font-mono text-xl font-black ${style.badge}`}
                >
                  {style.glyph}
                </span>
                <span className="min-w-0">
                  <span className="flex items-start gap-2">
                    <strong className="min-w-0 flex-1 text-base leading-5">
                      {definition.name}
                    </strong>
                    <span
                      className={`shrink-0 border px-2 py-1 font-mono text-[9px] font-bold tracking-wider ${style.badge}`}
                    >
                      {String(index + 1).padStart(2, "0")} / {gameText(locale, "levelShort")} {nextLevel}
                    </span>
                  </span>
                  <span className="mt-2 block text-xs leading-5 text-slate-300">
                    {definition.description}
                  </span>
                  <span className="mt-3 flex flex-wrap gap-1.5">
                    {(level?.effects ?? []).map((effect, effectIndex) => (
                      <span
                        key={`${effect.kind}-${effectIndex}`}
                        className="border border-white/15 bg-slate-950 px-2 py-1 font-mono text-[9px] font-bold tracking-wide text-cyan-50"
                      >
                        {formatEffect(locale, effect)}
                      </span>
                    ))}
                  </span>
                  <span
                    className="mt-3 flex gap-1"
                    aria-label={gameText(locale, "levelProgress").replace(
                      "{level}",
                      String(nextLevel),
                    )}
                  >
                    {[1, 2, 3].map((levelNumber) => (
                      <span
                        key={levelNumber}
                        className={`h-1.5 flex-1 ${levelNumber <= nextLevel ? "bg-cyan-300" : "bg-slate-700"}`}
                      />
                    ))}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          data-testid="reroll-module-reward"
          type="button"
          disabled={busy || run.state.rerolls_remaining <= 0 || reward.rerolled}
          onClick={onReroll}
          className="border-2 border-violet-300/35 bg-violet-400/10 py-3 font-mono text-[10px] font-bold tracking-[.12em] text-violet-100 disabled:border-slate-700 disabled:bg-transparent disabled:text-slate-600"
        >
          {reward.rerolled
            ? gameText(locale, "rerolled")
            : `${gameText(locale, "reroll")} · ${run.state.rerolls_remaining}`}
        </button>
        <button
          data-testid="skip-module-reward"
          type="button"
          disabled={busy}
          onClick={() => onChoose("")}
          className="border-2 border-slate-600 bg-[#050914] py-3 font-mono text-[10px] font-bold tracking-[.18em] text-slate-300 disabled:opacity-50"
        >
          {gameText(locale, "skip")}
        </button>
      </div>
    </SignalPanel>
  );
};
