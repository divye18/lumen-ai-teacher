import type { HTMLAttributes } from "react";

import { cn } from "@/lib/ui/cn";

type PanelVariant = "default" | "quiet" | "elevated" | "hero" | "progress";

/**
 * Milestone 20 — five genuinely different surface treatments, not one
 * `Panel` recolored five ways. Each variant changes border/shadow/background
 * weight so surfaces read by IMPORTANCE, not just by content:
 *
 *  - `default`  — the everyday container (was the only treatment before).
 *  - `quiet`    — near-invisible grouping; no shadow, a faint tint instead
 *                 of a hard border. For secondary/metadata clusters.
 *  - `elevated` — a genuinely raised interactive surface (hover targets,
 *                 selectable cards) — stronger shadow + border on hover.
 *  - `hero`     — the ONE dominant surface per screen (Continue Learning).
 *                 Deeper shadow, restrained background geometry, no
 *                 glassmorphism (no blur/opacity tricks on content).
 *  - `progress` — a flatter, tinted-learning-accent surface for progress
 *                 visualizations, distinct from ordinary content panels.
 */
const PANEL_VARIANTS: Record<PanelVariant, string> = {
  default:
    "border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-xs)]",
  quiet: "border border-transparent bg-[var(--color-subtle)] shadow-none",
  elevated:
    "border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)] transition-[border-color,box-shadow] duration-200",
  hero: "lumen-hero-field border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-hero)]",
  progress:
    "border border-[var(--color-border)] bg-[var(--color-learning-soft)] shadow-none",
};

/** A restrained container. Used sparingly — not everything is a card. */
export function Panel({
  className,
  inset,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  inset?: boolean;
  variant?: PanelVariant;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)]",
        PANEL_VARIANTS[variant],
        inset ? "p-5 sm:p-6" : "",
        className,
      )}
      {...props}
    />
  );
}

export function SectionHeading({
  title,
  hint,
  action,
  eyebrow,
  className,
}: {
  title: string;
  hint?: string;
  /** Small uppercase label above the title — an editorial "kicker", used
   * sparingly (Studio's top-level sections), not on every heading. */
  eyebrow?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-[length:var(--text-label)] font-semibold tracking-[0.08em] text-[var(--color-ink-faint)] uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="text-[length:var(--text-title)] font-semibold tracking-tight text-[var(--color-ink)]">
          {title}
        </h2>
        {hint ? (
          <p className="mt-0.5 text-[length:var(--text-body)] text-[var(--color-ink-muted)]">
            {hint}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return (
    <hr
      className={cn(
        "border-0 border-t border-[var(--color-border)]",
        className,
      )}
    />
  );
}
