import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import { CurriculumBreadcrumbs } from "@/components/curriculum/curriculum-breadcrumbs";
import { CurriculumPageTransition } from "@/components/curriculum/curriculum-page-transition";
import { KnowledgeMap } from "@/components/curriculum/knowledge-map";
import { EmptyState } from "@/components/ui/states";
import { requireUser } from "@/lib/auth/current-user";
import { createCurriculumStore, createLessonStore } from "@/lib/db/repositories";
import { getSupabaseServerClient } from "@/lib/db/server";
import { getNcertChapterLevel, getNcertTopicLevel, nodeSlug } from "@/lib/curriculum/ncert-browser";
import { getChapterProgressForUser } from "@/lib/curriculum/chapter-progress";
import { getTopicProgressForNodes } from "@/lib/curriculum/topic-progress";

export const metadata: Metadata = { title: "Knowledge Map" };
export const dynamic = "force-dynamic";

export default async function CurriculumSubjectPage({
  params,
}: {
  params: Promise<{ classSlug: string; subjectSlug: string }>;
}) {
  const { classSlug, subjectSlug } = await params;
  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);
  if (!user.ok) redirect(`/login?next=/learn/c/${classSlug}/${subjectSlug}`);

  const store = createCurriculumStore(supabase);
  const lessons = createLessonStore(supabase);

  const level = await getNcertChapterLevel(store, user.value.id, classSlug, subjectSlug);
  if (!level.ok || !level.value) notFound();

  const { classNode, subjectNode, chapters, source } = level.value;

  // Build the complete knowledge map data structure
  const mapChapters = await Promise.all(
    chapters.map(async (chapter) => {
      const chapterSlug = nodeSlug(chapter);
      
      // Get chapter progress
      const progressRes = await getChapterProgressForUser(store, lessons, user.value.id, source.id, chapter.id);
      const totalTopics = progressRes.ok ? progressRes.value.progress.totalTopics : 0;
      const completedTopics = progressRes.ok ? progressRes.value.progress.completedTopics : 0;

      // Get topics
      const topicLevel = await getNcertTopicLevel(store, user.value.id, classSlug, subjectSlug, chapterSlug);
      const topics = topicLevel.ok && topicLevel.value ? topicLevel.value.topics : [];

      // Get topic progress
      const topicProgressRes = await getTopicProgressForNodes(lessons, user.value.id, topics);
      const statusByNodeId = new Map(topicProgressRes.ok ? topicProgressRes.value.map(p => [p.nodeId, p.status]) : []);

      return {
        id: chapter.id,
        title: chapter.title,
        slug: chapterSlug,
        totalTopics,
        completedTopics,
        topics: topics.map(t => ({
          id: t.id,
          title: t.title,
          status: statusByNodeId.get(t.id) ?? "NOT_STARTED",
        }))
      };
    })
  );

  return (
    <CurriculumPageTransition className="dark mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-12 sm:px-12 sm:py-24 selection:bg-[var(--color-ink-muted)] selection:text-[var(--color-canvas)]">
      <CurriculumBreadcrumbs
        items={[
          { label: "Classes", href: "/learn/c" },
          { label: classNode.title, href: `/learn/c/${classSlug}` },
          { label: subjectNode.title },
        ]}
      />

      <header className="mt-8 flex flex-col items-start pb-8 border-b border-[var(--color-border)]/30">
        <h1 className="font-editorial text-5xl sm:text-7xl font-medium tracking-tight text-[var(--color-ink)]">
          {subjectNode.title}
        </h1>
        <p className="mt-6 font-mono text-[11px] uppercase tracking-widest text-[var(--color-ink-muted)]">
          Knowledge Map
        </p>
      </header>

      {chapters.length === 0 ? (
        <div className="pt-12">
          <EmptyState
            title="No chapters available yet"
            description="This subject doesn't have any chapters yet."
          />
        </div>
      ) : (
        <KnowledgeMap chapters={mapChapters} subjectTitle={subjectNode.title} />
      )}
    </CurriculumPageTransition>
  );
}
