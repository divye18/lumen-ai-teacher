import type { HTMLAttributes } from "react";

import { cn } from "@/lib/ui/cn";

/** A restrained container. Used sparingly — not everything is a card. */
export function Panel({
  className,
  inset,
  ...props
}: HTMLAttributes<HTMLDivElement> & { inset?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]",
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
  className,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-[var(--color-ink)]">
          {title}
        </h2>
        {hint ? (
          <p className="mt-0.5 text-[13px] text-[var(--color-ink-muted)]">
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
