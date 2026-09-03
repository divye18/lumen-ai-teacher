import "server-only";

import { z } from "zod";

import type { EmbeddingProvider } from "@/lib/ai/types";
import { createDocumentStore, type DbClient } from "@/lib/db/repositories";
import { uuidSchema } from "@/lib/db/schemas";
import { err, ok, type Result } from "@/lib/result";

import { chunkText, normalizeText, type ChunkOptions } from "./chunking";
import {
  DocumentTooLargeError,
  EmbeddingProviderError,
  EmptyDocumentError,
  UnsupportedDocumentTypeError,
} from "./errors";
import { extractPdfText, isPdfMimeType, sanitizePdfFilename } from "./pdf";

const EMBED_BATCH_SIZE = 96;

export const ingestPdfRequestSchema = z.object({
  userId: uuidSchema,
  fileName: z.string().min(1).max(1024),
  title: z.string().min(1).max(300).optional(),
  mimeType: z.string().max(255).nullish(),
});

export interface IngestPdfInput {
  /** Request-scoped Supabase client (RLS as the owning user). */
  db: DbClient;
  embeddings: EmbeddingProvider;
  /** Expected embedding dimension (must equal the DB `vector(N)` column). */
  embeddingDimensions: number;
  userId: string;
  fileName: string;
  title?: string;
  mimeType?: string | null;
  bytes: Uint8Array;
  maxBytes: number;
  chunkOptions?: Partial<ChunkOptions>;
}

export interface IngestResult {
  documentId: string;
  title: string;
  fileName: string;
  totalPages: number;
  chunkCount: number;
  textLength: number;
  embeddingModel: string;
}

export interface PageSpan {
  page: number;
  start: number;
  end: number;
}

/** Normalize each page and concatenate, tracking each page's char span. Exported for tests. */
export function buildJoinedText(
  pages: { pageNumber: number; text: string }[],
): {
  joined: string;
  spans: PageSpan[];
} {
  const spans: PageSpan[] = [];
  const parts: string[] = [];
  let offset = 0;
  for (const page of pages) {
    const norm = normalizeText(page.text);
    if (norm.length === 0) continue;
    const start = offset;
    parts.push(norm);
    offset += norm.length;
    spans.push({ page: page.pageNumber, start, end: offset });
    offset += 2; // "\n\n" separator
  }
  return { joined: parts.join("\n\n"), spans };
}

/** Map a character offset in the joined text back to a 1-based page. Exported for tests. */
export function pageForOffset(
  spans: PageSpan[],
  charStart: number,
): number | null {
  if (spans.length === 0) return null;
  for (const span of spans) {
    if (charStart >= span.start && charStart < span.end) return span.page;
  }
  return spans[spans.length - 1].page;
}

async function embedInBatches(
  embeddings: EmbeddingProvider,
  inputs: string[],
  expectedDimensions: number,
): Promise<Result<number[][]>> {
  const vectors: number[][] = [];
  for (let i = 0; i < inputs.length; i += EMBED_BATCH_SIZE) {
    const batch = inputs.slice(i, i + EMBED_BATCH_SIZE);
    const res = await embeddings.embed({ input: batch });
    if (!res.ok) return res;
    if (res.value.vectors.length !== batch.length) {
      return err(
        new EmbeddingProviderError(
          `provider returned ${res.value.vectors.length} vectors for ${batch.length} inputs`,
        ),
      );
    }
    if (res.value.dimensions !== expectedDimensions) {
      return err(
        new EmbeddingProviderError(
          `provider dimension ${res.value.dimensions} != configured ${expectedDimensions}`,
        ),
      );
    }
    vectors.push(...res.value.vectors);
  }
  return ok(vectors);
}

/**
 * Ingest a PDF: validate → extract text → deterministic chunk → embed →
 * persist document + chunks. Server-only. All failures are recoverable
 * `Result` errors — nothing throws through the happy path.
 */
export async function ingestPdf(
  input: IngestPdfInput,
): Promise<Result<IngestResult>> {
  const meta = ingestPdfRequestSchema.safeParse({
    userId: input.userId,
    fileName: input.fileName,
    title: input.title,
    mimeType: input.mimeType,
  });
  if (!meta.success) {
    return err(new UnsupportedDocumentTypeError("invalid ingestion request"));
  }

  if (input.bytes.byteLength > input.maxBytes) {
    return err(
      new DocumentTooLargeError(input.bytes.byteLength, input.maxBytes),
    );
  }

  if (input.mimeType && !isPdfMimeType(input.mimeType)) {
    return err(
      new UnsupportedDocumentTypeError(
        `declared type "${input.mimeType}" is not application/pdf`,
      ),
    );
  }

  const fileName = sanitizePdfFilename(input.fileName);
  const title = (input.title?.trim() || fileName.replace(/\.pdf$/i, "")).slice(
    0,
    300,
  );

  const extracted = await extractPdfText(input.bytes);
  if (!extracted.ok) return extracted;

  const { joined, spans } = buildJoinedText(extracted.value.pages);
  if (joined.trim().length === 0) return err(new EmptyDocumentError());

  const chunks = chunkText(joined, input.chunkOptions);
  if (chunks.length === 0) return err(new EmptyDocumentError());

  const embedded = await embedInBatches(
    input.embeddings,
    chunks.map((c) => c.content),
    input.embeddingDimensions,
  );
  if (!embedded.ok) return embedded;

  const documents = createDocumentStore(input.db);

  const created = await documents.create({
    userId: input.userId,
    title,
    fileName,
    fileType: "application/pdf",
    fileSize: input.bytes.byteLength,
    storagePath: null,
    status: "PROCESSING",
    metadata: {
      source: "pdf-upload",
      extractor: "unpdf",
      totalPages: extracted.value.totalPages,
      textLength: extracted.value.textLength,
    },
  });
  if (!created.ok) return created;
  const documentId = created.value.id;

  const chunkRows = chunks.map((chunk, i) => ({
    documentId,
    userId: input.userId,
    content: chunk.content,
    chunkIndex: chunk.index,
    pageNumber: pageForOffset(spans, chunk.charStart),
    sectionTitle: chunk.sectionTitle,
    metadata: {
      charStart: chunk.charStart,
      charEnd: chunk.charEnd,
      overlapChars: chunk.overlapChars,
      estimatedTokens: chunk.estimatedTokens,
    },
    embedding: embedded.value[i],
  }));

  const inserted = await documents.insertChunks(
    chunkRows,
    input.embeddingDimensions,
  );
  if (!inserted.ok) {
    await documents.updateStatus({
      documentId,
      status: "FAILED",
      metadata: { error: inserted.error.message },
    });
    return inserted;
  }

  const finalised = await documents.updateStatus({
    documentId,
    status: "READY",
    metadata: {
      chunkCount: inserted.value,
      embeddingModel: input.embeddings.id,
      embeddingDimensions: input.embeddingDimensions,
      chunkOptions: input.chunkOptions ?? null,
    },
  });
  if (!finalised.ok) return finalised;

  return ok({
    documentId,
    title,
    fileName,
    totalPages: extracted.value.totalPages,
    chunkCount: inserted.value,
    textLength: extracted.value.textLength,
    embeddingModel: input.embeddings.id,
  });
}
