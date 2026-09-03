import { describe, expect, it } from "vitest";

import { chunkText, normalizeText } from "./chunking";

const PROSE = [
  "Introduction",
  "",
  "Computer memory is organised into a hierarchy. Registers are the fastest and smallest.",
  "Cache sits between the CPU and main memory, holding recently used data so the processor",
  "does not have to wait for slower RAM on every access.",
  "",
  "Main Memory",
  "",
  "RAM is volatile: its contents are lost when power is removed. It is byte addressable and",
  "much larger than cache, but also much slower to reach from the processor core.",
].join("\n");

describe("normalizeText", () => {
  it("is idempotent", () => {
    const once = normalizeText(PROSE);
    expect(normalizeText(once)).toBe(once);
  });

  it("normalises CRLF, collapses whitespace, and de-hyphenates line breaks", () => {
    const out = normalizeText("compre-\nhension\tis   key\r\n\r\n\r\nnext");
    expect(out).toBe("comprehension is key\n\nnext");
  });

  it("returns an empty string for whitespace-only input", () => {
    expect(normalizeText("   \n\n \t ")).toBe("");
  });
});

describe("chunkText", () => {
  it("returns [] for empty input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n  ")).toEqual([]);
  });

  it("is deterministic across repeated calls", () => {
    const a = chunkText(PROSE, { chunkSize: 240, chunkOverlap: 40 });
    const b = chunkText(PROSE, { chunkSize: 240, chunkOverlap: 40 });
    expect(a).toEqual(b);
  });

  it("produces contiguous zero-based indices in document order", () => {
    const chunks = chunkText(PROSE, { chunkSize: 200, chunkOverlap: 30 });
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk, i) => expect(chunk.index).toBe(i));
  });

  it("keeps core content within chunkSize (overlap excluded)", () => {
    const size = 200;
    const chunks = chunkText(PROSE, { chunkSize: size, chunkOverlap: 0 });
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(size + 1);
    }
  });

  it("prepends bounded overlap from the previous chunk", () => {
    const overlap = 40;
    const chunks = chunkText(PROSE, { chunkSize: 200, chunkOverlap: overlap });
    expect(chunks[0].overlapChars).toBe(0);
    for (let i = 1; i < chunks.length; i += 1) {
      expect(chunks[i].overlapChars).toBeGreaterThan(0);
      expect(chunks[i].overlapChars).toBeLessThanOrEqual(overlap);
      const prefix = chunks[i].content.slice(0, chunks[i].overlapChars);
      expect(chunks[i - 1].content.endsWith(prefix.trim())).toBe(true);
    }
  });

  it("merges a tiny trailing fragment into its predecessor", () => {
    const text = `${"A sentence about memory. ".repeat(12)}\n\ntiny`;
    const chunks = chunkText(text, {
      chunkSize: 200,
      chunkOverlap: 0,
      minChunkSize: 40,
    });
    expect(chunks.every((c) => c.content.length >= 40)).toBe(true);
    expect(chunks[chunks.length - 1].content).toContain("tiny");
  });

  it("hard-splits a single oversized paragraph", () => {
    const huge = `${"word ".repeat(400)}`.trim();
    const chunks = chunkText(huge, { chunkSize: 300, chunkOverlap: 0 });
    expect(chunks.length).toBeGreaterThan(3);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(301);
    }
  });

  it("captures heading context as sectionTitle", () => {
    const chunks = chunkText(PROSE, { chunkSize: 200, chunkOverlap: 0 });
    const sections = new Set(chunks.map((c) => c.sectionTitle));
    expect(sections.has("Introduction")).toBe(true);
    expect(sections.has("Main Memory")).toBe(true);
  });

  it("estimates a token count proportional to length", () => {
    const [chunk] = chunkText("Hello world, this is a memory lesson.");
    expect(chunk.estimatedTokens).toBe(Math.ceil(chunk.content.length / 4));
  });
});
