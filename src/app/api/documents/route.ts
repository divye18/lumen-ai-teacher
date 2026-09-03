import { jsonError, jsonOk } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/current-user";
import { createDocumentStore } from "@/lib/db/repositories";
import { getSupabaseServerClient } from "@/lib/db/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/documents — the authenticated user's uploaded materials. */
export async function GET(): Promise<Response> {
  try {
    const supabase = await getSupabaseServerClient();
    const user = await requireUser(supabase);
    if (!user.ok) return jsonError(user.error);

    const store = createDocumentStore(supabase);
    const result = await store.listForUser(user.value.id);
    if (!result.ok) return jsonError(result.error);

    const documents = result.value.map((d) => {
      const meta = (d.metadata as Record<string, unknown> | null) ?? {};
      const num = (v: unknown) =>
        typeof v === "number" && Number.isFinite(v) ? v : null;
      return {
        id: d.id,
        title: d.title,
        fileName: d.file_name,
        fileType: d.file_type,
        fileSize: d.file_size,
        status: d.status,
        pageCount: num(meta.totalPages),
        chunkCount: num(meta.chunkCount),
        createdAt: d.created_at,
      };
    });

    return jsonOk({ documents });
  } catch (error) {
    return jsonError(error);
  }
}
