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
  className,
}: {
  explanation: NextStepExplanation;
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
    </motion.div>
  );
}
