"use client";

import { motion, useReducedMotion } from "framer-motion";

import type { LearningEventView } from "@/lib/session/views";
import { LumenMark } from "@/components/ui/lumen-mark";
import { cn } from "@/lib/ui/cn";

/**
 * LUMEN LEARNING SIGNAL (7.4).
 *
 * One compact, contextual surface shown only when a MEANINGFUL learning event
 * occurred. It names what Lumen noticed in the learner's learning right now and
 * what changes because of it — using the deterministic learning-intelligence
 * event. Never internal reasoning. Not a dashboard.
 */
export function LumenLearningSignal({
  event,
  className,
}: {
  event: LearningEventView;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const moved = event.masteryTo !== event.masteryFrom;

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.3 }}
      className={cn(
        "rounded-[var(--radius-lg)] border border-[color-mix(in_oklab,var(--color-accent)_22%,var(--color-border))] bg-[color-mix(in_oklab,var(--color-accent-soft)_45%,var(--color-surface))] p-4 sm:p-5",
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        <LumenMark className="size-3.5 text-[var(--color-accent)]" />
        <p className="text-[10px] font-semibold tracking-wider text-[var(--color-accent)] uppercase">
          Lumen learning signal
        </p>
      </div>

      <p className="mt-2 text-[14px] font-semibold tracking-tight text-[var(--color-ink)]">
        {event.headline}
      </p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-ink-muted)]">
        {event.summary}
      </p>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-[12px]">
        {moved ? (
          <span className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">
              Mastery
            </span>
            <span className="text-[var(--color-ink-muted)] tabular-nums">
              {event.masteryFrom}
            </span>
            <span aria-hidden className="text-[var(--color-ink-faint)]">
              →
            </span>
            <span className="font-semibold text-[var(--color-ink)] tabular-nums">
              {event.masteryTo}
            </span>
          </span>
        ) : null}
        {event.next ? (
          <span className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">
              Next
            </span>
            <span className="text-[var(--color-ink-muted)]">{event.next}</span>
          </span>
        ) : null}
      </div>
    </motion.div>
  );
}
