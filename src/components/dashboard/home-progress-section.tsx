"use client";

import { motion, useReducedMotion } from "framer-motion";

import { Badge } from "@/components/ui/badge";
import { MasteryMeter } from "@/components/ui/mastery-meter";
import { CurriculumProgressBar } from "@/components/ui/curriculum-progress";
import { Panel, SectionHeading } from "@/components/ui/surface";
import { panelEntrance } from "@/lib/ui/motion";
import type {
  ChapterProgress,
  NextTopic,
} from "@/lib/curriculum/chapter-progress";

export interface MasterySummary {
  averagePoints: number;
  conceptCount: number;
}

/**
 * Home's "Your Progress" section (Milestone 19.3). Deliberately renders
 * curriculum progress and concept mastery as two visually and textually
 * separate panels — never a combined score. `chapterProgress` is 18.3e's
 * real engagement data; `masterySummary` reuses the mastery aggregate
 * `getStudioOverview` already assembles (no new mastery query here). If
 * neither is available, the whole section renders nothing — never a fake
 * empty progress bar.
 */
export function HomeProgressSection({
  chapterProgress,
  nextTopic,
  masterySummary,
}: {
  chapterProgress: ChapterProgress | null;
  nextTopic: NextTopic | null;
  masterySummary: MasterySummary | null;
}) {
  const reduce = useReducedMotion();
  if (!chapterProgress && !masterySummary) return null;

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading title="Your progress" />
      <div className="grid gap-4 sm:grid-cols-2">
        {chapterProgress ? (
          <motion.div
            initial={reduce ? false : panelEntrance.initial}
            animate={panelEntrance.animate}
            transition={panelEntrance.transition}
          >
            <Panel inset>
              <CurriculumProgressBar
                completed={chapterProgress.completedTopics}
                total={chapterProgress.totalTopics}
              />
              <div className="mt-3">
                {nextTopic ? (
                  <p className="text-[12px] text-[var(--color-ink-muted)]">
                    Next: {nextTopic.title}
                  </p>
                ) : (
                  <Badge tone="positive" dot>
                    Chapter complete
                  </Badge>
                )}
              </div>
            </Panel>
          </motion.div>
        ) : null}

        {masterySummary ? (
          <motion.div
            initial={reduce ? false : panelEntrance.initial}
            animate={panelEntrance.animate}
            transition={panelEntrance.transition}
          >
            <Panel inset>
              <p className="text-[12px] font-medium tracking-tight text-[var(--color-ink-muted)]">
                Concept mastery
              </p>
              <div className="mt-3">
                <MasteryMeter value={masterySummary.averagePoints} />
              </div>
              <p className="mt-2 text-[12px] text-[var(--color-ink-muted)]">
                Average across {masterySummary.conceptCount} concept
                {masterySummary.conceptCount === 1 ? "" : "s"}
              </p>
            </Panel>
          </motion.div>
        ) : null}
      </div>
    </div>
  );
}
