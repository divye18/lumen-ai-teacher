"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const SIZE = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" };

/**
 * Accessible modal built on the native `<dialog>` element: focus trap, ESC to
 * close and inert background come for free. Backdrop click closes.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
  size = "md",
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="dialog-title"
      aria-describedby={description ? "dialog-desc" : undefined}
      className={cn(
        "m-auto w-[calc(100vw-2rem)] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-0 text-[var(--color-ink)] shadow-[var(--shadow-lg)]",
        "backdrop:bg-black/40 backdrop:backdrop-blur-[2px]",
        "open:animate-[dialog-in_180ms_ease-out]",
        SIZE[size],
        className,
      )}
    >
      {open ? (
        <div className="lumen-scroll max-h-[85vh] overflow-y-auto">
          <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4">
            <div>
              <h2
                id="dialog-title"
                className="text-[15px] font-semibold tracking-tight"
              >
                {title}
              </h2>
              {description ? (
                <p
                  id="dialog-desc"
                  className="mt-0.5 text-[13px] text-[var(--color-ink-muted)]"
                >
                  {description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="-mt-1 -mr-1 grid size-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-faint)] hover:bg-[var(--color-subtle)] hover:text-[var(--color-ink)]"
            >
              <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
                <path
                  d="M3 3l10 10M13 3L3 13"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          <div className="px-5 py-4">{children}</div>
        </div>
      ) : null}
    </dialog>
  );
}
