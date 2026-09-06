"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { CurriculumProgressBar } from "@/components/ui/curriculum-progress";
import { Panel } from "@/components/ui/surface";
import { cardEntrance } from "@/lib/ui/motion";

export interface ChapterCardData {
  id: string;
  title: string;
  /** The chapter's own route — also where "Continue: ..." links, since the
   * terminal topic route (this same page) is where a student actually acts
   * on a specific topic; there is no separate per-topic route. */
  href: string;
  totalTopics: number;
  completedTopics: number;
  /** From 18.3e's `nextTopic` — `null` means every active topic is
   * COMPLETED. Title only; the CTA always links to `href` above. */
  nextTopicTitle: string | null;
}

/** Pure: a chapter reads as "complete" only once it has at least one active
 * topic AND every one of them is done (no next topic left to recommend). A
 * chapter with zero topics is never "complete" — it's just empty. */
export function isChapterComplete(
  totalTopics: number,
  nextTopicTitle: string | null,
): boolean {
  return totalTopics > 0 && nextTopicTitle === null;
}

/**
 * One chapter's curriculum ENGAGEMENT progress (18.3e) — never mastery.
 * `CurriculumProgressBar` (19.1) is the only progress visual here;
 * `MasteryMeter` is never used for this.
 */
export function ChapterCard({
  chapter,
  index = 0,
}: {
  chapter: ChapterCardData;
  index?: number;
}) {
  const reduce = useReducedMotion();
  const entrance = cardEntrance(index);
  const isComplete = isChapterComplete(
    chapter.totalTopics,
    chapter.nextTopicTitle,
  );

  return (
    <motion.div
      initial={reduce ? false : entrance.initial}
      animate={entrance.animate}
      transition={entrance.transition}
    >
      <Panel className="flex h-full flex-col justify-between gap-4 p-4">
        <div>
          <Link
            href={chapter.href}
            className="text-[14px] font-medium text-[var(--color-ink)] transition-colors hover:text-[var(--color-accent)]"
          >
            {chapter.title}
          </Link>

          {chapter.totalTopics > 0 ? (
            <div className="mt-3">
              <CurriculumProgressBar
                completed={chapter.completedTopics}
                total={chapter.totalTopics}
                size="sm"
              />
            </div>
          ) : null}
        </div>

        <div>
          {isComplete ? (
            <Badge tone="positive" dot>
              Chapter complete
            </Badge>
          ) : chapter.nextTopicTitle ? (
            <LinkButton href={chapter.href} size="sm" className="w-full">
              Continue: {chapter.nextTopicTitle}
            </LinkButton>
          ) : null}
        </div>
      </Panel>
    </motion.div>
  );
}
