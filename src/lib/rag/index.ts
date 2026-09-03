import type { DocumentChunk } from "@/types/document";
import type { Id } from "@/types/common";
import type { Result } from "@/lib/result";

/**
 * Retrieval boundary.
 *
 * The teaching layer depends on {@link Retriever}, never on the vector store or
 * an embedding SDK. The Supabase-backed implementation lives in
 * `./retriever`; ingestion lives in `./ingest`.
 */
export interface RetrievalQuery {
  /** The learner whose documents may be searched. Ownership is enforced. */
  userId: Id;
  /** Natural-language query text. */
  text: string;
  /** Restrict to a single document. */
  documentId?: Id;
  /** Restrict to these documents (kept for compatibility; `documentId` wins). */
  documentIds?: Id[];
  /** Restrict to chunks tagged with these concept slugs, if set. */
  conceptSlugs?: string[];
  /** Max chunks to return. */
  topK: number;
  /** Drop results below this cosine similarity (0–1). */
  similarityThreshold?: number;
}

/** Everything the teacher needs to cite a retrieved passage. */
export interface Citation {
  documentId: Id;
  documentName: string;
  chunkId: Id;
  chunkIndex: number;
  /** 1-based page number, or null when the extractor could not determine one. */
  pageNumber: number | null;
  sectionTitle: string | null;
}

export interface RetrievedChunk {
  chunk: DocumentChunk;
  /** Cosine similarity, 0–1 (higher is closer). */
  score: number;
  citation: Citation;
}

export interface Retriever {
  readonly id: string;
  retrieve(query: RetrievalQuery): Promise<Result<RetrievedChunk[]>>;
}

export {
  chunkText,
  normalizeText,
  chunkOptionsSchema,
  DEFAULT_CHUNK_OPTIONS,
  type Chunk,
  type ChunkOptions,
} from "./chunking";
export {
  extractPdfText,
  assertPdfBytes,
  isPdfMimeType,
  sanitizePdfFilename,
  PDF_MIME_TYPE,
  type ExtractedPdf,
  type ExtractedPage,
} from "./pdf";
export {
  ingestPdf,
  ingestPdfRequestSchema,
  type IngestPdfInput,
  type IngestResult,
} from "./ingest";
export { createSupabaseRetriever } from "./retriever";
export {
  retrievalRequestSchema,
  type RetrievalRequest,
} from "./retrieval-request";
export * from "./errors";
