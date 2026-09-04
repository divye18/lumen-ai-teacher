"use client";

import { motion, useReducedMotion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { MasteryTransition } from "@/components/learning/mastery-transition";
import { MisconceptionReveal } from "@/components/teaching/misconception-reveal";
import type { InteractionResultView } from "@/lib/session/views";
import {
  classificationPresentation,
  type ClassificationTone,
} from "@/lib/ui/learning-presentation";
import { cn } from "@/lib/ui/cn";

const TONE_STYLE: Record<ClassificationTone, { color: string; ring: string }> =
  {
    correct: {
      color: "var(--color-positive)",
      ring: "color-mix(in oklab, var(--color-positive) 30%, transparent)",
    },
    partial: {
      color: "var(--color-band-developing)",
      ring: "color-mix(in oklab, var(--color-band-developing) 30%, transparent)",
    },
    incorrect: {
      color: "var(--color-warning)",
      ring: "color-mix(in oklab, var(--color-warning) 30%, transparent)",
    },
    uncertain: {
      color: "var(--color-ink-faint)",
      ring: "var(--color-border-strong)",
    },
  };

export function EvaluationResult({
  result,
  onContinue,
  continuing,
}: {
  result: InteractionResultView;
  onContinue: () => void;
  continuing: boolean;
}) {
  const reduce = useReducedMotion();
  const { evaluation, learnerUpdate } = result;
  const cls = classificationPresentation(evaluation.classification);
  const style = TONE_STYLE[cls.tone];

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div
        className="rounded-[var(--radius-lg)] border p-5"
        style={{
          borderColor: style.ring,
          backgroundColor: `color-mix(in oklab, ${style.color} 6%, transparent)`,
        }}
      >
        <div
          className="flex items-center gap-2 text-[11px] font-semibold tracking-wider uppercase"
          style={{ color: style.color }}
        >
          <ResultGlyph tone={cls.tone} />
          {cls.label}
        </div>
        <p className="mt-2.5 text-[14px] leading-relaxed text-[var(--color-ink)]">
          {evaluation.feedback}
        </p>

        {evaluation.breakdown?.items &&
        evaluation.breakdown.items.length > 0 ? (
          <ul className="mt-3 space-y-1">
            {evaluation.breakdown.items.map((item) => (
              <li
                key={item.id}
                className="flex items-start gap-2 text-[12px] leading-snug"
              >
                <span
                  className={cn(
                    "mt-0.5 shrink-0 font-semibold",
                    item.correct
                      ? "text-[var(--color-positive)]"
                      : "text-[var(--color-warning)]",
                  )}
                  aria-hidden
                >
                  {item.correct ? "✓" : "✗"}
                </span>
                <span className="text-[var(--color-ink-muted)]">
                  {item.text}
                  {!item.correct && item.expected ? (
                    <span className="text-[var(--color-ink-faint)]">
                      {" "}
                      — {item.expected}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {evaluation.missingConcepts.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {evaluation.missingConcepts.map((m) => (
              <span
                key={m}
                className="rounded-full border border-[var(--color-border-strong)] px-2 py-0.5 text-[11px] text-[var(--color-ink-muted)]"
              >
                missing: {m}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {evaluation.misconception ? (
        <MisconceptionReveal
          misconception={evaluation.misconception}
          className="mt-3"
        />
      ) : evaluation.misconceptionInsight ? (
        <div className="mt-3 rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--color-warning)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-warning)_7%,transparent)] p-3.5">
          <p className="text-[10px] font-semibold tracking-wider text-[var(--color-warning)] uppercase">
            Lumen noticed a pattern
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-ink)]">
            {evaluation.misconceptionInsight.explanation}
          </p>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <MasteryTransition
          learnerUpdate={learnerUpdate}
          evaluation={evaluation}
        />

        <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
          <p className="text-[11px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">
            What Lumen learned
          </p>
          <ul className="mt-2 space-y-1.5 text-[12px] text-[var(--color-ink-muted)]">
            <li className="flex justify-between">
              <span>Confidence</span>
              <span className="font-medium text-[var(--color-ink)]">
                {Math.round(learnerUpdate.confidenceBefore * 100)}% →{" "}
                {Math.round(learnerUpdate.confidenceAfter * 100)}%
              </span>
            </li>
            {learnerUpdate.newMisconceptions > 0 ? (
              <li className="text-[var(--color-warning)]">
                Detected {learnerUpdate.newMisconceptions} new misconception
                {learnerUpdate.newMisconceptions === 1 ? "" : "s"}
              </li>
            ) : null}
            {learnerUpdate.repeatedMisconception ? (
              <li className="text-[var(--color-warning)]">
                A misconception recurred — Lumen will re-teach differently
              </li>
            ) : learnerUpdate.reinforcedMisconceptions > 0 ? (
              <li>Reinforced evidence on a known misconception</li>
            ) : null}
            {learnerUpdate.newMisconceptions === 0 &&
            !learnerUpdate.repeatedMisconception &&
            learnerUpdate.reinforcedMisconceptions === 0 ? (
              <li>No misconceptions surfaced in this answer</li>
            ) : null}
          </ul>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button onClick={onContinue} loading={continuing} size="lg">
          See what&apos;s next
        </Button>
      </div>
    </motion.div>
  );
}

function ResultGlyph({ tone }: { tone: ClassificationTone }) {
  if (tone === "correct") {
    return (
      <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
        <path
          d="M3 8.5l3 3 7-8"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    );
  }
  return <span className="size-2 rounded-full bg-current" aria-hidden />;
}
