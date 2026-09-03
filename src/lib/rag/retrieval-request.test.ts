import { describe, expect, it } from "vitest";

import { retrievalRequestSchema } from "./retrieval-request";

const DOC = "d0000000-0000-0000-0000-000000000001";

describe("retrievalRequestSchema", () => {
  it("accepts a minimal query and applies defaults", () => {
    const parsed = retrievalRequestSchema.parse({ query: "what is RAM?" });
    expect(parsed.topK).toBe(8);
    expect(parsed.similarityThreshold).toBe(0);
    expect(parsed.documentId).toBeUndefined();
  });

  it("trims and rejects an empty query", () => {
    expect(retrievalRequestSchema.safeParse({ query: "   " }).success).toBe(
      false,
    );
  });

  it("rejects an over-long query", () => {
    expect(
      retrievalRequestSchema.safeParse({ query: "x".repeat(2001) }).success,
    ).toBe(false);
  });

  it("bounds topK", () => {
    expect(
      retrievalRequestSchema.safeParse({ query: "a", topK: 0 }).success,
    ).toBe(false);
    expect(
      retrievalRequestSchema.safeParse({ query: "a", topK: 999 }).success,
    ).toBe(false);
  });

  it("bounds the similarity threshold to 0..1", () => {
    expect(
      retrievalRequestSchema.safeParse({ query: "a", similarityThreshold: 1.5 })
        .success,
    ).toBe(false);
  });

  it("validates documentId as a uuid", () => {
    expect(
      retrievalRequestSchema.safeParse({ query: "a", documentId: DOC }).success,
    ).toBe(true);
    expect(
      retrievalRequestSchema.safeParse({ query: "a", documentId: "nope" })
        .success,
    ).toBe(false);
  });
});
