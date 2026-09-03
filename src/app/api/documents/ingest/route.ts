import { serverConfig } from "@/config/server";
import { getEmbeddingProviderFromConfig } from "@/lib/ai/embedding";
import { jsonError, jsonOk } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/current-user";
import { getSupabaseServerClient } from "@/lib/db/server";
import { ValidationError } from "@/lib/errors";
import { DocumentTooLargeError, ingestPdf } from "@/lib/rag";

/** unpdf needs the Node runtime; ingestion must never be statically cached. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/documents/ingest
 *
 * multipart/form-data:
 *   file   — the PDF (required)
 *   title  — optional display title
 *
 * Ownership is the authenticated user. Secrets stay server-side.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await getSupabaseServerClient();
    const user = await requireUser(supabase);
    if (!user.ok) return jsonError(user.error);

    const maxBytes = serverConfig.rag.maxPdfBytes;

    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > maxBytes * 1.1) {
      return jsonError(new DocumentTooLargeError(contentLength, maxBytes));
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return jsonError(
        new ValidationError("expected multipart/form-data with a 'file' field"),
      );
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return jsonError(new ValidationError("form field 'file' is required"));
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      return jsonError(new DocumentTooLargeError(bytes.byteLength, maxBytes));
    }

    const embeddings = getEmbeddingProviderFromConfig();
    if (!embeddings.ok) return jsonError(embeddings.error);

    const titleField = form.get("title");
    const title =
      typeof titleField === "string" && titleField.trim().length > 0
        ? titleField.trim()
        : undefined;

    const result = await ingestPdf({
      db: supabase,
      embeddings: embeddings.value,
      embeddingDimensions: serverConfig.ai.embedding.dimensions,
      userId: user.value.id,
      fileName: file.name,
      mimeType: file.type || null,
      bytes,
      title,
      maxBytes,
      chunkOptions: {
        chunkSize: serverConfig.rag.chunkSize,
        chunkOverlap: serverConfig.rag.chunkOverlap,
        minChunkSize: serverConfig.rag.minChunkSize,
      },
    });
    if (!result.ok) return jsonError(result.error);

    return jsonOk({ document: result.value }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
