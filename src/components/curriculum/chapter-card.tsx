"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";

export interface ChapterCardData {
  id: string;
  title: string;
  href: string;
  totalTopics: number;
  completedTopics: number;
  nextTopicTitle: string | null;
}

export function isChapterComplete(
  totalTopics: number,
  nextTopicTitle: string | null,
): boolean {
  return totalTopics > 0 && nextTopicTitle === null;
}

export function ChapterCard({
  chapter,
  index = 0,
}: {
  chapter: ChapterCardData;
  index?: number;
}) {
  const isComplete = isChapterComplete(
    chapter.totalTopics,
    chapter.nextTopicTitle,
  );

  const num = (index + 1).toString().padStart(2, "0");

  return (
    <div className="group relative flex flex-col gap-4 border-b border-[var(--color-border)] px-4 py-8 transition-colors hover:bg-[var(--color-subtle)] sm:flex-row sm:items-center sm:gap-8 sm:px-6">
      <div className="pt-1 text-[length:var(--text-meta)] font-semibold text-[var(--color-ink-faint)] sm:w-8 sm:pt-0">
        {num}.
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <Link
          href={chapter.href}
          className="text-[length:var(--text-title)] font-medium tracking-tight text-[var(--color-ink)] transition-colors before:absolute before:inset-0 before:z-10 hover:text-[var(--color-learning)]"
        >
          {chapter.title}
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <span className="text-[length:var(--text-meta)] text-[var(--color-ink-muted)]">
            {chapter.completedTopics} / {chapter.totalTopics} topics
          </span>
          {chapter.totalTopics > 0 ? (
            <div className="h-[2px] w-24 bg-[var(--color-border)]">
              <div
                className="h-full bg-[var(--color-learning)]"
                style={{
                  width: `${(chapter.completedTopics / chapter.totalTopics) * 100}%`,
                }}
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="relative z-20 mt-4 shrink-0 sm:mt-0">
        {isComplete ? (
          <Badge tone="positive" dot>
            Complete
          </Badge>
        ) : chapter.nextTopicTitle ? (
          <LinkButton
            href={chapter.href}
            size="sm"
            variant="secondary"
            className="w-full sm:w-auto"
          >
            Continue Topic
          </LinkButton>
        ) : null}
      </div>
    </div>
  );
}
