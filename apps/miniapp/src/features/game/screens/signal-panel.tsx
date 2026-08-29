import type { ReactNode } from "react";

type SignalPanelProps = {
  readonly title: string;
  readonly subtitle?: string;
  readonly eyebrow?: string;
  readonly children: ReactNode;
};

export const SignalPanel = ({
  title,
  subtitle,
  eyebrow,
  children,
}: SignalPanelProps) => (
  <main
    data-testid="interstitial-screen"
    data-game-surface="true"
    className="mx-auto min-h-[var(--xuhuan-stable-height,100dvh)] w-full max-w-lg overflow-x-hidden bg-[#050914] px-4 pb-[var(--xuhuan-host-safe-bottom)] pt-[var(--xuhuan-host-safe-top)] text-slate-50 [forced-color-adjust:none]"
    style={{
      backgroundImage:
        "radial-gradient(circle at 50% 0%, rgba(8,145,178,.24), transparent 34%), linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px)",
      backgroundSize: "auto, 100% 24px",
    }}
  >
    <header className="mb-5 border-b-2 border-cyan-300/20 pb-4 pr-[4.5rem]">
      {eyebrow ? (
        <p className="font-mono text-[10px] uppercase tracking-[.22em] text-violet-300">
          {eyebrow}
        </p>
      ) : null}
      <h1 className="mt-2 text-2xl font-black leading-tight tracking-tight text-white">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-2 text-sm leading-6 text-slate-300">{subtitle}</p>
      ) : null}
    </header>
    {children}
  </main>
);
