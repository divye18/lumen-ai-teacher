"use client";

import { motion, useReducedMotion } from "framer-motion";

import { LinkButton } from "@/components/ui/button";
import { emptyStateEntrance, sectionEntrance } from "@/lib/ui/motion";
import type { CurriculumContinueLearningView } from "@/lib/studio/curriculum-home";
import type { ChapterProgress } from "@/lib/curriculum/chapter-progress";

export function CurriculumContinueLearningCard({
  continueLearning,
}: {
  continueLearning: CurriculumContinueLearningView | null;
  chapterProgress: ChapterProgress | null;
}) {
  const reduce = useReducedMotion();

  if (!continueLearning) {
    return (
      <motion.div
        initial={reduce ? false : emptyStateEntrance.initial}
        animate={emptyStateEntrance.animate}
        transition={emptyStateEntrance.transition}
        className="flex w-full flex-col gap-3 border-l-2 border-[var(--color-border-strong)] pl-5"
      >
        <p className="text-[length:var(--text-label)] font-semibold tracking-wide text-[var(--color-ink-muted)] uppercase">
          Next Topic
        </p>
        <p className="text-[length:var(--text-title)] font-medium text-[var(--color-ink)]">
          You haven&apos;t started a topic yet.
        </p>
        <p className="text-[length:var(--text-body)] text-[var(--color-ink-muted)]">
          Browse the curriculum to pick a topic and start learning.
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={reduce ? false : sectionEntrance.initial}
      animate={sectionEntrance.animate}
      transition={sectionEntrance.transition}
      className="flex w-full flex-col gap-5 border-l-2 border-[var(--color-border-strong)] pl-5"
    >
      <div>
        <p className="text-[length:var(--text-label)] font-semibold tracking-wide text-[var(--color-ink-muted)] uppercase">
          Next Topic
        </p>
        <h3 className="mt-1 text-[length:var(--text-display)] font-medium tracking-tight text-balance text-[var(--color-ink)]">
          {continueLearning.topicTitle}
        </h3>
        <p className="mt-1 text-[length:var(--text-body)] text-[var(--color-ink-muted)]">
          {continueLearning.chapterTitle}
        </p>
      </div>

      <div>
        <LinkButton href={`/learn/${continueLearning.sessionId}`} size="lg">
          Resume session
        </LinkButton>
      </div>
    </motion.div>
  );
}
