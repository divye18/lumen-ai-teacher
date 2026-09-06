"use client";

import { motion, useReducedMotion } from "framer-motion";

import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Panel } from "@/components/ui/surface";
import { panelEntrance } from "@/lib/ui/motion";
import type { CurriculumContinueLearningView } from "@/lib/studio/curriculum-home";
import type { ChapterProgress } from "@/lib/curriculum/chapter-progress";

/**
 * Home's "Continue Learning" card (Milestone 19.3) — intentionally simple
 * per this milestone's explicit scope: topic, chapter context, curriculum
 * progress if available, one CTA. No concept index, mastery, or time
 * remaining here — that richer detail is deliberately deferred, not lost.
 * Links directly to the existing `/learn/{sessionId}` Teaching Room; no
 * client fetch, no new API.
 */
export function CurriculumContinueLearningCard({
  continueLearning,
  chapterProgress,
}: {
  continueLearning: CurriculumContinueLearningView | null;
  chapterProgress: ChapterProgress | null;
}) {
  const reduce = useReducedMotion();

  if (!continueLearning) {
    return (
      <motion.div
        initial={reduce ? false : panelEntrance.initial}
        animate={panelEntrance.animate}
        transition={panelEntrance.transition}
      >
        <Panel inset>
          <Badge tone="neutral">Continue learning</Badge>
          <p className="mt-3 text-[15px] font-medium text-[var(--color-ink)]">
            You haven&apos;t started a topic yet.
          </p>
          <p className="mt-1 text-[13px] text-[var(--color-ink-muted)]">
            Browse the curriculum to pick a topic and start learning.
          </p>
          <LinkButton href="/learn/c" className="mt-4">
            Browse curriculum
          </LinkButton>
        </Panel>
      </motion.div>
    );
  }

  const showProgress =
    chapterProgress && chapterProgress.totalTopics > 0
      ? `${chapterProgress.completedTopics} / ${chapterProgress.totalTopics} topics`
      : null;

  return (
    <motion.div
      initial={reduce ? false : panelEntrance.initial}
      animate={panelEntrance.animate}
      transition={panelEntrance.transition}
    >
      <Panel inset>
        <Badge tone="accent" dot>
          Continue learning
        </Badge>
        <h2 className="mt-3 text-xl font-semibold tracking-tight text-[var(--color-ink)]">
          {continueLearning.topicTitle}
        </h2>
        <p className="mt-1 text-[13px] text-[var(--color-ink-muted)]">
          {continueLearning.chapterTitle}
          {showProgress ? ` · Curriculum progress · ${showProgress}` : ""}
        </p>
        <LinkButton
          href={`/learn/${continueLearning.sessionId}`}
          size="lg"
          className="mt-5"
        >
          Continue learning
        </LinkButton>
      </Panel>
    </motion.div>
  );
}
