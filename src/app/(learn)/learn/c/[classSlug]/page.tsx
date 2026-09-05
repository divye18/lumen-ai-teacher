import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { CurriculumBreadcrumbs } from "@/components/curriculum/curriculum-breadcrumbs";
import { CurriculumNodeGrid } from "@/components/curriculum/curriculum-node-grid";
import { EmptyState } from "@/components/ui/states";
import { requireUser } from "@/lib/auth/current-user";
import { createCurriculumStore } from "@/lib/db/repositories";
import { getSupabaseServerClient } from "@/lib/db/server";
import { getNcertSubjectLevel, nodeSlug } from "@/lib/curriculum/ncert-browser";

export const metadata: Metadata = { title: "Choose your subject" };
export const dynamic = "force-dynamic";

export default async function CurriculumSubjectPage({
  params,
}: {
  params: Promise<{ classSlug: string }>;
}) {
  const { classSlug } = await params;
  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);
  if (!user.ok) redirect(`/login?next=/learn/c/${classSlug}`);

  const store = createCurriculumStore(supabase);
  const level = await getNcertSubjectLevel(store, user.value.id, classSlug);
  if (!level.ok || !level.value) notFound();

  const { classNode, subjects } = level.value;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <CurriculumBreadcrumbs
        items={[
          { label: "Classes", href: "/learn/c" },
          { label: classNode.title },
        ]}
      />

      <header>
        <h1 className="text-xl font-semibold tracking-tight">
          {classNode.title}
        </h1>
        <p className="mt-1 text-[13px] text-[var(--color-ink-muted)]">
          Choose a subject to explore its chapters.
        </p>
      </header>

      {subjects.length === 0 ? (
        <EmptyState
          title="No subjects available yet"
          description="This class doesn't have any subjects yet."
        />
      ) : (
        <CurriculumNodeGrid
          items={subjects.map((s) => ({
            id: s.id,
            title: s.title,
            href: `/learn/c/${classSlug}/${nodeSlug(s)}`,
          }))}
        />
      )}
    </div>
  );
}
