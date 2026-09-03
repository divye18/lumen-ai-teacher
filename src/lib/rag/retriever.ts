import "server-only";

import type { EmbeddingProvider } from "@/lib/ai/types";
import {
  createDocumentStore,
  type ChunkMatch,
  type DbClient,
} from "@/lib/db/repositories";
import type { DocumentChunk } from "@/types/document";
import { err, ok, type Result } from "@/lib/result";

import { RetrievalError } from "./errors";
import type {
  Citation,
  RetrievalQuery,
  RetrievedChunk,
  Retriever,
} from "./index";

export interface SupabaseRetrieverDeps {
  /** Request-scoped Supabase client (RLS as the owning user). */
  db: DbClient;
  embeddings: EmbeddingProvider;
  /** The authenticated user id; retrieval never crosses this boundary. */
  userId: string;
}

function toDocumentChunk(match: ChunkMatch): DocumentChunk {
  return {
    id: match.id,
    documentId: match.documentId,
    index: match.chunkIndex,
    content: match.content,
    tokenCount: Math.ceil(match.content.length / 4),
    conceptSlugs: [],
  };
}

function toCitation(match: ChunkMatch, documentName: string): Citation {
  return {
    documentId: match.documentId,
    documentName,
    chunkId: match.id,
    chunkIndex: match.chunkIndex,
    pageNumber: match.pageNumber,
    sectionTitle: match.sectionTitle,
  };
}

export function createSupabaseRetriever(
  deps: SupabaseRetrieverDeps,
): Retriever {
  const documents = createDocumentStore(deps.db);

  return {
    id: `supabase-pgvector:${deps.embeddings.id}`,

    async retrieve(query: RetrievalQuery): Promise<Result<RetrievedChunk[]>> {
      if (query.userId !== deps.userId) {
        return err(
          new RetrievalError("query user does not match the retriever owner"),
        );
      }
      const text = query.text.trim();
      if (text.length === 0) {
        return err(new RetrievalError("query text is empty"));
      }

      const embedResult = await deps.embeddings.embed({ input: [text] });
      if (!embedResult.ok) return embedResult;
      const vector = embedResult.value.vectors[0];
      if (!vector) {
        return err(new RetrievalError("embedding provider returned no vector"));
      }

      const documentId =
        query.documentId ?? query.documentIds?.[0] ?? undefined;

      const matched = await documents.matchChunks({
        queryEmbedding: vector,
        matchCount: query.topK,
        similarityThreshold: query.similarityThreshold ?? 0,
        documentId: documentId ?? null,
      });
      if (!matched.ok) return matched;

      const names = new Map<string, string>();
      if (matched.value.length > 0) {
        const docs = await documents.listForUser(deps.userId);
        if (docs.ok) {
          for (const doc of docs.value) names.set(doc.id, doc.title);
        }
      }

      const results: RetrievedChunk[] = matched.value.map((match) => ({
        chunk: toDocumentChunk(match),
        score: match.similarity,
        citation: toCitation(
          match,
          names.get(match.documentId) ?? "Unknown document",
        ),
      }));

      return ok(results);
    },
  };
}
