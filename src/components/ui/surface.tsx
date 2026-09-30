import type { HTMLAttributes } from "react";

import { cn } from "@/lib/ui/cn";

type PanelVariant =
  "default" | "quiet" | "elevated" | "hero" | "progress" | "unboxed";

const PANEL_VARIANTS: Record<PanelVariant, string> = {
  default: "bg-transparent shadow-none",
  quiet: "bg-[var(--color-subtle)]/50 shadow-none",
  elevated:
    "bg-[var(--color-surface)] shadow-[var(--shadow-sm)] border border-[var(--color-border)]/50",
  hero: "bg-[var(--color-surface)] shadow-[var(--shadow-md)]",
  progress:
    "border-t-2 border-[var(--color-learning)] bg-transparent shadow-none",
  unboxed: "bg-transparent shadow-none",
};

/** A restrained container. In the spatial redesign, this usually provides spacing and alignment, not hard borders. */
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
        variant === "elevated" || variant === "hero" || variant === "quiet"
          ? "rounded-[var(--radius-lg)]"
          : "",
        PANEL_VARIANTS[variant],
        inset && variant !== "unboxed" ? "p-5 sm:p-8" : "",
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
    <div className={cn("flex items-baseline justify-between gap-6", className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-2 font-mono text-[11px] font-medium tracking-[0.1em] text-[var(--color-ink-faint)] uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="font-editorial text-2xl font-medium tracking-tight text-[var(--color-ink)] md:text-3xl">
          {title}
        </h2>
        {hint ? (
          <p className="mt-2 text-[length:var(--text-body)] text-[var(--color-ink-muted)]">
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
        "border-0 border-t border-[var(--color-border)]/30",
        className,
      )}
    />
  );
}
