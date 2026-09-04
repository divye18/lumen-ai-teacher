"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

import type { InteractionResultView } from "@/lib/session/views";
import {
  actionLabel,
  classificationPresentation,
} from "@/lib/ui/learning-presentation";
import { cn } from "@/lib/ui/cn";

/**
 * LUMEN LEARNING SIGNAL — the whole adaptive chain from one answer, in one
 * place:
 *
 *   ANSWER → EVIDENCE → LEARNER MODEL UPDATE → TEACHING DECISION → NEXT
 *
 * Purely a read-out of the real `InteractionResultView`. No invented numbers,
 * no decorative motion standing in for intelligence.
 */
export function LearningSignalCard({
  result,
  className,
}: {
  result: InteractionResultView;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const { evaluation, learnerUpdate, nextDecision } = result;
  const cls = classificationPresentation(evaluation.classification);
  const masteryDelta = learnerUpdate.masteryAfter - learnerUpdate.masteryBefore;
  const confBefore = Math.round(learnerUpdate.confidenceBefore * 100);
  const confAfter = Math.round(learnerUpdate.confidenceAfter * 100);

  const evidence =
    evaluation.misconception?.explanation ??
    evaluation.misconceptionInsight?.explanation ??
    evaluation.breakdown?.summary ??
    (evaluation.missingConcepts.length > 0
      ? `Gap around ${evaluation.missingConcepts.slice(0, 2).join(" and ")}.`
      : cls.tone === "correct"
        ? "Your answer matched what a solid grasp looks like."
        : "Your answer didn't line up with the target idea.");

  const strategyChanged =
    nextDecision.action !== "ASK" && nextDecision.action !== "ASSESS";

  const rows: { label: string; node: ReactNode }[] = [
    {
      label: "Your answer",
      node: (
        <span className="font-medium" style={{ color: toneColor(cls.tone) }}>
          {cls.label}
        </span>
      ),
    },
    {
      label: "Evidence",
      node: <span className="text-[var(--color-ink-muted)]">{evidence}</span>,
    },
    {
      label: "Learner model",
      node: (
        <span className="tabular-nums">
          Mastery{" "}
          <b className="font-semibold">
            {learnerUpdate.masteryBefore} → {learnerUpdate.masteryAfter}
          </b>{" "}
          <span
            style={{
              color:
                masteryDelta > 0
                  ? "var(--color-positive)"
                  : masteryDelta < 0
                    ? "var(--color-warning)"
                    : "var(--color-ink-faint)",
            }}
          >
            ({masteryDelta > 0 ? "+" : ""}
            {masteryDelta})
          </span>
          {confBefore !== confAfter ? (
            <>
              {" · "}Confidence {confBefore}% → {confAfter}%
            </>
          ) : null}
        </span>
      ),
    },
    {
      label: "Teaching decision",
      node: (
        <span>
          {strategyChanged ? (
            <>
              <span className="text-[var(--color-ink-faint)]">Ask</span> →{" "}
            </>
          ) : null}
          <span className="font-medium text-[var(--color-accent)]">
            {actionLabel(nextDecision.action)}
          </span>
        </span>
      ),
    },
  ];

  if (nextDecision.whyThisNext) {
    rows.push({
      label: "Next",
      node: (
        <span className="text-[var(--color-ink-muted)]">
          {nextDecision.whyThisNext.headline}
        </span>
      ),
    });
  }

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-[var(--color-accent)] uppercase">
        <span className="size-1.5 rounded-full bg-[var(--color-accent)]" />
        Lumen learning signal
      </div>

      <ol className="mt-3 flex flex-col">
        {rows.map((r, i) => (
          <motion.li
            key={r.label}
            initial={reduce ? false : { opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: reduce ? 0 : 0.08 * i }}
            className="flex gap-2.5 pb-2.5 last:pb-0"
          >
            <div className="flex flex-col items-center pt-0.5">
              <span className="size-1.5 rounded-full bg-[var(--color-border-strong)]" />
              {i < rows.length - 1 ? (
                <span className="my-0.5 w-px flex-1 bg-[var(--color-border)]" />
              ) : null}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold tracking-wide text-[var(--color-ink-faint)] uppercase">
                {r.label}
              </p>
              <p className="mt-0.5 text-[12px] leading-snug text-[var(--color-ink)]">
                {r.node}
              </p>
            </div>
          </motion.li>
        ))}
      </ol>
    </motion.div>
  );
}

function toneColor(tone: string): string {
  switch (tone) {
    case "correct":
      return "var(--color-positive)";
    case "partial":
      return "var(--color-band-developing)";
    case "incorrect":
      return "var(--color-warning)";
    default:
      return "var(--color-ink-faint)";
  }
}
