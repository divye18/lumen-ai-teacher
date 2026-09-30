"use client";

import { motion, useReducedMotion } from "framer-motion";

import { panelEntrance } from "@/lib/ui/motion";
import type {
  ChapterProgress,
  NextTopic,
} from "@/lib/curriculum/chapter-progress";

export interface MasterySummary {
  averagePoints: number;
  conceptCount: number;
}

export function HomeProgressSection({
  chapterProgress,
  masterySummary,
}: {
  chapterProgress: ChapterProgress | null;
  nextTopic: NextTopic | null;
  masterySummary: MasterySummary | null;
}) {
  const reduce = useReducedMotion();
  if (!chapterProgress && !masterySummary) return null;

  return (
    <div className="flex flex-col gap-10 border-t border-[var(--color-border)] pt-8 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-8 lg:pl-12">
      {chapterProgress ? (
        <motion.div
          initial={reduce ? false : panelEntrance.initial}
          animate={panelEntrance.animate}
          transition={panelEntrance.transition}
          className="flex flex-col gap-4"
        >
          <p className="text-[length:var(--text-label)] font-semibold tracking-wide text-[var(--color-ink-muted)] uppercase">
            Curriculum Progress
          </p>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-[length:var(--text-meta)] text-[var(--color-ink)]">
              <span>
                {chapterProgress.completedTopics} of{" "}
                {chapterProgress.totalTopics} topics completed
              </span>
              <span>
                {chapterProgress.totalTopics > 0
                  ? Math.round(
                      (chapterProgress.completedTopics /
                        chapterProgress.totalTopics) *
                        100,
                    )
                  : 0}
                %
              </span>
            </div>
            <div className="h-[2px] w-full bg-[var(--color-border)]">
              <motion.div
                initial={{ width: 0 }}
                animate={{
                  width: `${chapterProgress.totalTopics > 0 ? (chapterProgress.completedTopics / chapterProgress.totalTopics) * 100 : 0}%`,
                }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full bg-[var(--color-learning)]"
              />
            </div>
          </div>
        </motion.div>
      ) : null}

      {masterySummary ? (
        <motion.div
          initial={reduce ? false : panelEntrance.initial}
          animate={panelEntrance.animate}
          transition={panelEntrance.transition}
          className="flex flex-col gap-4"
        >
          <p className="text-[length:var(--text-label)] font-semibold tracking-wide text-[var(--color-ink-muted)] uppercase">
            Concept Mastery
          </p>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-[length:var(--text-meta)] text-[var(--color-ink)]">
              <span>Average Aggregate</span>
              <span className="font-semibold text-[var(--color-achievement)]">
                {masterySummary.averagePoints}
              </span>
            </div>
            <div className="h-[2px] w-full bg-[var(--color-border)]">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${masterySummary.averagePoints}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full bg-[var(--color-achievement)]"
              />
            </div>
            <p className="text-[length:var(--text-meta)] text-[var(--color-ink-faint)]">
              Across {masterySummary.conceptCount} concept
              {masterySummary.conceptCount === 1 ? "" : "s"}
            </p>
          </div>
        </motion.div>
      ) : null}
    </div>
  );
}
