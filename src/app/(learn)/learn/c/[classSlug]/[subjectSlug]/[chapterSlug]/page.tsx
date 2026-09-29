import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { CurriculumBreadcrumbs } from "@/components/curriculum/curriculum-breadcrumbs";
import { CurriculumPageTransition } from "@/components/curriculum/curriculum-page-transition";
import { CurriculumTopicList } from "@/components/curriculum/curriculum-topic-list";
import { EmptyState } from "@/components/ui/states";
import { requireUser } from "@/lib/auth/current-user";
import {
  createCurriculumStore,
  createLessonStore,
} from "@/lib/db/repositories";
import { getSupabaseServerClient } from "@/lib/db/server";
import { getNcertTopicLevel } from "@/lib/curriculum/ncert-browser";
import { getTopicProgressForNodes } from "@/lib/curriculum/topic-progress";

export const metadata: Metadata = { title: "Topics" };
export const dynamic = "force-dynamic";

export default async function CurriculumTopicPage({
  params,
}: {
  params: Promise<{
    classSlug: string;
    subjectSlug: string;
    chapterSlug: string;
  }>;
}) {
  const { classSlug, subjectSlug, chapterSlug } = await params;
  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);
  if (!user.ok) {
    redirect(`/login?next=/learn/c/${classSlug}/${subjectSlug}/${chapterSlug}`);
  }

  const store = createCurriculumStore(supabase);
  const level = await getNcertTopicLevel(
    store,
    user.value.id,
    classSlug,
    subjectSlug,
    chapterSlug,
  );
  if (!level.ok || !level.value) notFound();

  const { classNode, subjectNode, chapterNode, topics } = level.value;

  // 18.3d curriculum ENGAGEMENT progress — never mastery. Scoped to exactly
  // this chapter's already-fetched topic nodes (not the whole source), so
  // this is one additional lesson query, not a per-topic query.
  const lessons = createLessonStore(supabase);
  const progressRes = await getTopicProgressForNodes(
    lessons,
    user.value.id,
    topics,
  );
  const statusByNodeId = new Map(
    progressRes.ok ? progressRes.value.map((p) => [p.nodeId, p.status]) : [],
  );

  return (
    <CurriculumPageTransition className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <CurriculumBreadcrumbs
        items={[
          { label: "Classes", href: "/learn/c" },
          { label: classNode.title, href: `/learn/c/${classSlug}` },
          {
            label: subjectNode.title,
            href: `/learn/c/${classSlug}/${subjectSlug}`,
          },
          { label: chapterNode.title },
        ]}
      />

      <header>
        <h1 className="text-[length:var(--text-display)] font-semibold tracking-tight text-[var(--color-ink)]">
          {chapterNode.title}
        </h1>
        <p className="mt-1 text-[length:var(--text-body)] text-[var(--color-ink-muted)]">
          {topics.length === 1
            ? "1 topic in this chapter."
            : `${topics.length} topics in this chapter.`}
        </p>
      </header>

      {topics.length === 0 ? (
        <EmptyState
          title="No topics available yet"
          description="This chapter doesn't have any topics yet."
        />
      ) : (
        <CurriculumTopicList
          chapterTitle={chapterNode.title}
          topics={topics.map((t) => ({
            id: t.id,
            title: t.title,
            status: statusByNodeId.get(t.id) ?? "NOT_STARTED",
          }))}
        />
      )}
    </CurriculumPageTransition>
  );
}
