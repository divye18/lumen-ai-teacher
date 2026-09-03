import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AddKnowledgePanel } from "@/components/knowledge/add-knowledge-panel";
import { DocumentList } from "@/components/knowledge/document-list";
import { requireUser } from "@/lib/auth/current-user";
import { createDocumentStore } from "@/lib/db/repositories";
import { getSupabaseServerClient } from "@/lib/db/server";
import type { DocumentSummary } from "@/lib/studio/overview";

export const metadata: Metadata = { title: "Knowledge" };
export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);
  if (!user.ok) redirect("/login?next=/studio/knowledge");

  const store = createDocumentStore(supabase);
  const res = await store.listForUser(user.value.id);
  const documents: DocumentSummary[] = (res.ok ? res.value : []).map((d) => {
    const meta = (d.metadata as Record<string, unknown> | null) ?? {};
    const num = (v: unknown) =>
      typeof v === "number" && Number.isFinite(v) ? v : null;
    return {
      id: d.id,
      title: d.title,
      fileName: d.file_name,
      status: d.status,
      pageCount: num(meta.totalPages),
      chunkCount: num(meta.chunkCount),
      createdAt: d.created_at,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Knowledge</h1>
        <p className="mt-1 text-[13px] text-[var(--color-ink-muted)]">
          Lumen teaches from your own material — grounded, cited, never generic.
        </p>
      </header>

      <AddKnowledgePanel />
      <DocumentList documents={documents} />
    </div>
  );
}
