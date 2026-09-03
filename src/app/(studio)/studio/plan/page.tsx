import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PlanSetup } from "@/components/plan/plan-setup";
import { requireUser } from "@/lib/auth/current-user";
import { createDocumentStore } from "@/lib/db/repositories";
import { getSupabaseServerClient } from "@/lib/db/server";

export const metadata: Metadata = { title: "Plan a lesson" };
export const dynamic = "force-dynamic";

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string; documentId?: string }>;
}) {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);
  if (!user.ok) redirect("/login?next=/studio/plan");

  const params = await searchParams;
  const docRes = await createDocumentStore(supabase).listForUser(user.value.id);
  const documents = (docRes.ok ? docRes.value : []).map((d) => ({
    id: d.id,
    title: d.title,
    status: d.status,
  }));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Plan a lesson</h1>
        <p className="mt-1 text-[13px] text-[var(--color-ink-muted)]">
          Tell Lumen what to teach. It builds the concept chain, decides the
          order, and picks where to check your understanding.
        </p>
      </header>

      <PlanSetup
        documents={documents}
        initialTopic={params.topic ?? ""}
        initialDocumentId={params.documentId ?? null}
      />
    </div>
  );
}
