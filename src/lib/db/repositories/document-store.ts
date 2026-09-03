import type { Json } from "@/lib/db/types";
import { LumenError } from "@/lib/errors";
import { err, ok, type Result } from "@/lib/result";

import type { Tables, TablesInsert } from "../types";
import type { DocumentStatus } from "../enums";
import {
  createDocumentSchema,
  documentChunkInsertSchema,
  matchChunksSchema,
  updateDocumentStatusSchema,
  uuidSchema,
  type CreateDocumentInput,
  type DocumentChunkInsertInput,
  type MatchChunksInput,
} from "../schemas";
import {
  fromPostgrestError,
  listResult,
  parseInput,
  rowResult,
  type DbClient,
} from "./shared";

export type DocumentRow = Tables<"documents">;
export type DocumentChunkRow = Tables<"document_chunks">;

/** A ranked chunk returned by the `match_document_chunks` RPC. */
export interface ChunkMatch {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  pageNumber: number | null;
  sectionTitle: string | null;
  metadata: Json;
  similarity: number;
}

/** Serialise a numeric vector into pgvector's text form: `[0.1,0.2,...]`. */
function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

export interface DocumentStore {
  create(input: CreateDocumentInput): Promise<Result<DocumentRow>>;
  get(documentId: string): Promise<Result<DocumentRow>>;
  listForUser(userId: string): Promise<Result<DocumentRow[]>>;
  updateStatus(input: {
    documentId: string;
    status: DocumentStatus;
    metadata?: Record<string, unknown>;
  }): Promise<Result<DocumentRow>>;
  /** Bulk-insert chunks for one document. Rejects mismatched embedding sizes. */
  insertChunks(
    chunks: DocumentChunkInsertInput[],
    expectedDimensions: number,
  ): Promise<Result<number>>;
  listChunks(documentId: string): Promise<Result<DocumentChunkRow[]>>;
  deleteChunks(documentId: string): Promise<Result<void>>;
  /** RLS-scoped vector similarity search (never crosses users). */
  matchChunks(input: MatchChunksInput): Promise<Result<ChunkMatch[]>>;
}

export function createDocumentStore(db: DbClient): DocumentStore {
  return {
    async create(input) {
      const parsed = parseInput(createDocumentSchema, input);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const payload: TablesInsert<"documents"> = {
        user_id: v.userId,
        title: v.title,
        file_name: v.fileName,
        file_type: v.fileType,
        file_size: v.fileSize ?? null,
        storage_path: v.storagePath ?? null,
        status: v.status,
        metadata: (v.metadata ?? {}) as Json,
      };
      return rowResult(
        await db.from("documents").insert(payload).select("*").single(),
      );
    },

    async get(documentId) {
      const id = parseInput(uuidSchema, documentId);
      if (!id.ok) return id;
      return rowResult(
        await db.from("documents").select("*").eq("id", id.value).maybeSingle(),
      );
    },

    async listForUser(userId) {
      const id = parseInput(uuidSchema, userId);
      if (!id.ok) return id;
      return listResult(
        await db
          .from("documents")
          .select("*")
          .eq("user_id", id.value)
          .order("created_at", { ascending: false }),
      );
    },

    async updateStatus(input) {
      const parsed = parseInput(updateDocumentStatusSchema, input);
      if (!parsed.ok) return parsed;
      const v = parsed.value;

      // Merge metadata rather than replace, when a patch is supplied.
      let mergedMetadata: Json | undefined;
      if (v.metadata) {
        const existing = await db
          .from("documents")
          .select("metadata")
          .eq("id", v.documentId)
          .maybeSingle();
        if (existing.error) return err(fromPostgrestError(existing.error));
        const base =
          existing.data && typeof existing.data.metadata === "object"
            ? (existing.data.metadata as Record<string, unknown>)
            : {};
        mergedMetadata = { ...base, ...v.metadata } as Json;
      }

      return rowResult(
        await db
          .from("documents")
          .update({
            status: v.status,
            ...(mergedMetadata !== undefined && { metadata: mergedMetadata }),
            updated_at: new Date().toISOString(),
          })
          .eq("id", v.documentId)
          .select("*")
          .single(),
      );
    },

    async insertChunks(chunks, expectedDimensions) {
      if (chunks.length === 0) return ok(0);

      const rows: TablesInsert<"document_chunks">[] = [];
      for (const chunk of chunks) {
        const parsed = parseInput(documentChunkInsertSchema, chunk);
        if (!parsed.ok) return parsed;
        const v = parsed.value;
        if (v.embedding.length !== expectedDimensions) {
          return err(
            new LumenError(
              "VALIDATION_FAILED",
              `chunk ${v.chunkIndex} embedding has ${v.embedding.length} dims, expected ${expectedDimensions}`,
              { recoverable: true },
            ),
          );
        }
        rows.push({
          document_id: v.documentId,
          user_id: v.userId,
          content: v.content,
          chunk_index: v.chunkIndex,
          page_number: v.pageNumber ?? null,
          section_title: v.sectionTitle ?? null,
          metadata: (v.metadata ?? {}) as Json,
          embedding: toVectorLiteral(v.embedding),
        });
      }

      const res = await db.from("document_chunks").insert(rows);
      if (res.error) return err(fromPostgrestError(res.error));
      return ok(rows.length);
    },

    async listChunks(documentId) {
      const id = parseInput(uuidSchema, documentId);
      if (!id.ok) return id;
      return listResult(
        await db
          .from("document_chunks")
          .select("*")
          .eq("document_id", id.value)
          .order("chunk_index", { ascending: true }),
      );
    },

    async deleteChunks(documentId) {
      const id = parseInput(uuidSchema, documentId);
      if (!id.ok) return id;
      const res = await db
        .from("document_chunks")
        .delete()
        .eq("document_id", id.value);
      if (res.error) return err(fromPostgrestError(res.error));
      return ok(undefined);
    },

    async matchChunks(input) {
      const parsed = parseInput(matchChunksSchema, input);
      if (!parsed.ok) return parsed;
      const v = parsed.value;

      const res = await db.rpc("match_document_chunks", {
        query_embedding: toVectorLiteral(v.queryEmbedding),
        match_count: v.matchCount,
        similarity_threshold: v.similarityThreshold,
        filter_document_id: v.documentId ?? null,
      });
      if (res.error) return err(fromPostgrestError(res.error));

      const matches: ChunkMatch[] = (res.data ?? []).map((row) => ({
        id: row.id,
        documentId: row.document_id,
        chunkIndex: row.chunk_index,
        content: row.content,
        pageNumber: row.page_number,
        sectionTitle: row.section_title,
        metadata: row.metadata,
        similarity: row.similarity,
      }));
      return ok(matches);
    },
  };
}
