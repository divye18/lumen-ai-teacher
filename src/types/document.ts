import type { Id, ISODateTime, LanguageTag } from "./common";

export type DocumentSourceKind = "upload" | "url" | "pasted-text";

export type DocumentStatus = "pending" | "processing" | "ready" | "failed";

/**
 * A source document a learner brings to Lumen (textbook chapter, notes, PDF).
 * Ingestion and chunking are implemented in a later phase.
 */
export interface Document {
  id: Id;
  ownerId: Id;
  title: string;
  sourceKind: DocumentSourceKind;
  /** Original filename or URL, for display and provenance. */
  sourceRef: string;
  mimeType: string;
  language: LanguageTag;
  status: DocumentStatus;
  /** Populated when `status === "failed"`. */
  error?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/**
 * A retrievable slice of a {@link Document}. `embedding` is stored in pgvector
 * and is not always hydrated on read.
 */
export interface DocumentChunk {
  id: Id;
  documentId: Id;
  /** Ordinal position within the document. */
  index: number;
  content: string;
  /** Token count of `content`, for context-budget accounting. */
  tokenCount: number;
  /** Vector embedding; length depends on the embedding model. */
  embedding?: number[];
  /** Concept slugs this chunk was tagged against, if any. */
  conceptSlugs: string[];
}
