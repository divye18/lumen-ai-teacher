import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ChapterCard } from "@/components/curriculum/chapter-card";
import { CurriculumBreadcrumbs } from "@/components/curriculum/curriculum-breadcrumbs";
import { CurriculumPageTransition } from "@/components/curriculum/curriculum-page-transition";
import { EmptyState } from "@/components/ui/states";
import { requireUser } from "@/lib/auth/current-user";
import {
  createCurriculumStore,
  createLessonStore,
} from "@/lib/db/repositories";
import { getSupabaseServerClient } from "@/lib/db/server";
import { getNcertChapterLevel, nodeSlug } from "@/lib/curriculum/ncert-browser";
import { getChapterProgressForUser } from "@/lib/curriculum/chapter-progress";

export const metadata: Metadata = { title: "Choose a chapter" };
export const dynamic = "force-dynamic";

export default async function CurriculumChapterPage({
  params,
}: {
  params: Promise<{ classSlug: string; subjectSlug: string }>;
}) {
  const { classSlug, subjectSlug } = await params;
  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);
  if (!user.ok) {
    redirect(`/login?next=/learn/c/${classSlug}/${subjectSlug}`);
  }

  const store = createCurriculumStore(supabase);
  const level = await getNcertChapterLevel(
    store,
    user.value.id,
    classSlug,
    subjectSlug,
  );
  if (!level.ok || !level.value) notFound();

  const { classNode, subjectNode, chapters, source } = level.value;

  // 18.3e chapter ENGAGEMENT progress — never mastery. One call per chapter
  // (bounded/parallelized via Promise.all); fine at the current pilot's
  // scale, per the 19.2 audit's explicit scoping.
  const lessons = createLessonStore(supabase);
  const chapterCards = await Promise.all(
    chapters.map(async (chapter) => {
      const href = `/learn/c/${classSlug}/${subjectSlug}/${nodeSlug(chapter)}`;
      const progressRes = await getChapterProgressForUser(
        store,
        lessons,
        user.value.id,
        source.id,
        chapter.id,
      );
      if (!progressRes.ok) {
        return {
          id: chapter.id,
          title: chapter.title,
          href,
          totalTopics: 0,
          completedTopics: 0,
          nextTopicTitle: null,
        };
      }
      return {
        id: chapter.id,
        title: chapter.title,
        href,
        totalTopics: progressRes.value.progress.totalTopics,
        completedTopics: progressRes.value.progress.completedTopics,
        nextTopicTitle: progressRes.value.nextTopic?.title ?? null,
      };
    }),
  );

  return (
    <CurriculumPageTransition className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <CurriculumBreadcrumbs
        items={[
          { label: "Classes", href: "/learn/c" },
          { label: classNode.title, href: `/learn/c/${classSlug}` },
          { label: subjectNode.title },
        ]}
      />

      <header>
        <h1 className="text-xl font-semibold tracking-tight">
          {subjectNode.title}
        </h1>
        <p className="mt-1 text-[13px] text-[var(--color-ink-muted)]">
          Choose a chapter to see its topics.
        </p>
      </header>

      {chapters.length === 0 ? (
        <EmptyState
          title="No chapters available yet"
          description="This subject doesn't have any chapters yet."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {chapterCards.map((chapter, index) => (
            <ChapterCard key={chapter.id} chapter={chapter} index={index} />
          ))}
        </div>
      )}
    </CurriculumPageTransition>
  );
}
