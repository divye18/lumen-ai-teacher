import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CurriculumNodeGrid } from "@/components/curriculum/curriculum-node-grid";
import { CurriculumPageTransition } from "@/components/curriculum/curriculum-page-transition";
import { EmptyState } from "@/components/ui/states";
import { requireUser } from "@/lib/auth/current-user";
import { createCurriculumStore } from "@/lib/db/repositories";
import { getSupabaseServerClient } from "@/lib/db/server";
import { getNcertClassLevel, nodeSlug } from "@/lib/curriculum/ncert-browser";

export const metadata: Metadata = { title: "Choose your class" };
export const dynamic = "force-dynamic";

export default async function CurriculumClassPage() {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);
  if (!user.ok) redirect("/login?next=/learn/c");

  const store = createCurriculumStore(supabase);
  const level = await getNcertClassLevel(store, user.value.id);

  const classes = level.ok ? level.value.classes : [];

  return (
    <CurriculumPageTransition className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">
          Choose your class
        </h1>
        <p className="mt-1 text-[13px] text-[var(--color-ink-muted)]">
          Browse the NCERT curriculum, starting with your class.
        </p>
      </header>

      {classes.length === 0 ? (
        <EmptyState
          title="No curriculum available yet"
          description="The NCERT curriculum hasn't been added yet. Check back soon."
        />
      ) : (
        <CurriculumNodeGrid
          items={classes.map((c) => ({
            id: c.id,
            title: c.title,
            href: `/learn/c/${nodeSlug(c)}`,
          }))}
        />
      )}
    </CurriculumPageTransition>
  );
}
