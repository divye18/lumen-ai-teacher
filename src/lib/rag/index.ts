import type { DocumentChunk } from "@/types/document";
import type { Id } from "@/types/common";
import type { Result } from "@/lib/result";

/**
 * Retrieval boundary (pgvector-backed, later phase).
 *
 * Nothing here performs ingestion, chunking, or embedding yet — those are
 * built in the next phase. This is the interface the teaching layer will
 * depend on so retrieval can be swapped or mocked.
 */
export interface RetrievalQuery {
  /** Natural-language query text. */
  text: string;
  /** Restrict to these documents, if set. */
  documentIds?: Id[];
  /** Restrict to chunks tagged with these concept slugs, if set. */
  conceptSlugs?: string[];
  /** Max chunks to return. */
  topK: number;
}

export interface RetrievedChunk {
  chunk: DocumentChunk;
  /** Similarity score, 0–1 (higher is closer). */
  score: number;
}

export interface Retriever {
  readonly id: string;
  retrieve(query: RetrievalQuery): Promise<Result<RetrievedChunk[]>>;
}
