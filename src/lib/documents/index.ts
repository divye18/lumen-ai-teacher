import type { Document, DocumentChunk } from "@/types/document";
import type { Id } from "@/types/common";
import type { Result } from "@/lib/result";

/**
 * Document storage boundary.
 *
 * Ingestion pipeline (parsing, chunking, embedding) is built in the next
 * phase. This interface defines how the rest of the app reads document
 * metadata and chunks.
 */
export interface DocumentStore {
  get(documentId: Id): Promise<Result<Document>>;
  listByOwner(ownerId: Id): Promise<Result<Document[]>>;
  listChunks(documentId: Id): Promise<Result<DocumentChunk[]>>;
}
