import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import type { EmbeddingProvider } from "@/lib/ai/types";
import type { DbClient } from "@/lib/db/repositories";

import { EmbeddingProviderError } from "./errors";
import {
  buildJoinedText,
  ingestPdf,
  pageForOffset,
  type IngestPdfInput,
} from "./ingest";

const SAMPLE_PDF = new Uint8Array(
  readFileSync(new URL("./__fixtures__/sample.pdf", import.meta.url)),
);
const USER = "00000000-0000-0000-0000-000000000001";

const embeddingsStub: EmbeddingProvider = {
  id: "stub",
  embed: vi.fn(),
};

function baseInput(over: Partial<IngestPdfInput>): IngestPdfInput {
  return {
    db: null as unknown as DbClient,
    embeddings: embeddingsStub,
    embeddingDimensions: 1536,
    userId: USER,
    fileName: "notes.pdf",
    bytes: SAMPLE_PDF,
    maxBytes: 15_000_000,
    ...over,
  };
}

describe("buildJoinedText / pageForOffset", () => {
  it("tracks per-page character spans", () => {
    const { joined, spans } = buildJoinedText([
      { pageNumber: 1, text: "First page text." },
      { pageNumber: 2, text: "" },
      { pageNumber: 3, text: "Third page text here." },
    ]);
    expect(spans.map((s) => s.page)).toEqual([1, 3]);
    expect(joined.startsWith("First page text.")).toBe(true);
    expect(pageForOffset(spans, 0)).toBe(1);
    expect(pageForOffset(spans, spans[1].start + 2)).toBe(3);
    expect(pageForOffset(spans, 999_999)).toBe(3);
    expect(pageForOffset([], 0)).toBeNull();
  });
});

describe("ingestPdf validation (pre-persistence)", () => {
  it("rejects a file larger than maxBytes", async () => {
    const res = await ingestPdf(baseInput({ maxBytes: 10 }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("DOCUMENT_TOO_LARGE");
  });

  it("rejects a non-PDF declared MIME type", async () => {
    const res = await ingestPdf(baseInput({ mimeType: "image/png" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("UNSUPPORTED_DOCUMENT_TYPE");
  });

  it("rejects bytes that are not a PDF", async () => {
    const res = await ingestPdf(
      baseInput({ bytes: new TextEncoder().encode("hello world") }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("UNSUPPORTED_DOCUMENT_TYPE");
  });

  it("propagates an embedding provider failure without persisting", async () => {
    const failing: EmbeddingProvider = {
      id: "failing",
      embed: vi.fn(async () => ({
        ok: false as const,
        error: new EmbeddingProviderError("boom"),
      })),
    };
    const res = await ingestPdf(baseInput({ embeddings: failing }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("EMBEDDING_ERROR");
  });
});
