"use client";

import { useEffect, useRef, useState } from "react";
import { animate, motion, useReducedMotion } from "framer-motion";

import type { EvaluationView, LearnerUpdateView } from "@/lib/session/views";
import { classificationPresentation } from "@/lib/ui/learning-presentation";
import { cn } from "@/lib/ui/cn";

/**
 * The mastery movement, made visible: previous → new, with the signed delta and
 * a "Why did this change?" disclosure that lists the real evidence behind it.
 * Subtle by design — this is a learner-state change, not a game score.
 *
 * Every value comes from the persisted `LearnerUpdateView` / `EvaluationView`.
 */
export function MasteryTransition({
  learnerUpdate,
  evaluation,
  className,
}: {
  learnerUpdate: LearnerUpdateView;
  evaluation: EvaluationView;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const delta = learnerUpdate.masteryAfter - learnerUpdate.masteryBefore;
  const dir = delta > 0 ? "up" : delta < 0 ? "down" : "flat";

  const tone =
    dir === "up"
      ? "var(--color-positive)"
      : dir === "down"
        ? "var(--color-warning)"
        : "var(--color-ink-faint)";

  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4",
        className,
      )}
    >
      <p className="text-[10px] font-semibold tracking-wider text-[var(--color-ink-faint)] uppercase">
        Mastery
      </p>

      <div className="mt-2 flex items-center gap-3">
        <span className="text-[15px] font-semibold text-[var(--color-ink-faint)] tabular-nums">
          {learnerUpdate.masteryBefore}
        </span>
        <motion.span
          aria-hidden
          initial={reduce ? false : { y: dir === "down" ? -3 : 3, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="text-[var(--color-ink-faint)]"
        >
          {dir === "up" ? "↑" : dir === "down" ? "↓" : "→"}
        </motion.span>
        <AnimatedNumber
          value={learnerUpdate.masteryAfter}
          className="text-[22px] font-semibold tracking-tight tabular-nums"
        />
        <span
          className="ml-auto text-[12px] font-semibold tabular-nums"
          style={{ color: tone }}
        >
          {delta > 0 ? `+${delta}` : delta} mastery
        </span>
      </div>

      <p className="mt-1 text-[11px] text-[var(--color-ink-muted)]">
        {learnerUpdate.reason}
      </p>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-2 text-[11px] font-medium text-[var(--color-accent)] hover:underline"
      >
        {open ? "Hide" : "Why did this change?"}
      </button>

      {open ? (
        <motion.dl
          initial={reduce ? false : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mt-2 space-y-1 overflow-hidden border-t border-[var(--color-border)] pt-2 text-[11px]"
        >
          <Row
            term="Answer"
            value={classificationPresentation(evaluation.classification).label}
          />
          <Row
            term="Confidence"
            value={`${Math.round(learnerUpdate.confidenceBefore * 100)}% → ${Math.round(
              learnerUpdate.confidenceAfter * 100,
            )}%`}
          />
          <Row
            term="Graded by"
            value={
              evaluation.source === "structured"
                ? "Deterministic check"
                : evaluation.source === "ai"
                  ? "Answer evaluation"
                  : "Provisional — evaluator unavailable"
            }
          />
          {evaluation.breakdown?.summary ? (
            <Row term="Detail" value={evaluation.breakdown.summary} />
          ) : null}
          {evaluation.missingConcepts.length > 0 ? (
            <Row term="Gap" value={evaluation.missingConcepts.join(", ")} />
          ) : null}
          {evaluation.misconception ? (
            <Row
              term="Signal"
              value={`Misconception — ${evaluation.misconception.label}`}
            />
          ) : null}
        </motion.dl>
      ) : null}
    </div>
  );
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-[var(--color-ink-faint)]">{term}</dt>
      <dd className="text-right text-[var(--color-ink)]">{value}</dd>
    </div>
  );
}

function AnimatedNumber({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduce) return;
    const controls = animate(from.current, value, {
      duration: 0.7,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
      onComplete: () => {
        from.current = value;
      },
    });
    return () => {
      from.current = value;
      controls.stop();
    };
  }, [value, reduce]);
  return (
    <span className={className}>{reduce ? value : Math.round(display)}</span>
  );
}
