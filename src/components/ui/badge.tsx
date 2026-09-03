import type { HTMLAttributes } from "react";

import { cn } from "@/lib/ui/cn";

export function Badge({
  className,
  tone = "neutral",
  dot,
  color,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "accent" | "positive" | "warning" | "danger";
  dot?: boolean;
  /** Explicit CSS color for the dot / text (overrides tone). */
  color?: string;
}) {
  const tones: Record<string, string> = {
    neutral:
      "text-[var(--color-ink-muted)] border-[var(--color-border)] bg-[var(--color-surface)]",
    accent:
      "text-[var(--color-accent)] border-[color-mix(in_oklab,var(--color-accent)_30%,transparent)] bg-[var(--color-accent-soft)]",
    positive:
      "text-[var(--color-positive)] border-[color-mix(in_oklab,var(--color-positive)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-positive)_10%,transparent)]",
    warning:
      "text-[var(--color-warning)] border-[color-mix(in_oklab,var(--color-warning)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-warning)_10%,transparent)]",
    danger:
      "text-[var(--color-danger)] border-[color-mix(in_oklab,var(--color-danger)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-danger)_10%,transparent)]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-tight",
        tones[tone],
        className,
      )}
      style={color ? { color } : undefined}
      {...props}
    >
      {dot ? (
        <span
          className="size-1.5 rounded-full bg-current"
          style={color ? { backgroundColor: color } : undefined}
          aria-hidden
        />
      ) : null}
      {children}
    </span>
  );
}
