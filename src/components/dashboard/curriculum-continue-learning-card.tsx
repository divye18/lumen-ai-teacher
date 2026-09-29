"use client";

import { motion, useReducedMotion } from "framer-motion";

import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Panel } from "@/components/ui/surface";
import { CurriculumProgressBar } from "@/components/ui/curriculum-progress";
import {
  emptyStateEntrance,
  sectionEntrance,
  staggerContainer,
  staggerItem,
} from "@/lib/ui/motion";
import type { CurriculumContinueLearningView } from "@/lib/studio/curriculum-home";
import type { ChapterProgress } from "@/lib/curriculum/chapter-progress";

/**
 * Home's "Continue Learning" hero (Milestone 20). The one dominant surface
 * on Studio — "you are currently here," not a dashboard card: subject/topic
 * context, real curriculum progress, one clear next action. Still exactly
 * the data Milestone 19.3 assembled (topic, chapter, progress, session id)
 * — no new fields invented, no client fetch, no new API. Links directly to
 * the existing `/learn/{sessionId}` Teaching Room.
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
        initial={reduce ? false : emptyStateEntrance.initial}
        animate={emptyStateEntrance.animate}
        transition={emptyStateEntrance.transition}
      >
        <Panel variant="quiet" inset className="text-center sm:text-left">
          <Badge tone="neutral">Continue learning</Badge>
          <p className="mt-3 text-[length:var(--text-title)] font-medium text-[var(--color-ink)]">
            You haven&apos;t started a topic yet.
          </p>
          <p className="mt-1 text-[length:var(--text-body)] text-[var(--color-ink-muted)]">
            Browse the curriculum to pick a topic and start learning.
          </p>
          <LinkButton href="/learn/c" className="mt-4">
            Browse curriculum
          </LinkButton>
        </Panel>
      </motion.div>
    );
  }

  const hasProgress = chapterProgress && chapterProgress.totalTopics > 0;

  return (
    <motion.div
      initial={reduce ? false : sectionEntrance.initial}
      animate={sectionEntrance.animate}
      transition={sectionEntrance.transition}
    >
      <Panel variant="hero" className="overflow-hidden">
        <motion.div
          initial={reduce ? "visible" : "hidden"}
          animate="visible"
          variants={staggerContainer.variants}
          className="flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-end lg:justify-between"
        >
          <div className="min-w-0">
            <motion.div variants={staggerItem.variants}>
              <p className="text-[length:var(--text-label)] font-semibold tracking-[0.08em] text-[var(--color-accent)] uppercase">
                Continue learning
              </p>
            </motion.div>
            <motion.h2
              variants={staggerItem.variants}
              className="mt-2 max-w-2xl text-[length:var(--text-hero)] leading-[1.05] font-semibold tracking-tight text-balance text-[var(--color-ink)]"
            >
              {continueLearning.topicTitle}
            </motion.h2>
            <motion.p
              variants={staggerItem.variants}
              className="mt-2 text-[length:var(--text-subtitle)] text-[var(--color-ink-muted)]"
            >
              {continueLearning.chapterTitle}
            </motion.p>
          </div>

          <motion.div
            variants={staggerItem.variants}
            className="flex w-full shrink-0 flex-col gap-4 lg:w-64"
          >
            {hasProgress ? (
              <CurriculumProgressBar
                completed={chapterProgress.completedTopics}
                total={chapterProgress.totalTopics}
              />
            ) : null}
            <LinkButton
              href={`/learn/${continueLearning.sessionId}`}
              size="lg"
              className="w-full"
            >
              Continue learning
            </LinkButton>
          </motion.div>
        </motion.div>
      </Panel>
    </motion.div>
  );
}
