"use client";

import { motion, useReducedMotion } from "framer-motion";

import type { DecisionView, NextRepresentationView } from "@/lib/session/views";
import { actionLabel } from "@/lib/ui/learning-presentation";

const STRATEGY_LABEL: Record<string, string> = {
  formal: "Precise definitions",
  conversational: "Plain-language explanation",
  "example-first": "Worked example",
  "analogy-first": "Analogy",
  "visual-first": "Mental model",
  socratic: "Guided questioning",
};

function strategyLabel(s: string): string {
  return STRATEGY_LABEL[s] ?? s.replace(/-/g, " ");
}

/**
 * The visible moment where the lesson changes because of the learner. Built
 * ENTIRELY from the backend `DecisionView` — the `adaptationNarrative`
 * (already CoT-free), the `whyThisNext` explanation, the action chain and, when
 * it changed, the previous → new teaching representation.
 */
export function AdaptiveTransition({
  headline,
  decision,
  previousStrategy,
  previousAction,
  representation = null,
  previousRepresentationLabel = null,
  onDone,
}: {
  headline: string;
  decision: DecisionView;
  previousStrategy?: string | null;
  previousAction?: string | null;
  /** How Lumen will show the concept on the next teaching step. */
  representation?: NextRepresentationView | null;
  /** The representation currently on screen (its mode label). */
  previousRepresentationLabel?: string | null;
  onDone?: () => void;
}) {
  const reduce = useReducedMotion();

  const strategyChanged =
    previousStrategy != null && previousStrategy !== decision.strategy;
  const fromLabel = previousAction ? actionLabel(previousAction) : null;
  const toLabel = actionLabel(decision.action);
  const approachChanged = fromLabel != null && fromLabel !== toLabel;
  const showApproach = approachChanged;

  const visualChanged =
    representation != null &&
    previousRepresentationLabel != null &&
    previousRepresentationLabel !== representation.modeLabel;
  const anyPair = showApproach || strategyChanged || visualChanged;

  return (
    <motion.div
      initial={reduce ? { opacity: 1 } : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onAnimationComplete={() => {
        if (onDone) window.setTimeout(onDone, reduce ? 400 : 2600);
      }}
      className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
    >
      <p className="text-[11px] font-semibold tracking-wider text-[var(--color-accent)] uppercase">
        Adaptive transition
      </p>
      <p className="mt-1.5 text-[13px] font-medium text-[var(--color-ink)]">
        {headline}
      </p>

      {anyPair ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {showApproach ? (
            <TransitionPair
              caption="Approach"
              from={fromLabel as string}
              to={toLabel}
              reduce={reduce}
            />
          ) : null}
          {strategyChanged ? (
            <TransitionPair
              caption="Teaching style"
              from={strategyLabel(previousStrategy)}
              to={strategyLabel(decision.strategy)}
              reduce={reduce}
            />
          ) : null}
          {visualChanged ? (
            <TransitionPair
              caption="Visual"
              from={previousRepresentationLabel as string}
              to={representation.modeLabel}
              reduce={reduce}
            />
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-[12px] text-[var(--color-ink-muted)]">
          Staying with{" "}
          <span className="font-medium text-[var(--color-ink)]">{toLabel}</span>{" "}
          on this concept.
        </p>
      )}

      {visualChanged ? (
        <p className="mt-3 text-[12px] leading-relaxed text-[var(--color-accent)]">
          {representation.rationale}
        </p>
      ) : null}

      {decision.whyThisNext ? (
        <p className="mt-3 text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
          {decision.whyThisNext.reason}
        </p>
      ) : decision.adaptationNarrative.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-1.5">
          {decision.adaptationNarrative.slice(0, 3).map((line, i) => (
            <motion.li
              key={line}
              initial={reduce ? false : { opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: reduce ? 0 : 0.4 + i * 0.2 }}
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

function TransitionPair({
  caption,
  from,
  to,
  reduce,
}: {
  caption: string;
  from: string;
  to: string;
  reduce: boolean | null;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
      <p className="text-[10px] font-semibold tracking-wider text-[var(--color-ink-faint)] uppercase">
        {caption}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <span className="rounded-full border border-[var(--color-border-strong)] px-2.5 py-1 text-[12px] text-[var(--color-ink-muted)]">
          {from}
        </span>
        <Arrow />
        <motion.span
          initial={reduce ? false : { opacity: 0, x: 4 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: reduce ? 0 : 0.35 }}
          className="rounded-full border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-2.5 py-1 text-[12px] font-medium text-[var(--color-accent)]"
        >
          {to}
        </motion.span>
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-3 text-[var(--color-ink-faint)]"
      aria-hidden
    >
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
