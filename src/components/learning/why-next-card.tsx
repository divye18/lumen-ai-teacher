"use client";

import { motion, useReducedMotion } from "framer-motion";

import type { NextStepExplanation } from "@/lib/teaching/why-next";
import { cn } from "@/lib/ui/cn";

/**
 * "Why this next?" — a compact card shown above the current activity. The text
 * is the deterministic `DecisionView.whyThisNext` built by the teaching engine;
 * this component only renders it. Never chain-of-thought.
 */
export function WhyNextCard({
  explanation,
  personalizationNote = null,
  readinessNote = null,
  className,
}: {
  explanation: NextStepExplanation;
  /**
   * Adaptive teacher memory: one sentence when a cross-session learning signal
   * shaped this step. Rendered as a distinct, quieter line beneath the reason.
   */
  personalizationNote?: string | null;
  /**
   * The teaching engine's current read on this concept — already
   * deterministic, learner-safe prose (`LearningIntelligenceView.
   * readinessRationale`), e.g. "You've applied this correctly and your
   * recent answers are holding — ready to build on it." Shown only when
   * there's enough evidence to say something meaningful.
   */
  readinessNote?: string | null;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      key={explanation.headline + explanation.reason}
      initial={reduce ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className={cn(
        "rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-3",
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        <svg
          viewBox="0 0 16 16"
          className="size-3 text-[var(--color-accent)]"
          aria-hidden
        >
          <path
            d="M8 1.5 10 6l4.5.5-3.4 3 1 4.5L8 11.7 3.9 14l1-4.5-3.4-3L6 6z"
            fill="currentColor"
          />
        </svg>
        <p className="text-[10px] font-semibold tracking-wider text-[var(--color-accent)] uppercase">
          Why this next
        </p>
      </div>
      <p className="mt-1.5 text-[13px] font-medium text-[var(--color-ink)]">
        {explanation.headline}
      </p>
      <p className="mt-0.5 text-[12px] leading-snug text-[var(--color-ink-muted)]">
        {explanation.reason}
      </p>
      {personalizationNote ? (
        <p className="mt-2 border-t border-[var(--color-border)] pt-2 text-[11px] leading-snug text-[var(--color-accent)]">
          {personalizationNote}
        </p>
      ) : null}
      {readinessNote ? (
        <p
          className={cn(
            "text-[11px] leading-snug text-[var(--color-ink-faint)]",
            personalizationNote
              ? "mt-1.5"
              : "mt-2 border-t border-[var(--color-border)] pt-2",
          )}
        >
          {readinessNote}
        </p>
      ) : null}
    </motion.div>
  );
}
