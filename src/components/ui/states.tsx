import type { ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-strong)] px-6 py-14 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-4 text-[var(--color-ink-faint)]">{icon}</div>
      ) : null}
      <p className="text-[15px] font-medium text-[var(--color-ink)]">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  retry,
  className,
}: {
  title?: string;
  description?: string;
  retry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-[color-mix(in_oklab,var(--color-danger)_28%,transparent)] bg-[color-mix(in_oklab,var(--color-danger)_7%,transparent)] px-6 py-12 text-center",
        className,
      )}
    >
      <p className="text-[15px] font-medium text-[var(--color-ink)]">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
          {description}
        </p>
      ) : null}
      {retry ? (
        <button
          type="button"
          onClick={retry}
          className="mt-5 h-8 rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] px-3 text-[13px] font-medium hover:bg-[var(--color-subtle)]"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function InlineSpinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-[var(--color-ink-muted)]">
      <span
        className="size-3.5 animate-spin rounded-full border-2 border-[var(--color-border-strong)] border-t-[var(--color-accent)]"
        aria-hidden
      />
      {label ? <span>{label}</span> : null}
      <span className="sr-only">Loading</span>
    </span>
  );
}
