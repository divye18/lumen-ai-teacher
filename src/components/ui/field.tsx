import { forwardRef, useId } from "react";
import type {
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";

import { cn } from "@/lib/ui/cn";

const baseControl =
  "w-full rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] transition-colors focus-visible:border-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--color-accent)_35%,transparent)] disabled:opacity-50";

export function FieldShell({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  htmlFor: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={htmlFor}
          className="text-[13px] font-medium text-[var(--color-ink)]"
        >
          {label}
        </label>
        {hint ? (
          <span className="text-[12px] text-[var(--color-ink-faint)]">
            {hint}
          </span>
        ) : null}
      </div>
      {children}
      {error ? (
        <p className="text-[12px] text-[var(--color-danger)]">{error}</p>
      ) : null}
    </div>
  );
}

export const TextField = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & {
    label: string;
    hint?: string;
    error?: string | null;
  }
>(function TextField({ label, hint, error, className, id, ...props }, ref) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={fieldId}>
      <input
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        className={cn(baseControl, "h-9", className)}
        {...props}
      />
    </FieldShell>
  );
});

export const TextAreaField = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & {
    label: string;
    hint?: string;
    error?: string | null;
  }
>(function TextAreaField(
  { label, hint, error, className, id, rows = 4, ...props },
  ref,
) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={fieldId}>
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        className={cn(baseControl, "resize-y py-2 leading-relaxed", className)}
        {...props}
      />
    </FieldShell>
  );
});

export function SegmentedField<T extends string>({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  const groupId = useId();
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span
          id={groupId}
          className="text-[13px] font-medium text-[var(--color-ink)]"
        >
          {label}
        </span>
        {hint ? (
          <span className="text-[12px] text-[var(--color-ink-faint)]">
            {hint}
          </span>
        ) : null}
      </div>
      <div
        role="radiogroup"
        aria-labelledby={groupId}
        className="flex flex-wrap gap-1.5"
      >
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt.value)}
              className={cn(
                "h-8 rounded-[var(--radius-sm)] border px-3 text-[13px] font-medium transition-colors",
                active
                  ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                  : "border-[var(--color-border-strong)] text-[var(--color-ink-muted)] hover:bg-[var(--color-subtle)] hover:text-[var(--color-ink)]",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
