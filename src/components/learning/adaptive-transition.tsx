"use client";

import { motion, useReducedMotion } from "framer-motion";

import type { DecisionView } from "@/lib/session/views";
import { actionLabel } from "@/lib/ui/learning-presentation";
import { cn } from "@/lib/ui/cn";

/**
 * The visible moment where the lesson changes because of the learner. Built
 * ENTIRELY from the backend `DecisionView` — the `adaptationNarrative`
 * (already CoT-free) plus the action chain. No hardcoded adaptive behaviour.
 */
export function AdaptiveTransition({
  headline,
  decision,
  onDone,
}: {
  headline: string;
  decision: DecisionView;
  onDone?: () => void;
}) {
  const reduce = useReducedMotion();
  const chain = [
    actionLabel(decision.action),
    decision.nextAction ? actionLabel(decision.nextAction) : null,
  ].filter(Boolean) as string[];

  return (
    <motion.div
      initial={reduce ? { opacity: 1 } : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onAnimationComplete={() => {
        if (onDone) window.setTimeout(onDone, reduce ? 400 : 2200);
      }}
      className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
    >
      <p className="text-[13px] font-medium text-[var(--color-ink)]">
        {headline}
      </p>
      <p className="mt-1 text-[11px] font-semibold tracking-wider text-[var(--color-accent)] uppercase">
        Lumen adapts
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {chain.map((step, i) => (
          <motion.span
            key={step + i}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduce ? 0 : 0.25 + i * 0.35 }}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] font-medium",
              i === 0
                ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                : "border-[var(--color-border-strong)] text-[var(--color-ink-muted)]",
            )}
          >
            {i > 0 ? <Arrow /> : null}
            {step}
          </motion.span>
        ))}
      </div>

      {decision.adaptationNarrative.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-1.5">
          {decision.adaptationNarrative.slice(0, 4).map((line, i) => (
            <motion.li
              key={line}
              initial={reduce ? false : { opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: reduce ? 0 : 0.6 + i * 0.25 }}
              className="flex gap-2 text-[12px] leading-snug text-[var(--color-ink-muted)]"
            >
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-[var(--color-ink-faint)]" />
              {line}
            </motion.li>
          ))}
        </ul>
      ) : null}
    </motion.div>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 16 16" className="-ml-1 size-3" aria-hidden>
      <path
        d="M3 8h9m0 0-3-3m3 3-3 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
