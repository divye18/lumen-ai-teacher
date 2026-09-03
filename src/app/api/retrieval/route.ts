import { serverConfig } from "@/config/server";
import { getEmbeddingProviderFromConfig } from "@/lib/ai/embedding";
import { jsonError, jsonOk } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/current-user";
import { getSupabaseServerClient } from "@/lib/db/server";
import { ValidationError } from "@/lib/errors";
import { createSupabaseRetriever, retrievalRequestSchema } from "@/lib/rag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/retrieval
 *
 * JSON body: { query, documentId?, topK?, similarityThreshold? }
 *
 * Returns ranked chunks from the authenticated user's own documents only.
 * Cross-user retrieval is impossible: the RPC runs under the caller's RLS.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await getSupabaseServerClient();
    const user = await requireUser(supabase);
    if (!user.ok) return jsonError(user.error);

    const body: unknown = await request.json().catch(() => null);
    const parsed = retrievalRequestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(
        new ValidationError("invalid retrieval request", parsed.error.issues),
      );
    }

    const embeddings = getEmbeddingProviderFromConfig();
    if (!embeddings.ok) return jsonError(embeddings.error);

    const retriever = createSupabaseRetriever({
      db: supabase,
      embeddings: embeddings.value,
      userId: user.value.id,
    });

    const result = await retriever.retrieve({
      userId: user.value.id,
      text: parsed.data.query,
      documentId: parsed.data.documentId ?? undefined,
      topK: parsed.data.topK,
      similarityThreshold: parsed.data.similarityThreshold,
    });
    if (!result.ok) return jsonError(result.error);

    const matches = result.value.map((r) => ({
      content: r.chunk.content,
      score: r.score,
      documentId: r.citation.documentId,
      documentName: r.citation.documentName,
      chunkId: r.citation.chunkId,
      chunkIndex: r.citation.chunkIndex,
      pageNumber: r.citation.pageNumber,
      sectionTitle: r.citation.sectionTitle,
    }));

    return jsonOk({
      query: parsed.data.query,
      count: matches.length,
      embeddingModel: serverConfig.ai.embedding.model,
      matches,
    });
  } catch (error) {
    return jsonError(error);
  }
}
