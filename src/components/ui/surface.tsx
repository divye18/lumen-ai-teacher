import type { HTMLAttributes } from "react";

import { cn } from "@/lib/ui/cn";

type PanelVariant =
  "default" | "quiet" | "elevated" | "hero" | "progress" | "unboxed";

const PANEL_VARIANTS: Record<PanelVariant, string> = {
  default:
    "border border-[var(--color-border)] bg-[var(--color-surface)] shadow-none",
  quiet: "border border-transparent bg-[var(--color-subtle)] shadow-none",
  elevated:
    "border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)] transition-[border-color,box-shadow] duration-200",
  hero: "border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-md)]",
  progress:
    "border-t-2 border-[var(--color-learning)] bg-transparent shadow-none",
  unboxed: "border-none bg-transparent shadow-none",
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
        variant !== "unboxed" && variant !== "progress"
          ? "rounded-[var(--radius-md)]"
          : "",
        PANEL_VARIANTS[variant],
        inset && variant !== "unboxed" ? "p-5 sm:p-6" : "",
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
        <h2 className="text-[length:var(--text-title)] font-medium tracking-tight text-[var(--color-ink)]">
          {title}
        </h2>
        {hint ? (
          <p className="mt-1 text-[length:var(--text-body)] text-[var(--color-ink-muted)]">
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
