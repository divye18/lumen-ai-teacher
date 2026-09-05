import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { CurriculumBreadcrumbs } from "@/components/curriculum/curriculum-breadcrumbs";
import { CurriculumNodeGrid } from "@/components/curriculum/curriculum-node-grid";
import { EmptyState } from "@/components/ui/states";
import { requireUser } from "@/lib/auth/current-user";
import { createCurriculumStore } from "@/lib/db/repositories";
import { getSupabaseServerClient } from "@/lib/db/server";
import { getNcertChapterLevel, nodeSlug } from "@/lib/curriculum/ncert-browser";

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

  const { classNode, subjectNode, chapters } = level.value;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
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
        <CurriculumNodeGrid
          items={chapters.map((c) => ({
            id: c.id,
            title: c.title,
            href: `/learn/c/${classSlug}/${subjectSlug}/${nodeSlug(c)}`,
          }))}
        />
      )}
    </div>
  );
}
