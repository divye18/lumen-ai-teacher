import { z } from "zod";

/**
 * Deterministic, LLM-free text chunking.
 *
 * Guarantees:
 * - Same input + options → byte-identical output (pure, no randomness, no I/O).
 * - `index` values are contiguous starting at 0 and follow document order.
 * - No chunk exceeds `chunkSize` by more than one sentence/hard-cut tail.
 * - Tiny trailing fragments are merged into their predecessor.
 * - Paragraph and heading structure is respected before falling back to hard
 *   character cuts.
 *
 * All sizes are in characters (no tokenizer dependency). `estimatedTokens` is
 * a coarse `ceil(chars / 4)` approximation for context-budget accounting only.
 */

export interface ChunkOptions {
  /** Target maximum chunk length in characters. */
  chunkSize: number;
  /** Characters of trailing context copied from the previous chunk. */
  chunkOverlap: number;
  /** Chunks shorter than this are merged into the previous chunk. */
  minChunkSize: number;
}

export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = {
  chunkSize: 1000,
  chunkOverlap: 150,
  minChunkSize: 120,
};

export const chunkOptionsSchema = z
  .object({
    chunkSize: z.number().int().min(200).max(8000),
    chunkOverlap: z.number().int().min(0).max(2000),
    minChunkSize: z.number().int().min(0).max(4000),
  })
  .refine((o) => o.chunkOverlap < o.chunkSize, {
    message: "chunkOverlap must be smaller than chunkSize",
    path: ["chunkOverlap"],
  })
  .refine((o) => o.minChunkSize <= o.chunkSize, {
    message: "minChunkSize must not exceed chunkSize",
    path: ["minChunkSize"],
  });

export interface Chunk {
  index: number;
  content: string;
  /** Nearest preceding heading, if the source had detectable headings. */
  sectionTitle: string | null;
  /** Character offset of the chunk's core content within the normalized text. */
  charStart: number;
  charEnd: number;
  /** Characters prepended as overlap from the previous chunk (0 for the first). */
  overlapChars: number;
  estimatedTokens: number;
}

const MARKDOWN_HEADING_RE = /^#{1,6}\s+\S/;
const NUMBERED_HEADING_RE = /^\d+(?:\.\d+)*\.?\s+\p{Lu}/u;
const TERMINAL_PUNCT_RE = /[.:;,!?]$/;

/**
 * Normalize raw extracted text. Idempotent: `normalizeText(normalizeText(x))`
 * equals `normalizeText(x)`.
 */
export function normalizeText(raw: string): string {
  let s = raw.normalize("NFC");
  s = s.replace(/\r\n?/g, "\n");
  // Strip C0/C1 control characters, keeping tab and newline.
  s = s.replace(/\p{Cc}/gu, (c) => (c === "\n" || c === "\t" ? c : ""));
  // De-hyphenate words split across a line break: "compre-\nhension".
  s = s.replace(/(\p{L})-\n(\p{L})/gu, "$1$2");
  // Collapse horizontal whitespace.
  s = s.replace(/[^\S\n]+/g, " ");
  s = s
    .split("\n")
    .map((line) => line.trim())
    .join("\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

function isHeadingLine(line: string): boolean {
  if (line.length === 0 || line.length > 80) return false;
  if (MARKDOWN_HEADING_RE.test(line) || NUMBERED_HEADING_RE.test(line)) {
    return true;
  }
  // A short, unpunctuated, capitalised line with few words reads as a heading.
  if (line.length > 60) return false;
  if (TERMINAL_PUNCT_RE.test(line)) return false;
  if (!/^[\p{Lu}\p{N}]/u.test(line)) return false;
  return line.split(/\s+/).length <= 8;
}

function stripHeadingMarkup(line: string): string {
  return line.replace(/^#{1,6}\s+/, "").trim();
}

interface Block {
  text: string;
  sectionTitle: string | null;
  start: number;
  end: number;
}

/** Split normalized text into paragraph blocks, tracking heading context. */
function splitIntoBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let currentSection: string | null = null;
  let cursor = 0;

  const paragraphs = text.split(/\n{2,}/);
  for (const paragraph of paragraphs) {
    const start = text.indexOf(paragraph, cursor);
    const end = start + paragraph.length;
    cursor = end;

    const lines = paragraph.split("\n");
    if (lines.length === 1 && isHeadingLine(lines[0])) {
      currentSection = stripHeadingMarkup(lines[0]);
      continue;
    }

    let bodyLines = lines;
    if (lines.length > 1 && isHeadingLine(lines[0])) {
      currentSection = stripHeadingMarkup(lines[0]);
      bodyLines = lines.slice(1);
    }

    const body = bodyLines.join(" ").replace(/\s+/g, " ").trim();
    if (body.length === 0) continue;

    blocks.push({ text: body, sectionTitle: currentSection, start, end });
  }

  return blocks;
}

/** Sentence-aware then hard-character split for an oversized block. */
function hardSplit(text: string, chunkSize: number): string[] {
  const pieces: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  let buffer = "";

  const flush = () => {
    if (buffer.trim().length > 0) pieces.push(buffer.trim());
    buffer = "";
  };

  for (const sentence of sentences) {
    if (sentence.length > chunkSize) {
      flush();
      for (let i = 0; i < sentence.length; i += chunkSize) {
        pieces.push(sentence.slice(i, i + chunkSize));
      }
      continue;
    }
    if (buffer.length + sentence.length + 1 > chunkSize) flush();
    buffer = buffer.length === 0 ? sentence : `${buffer} ${sentence}`;
  }
  flush();
  return pieces;
}

interface CoreChunk {
  content: string;
  sectionTitle: string | null;
  charStart: number;
  charEnd: number;
}

function packBlocks(blocks: Block[], opts: ChunkOptions): CoreChunk[] {
  const chunks: CoreChunk[] = [];
  let buf: {
    parts: string[];
    section: string | null;
    start: number;
    end: number;
  } | null = null;

  const flush = () => {
    if (!buf) return;
    chunks.push({
      content: buf.parts.join("\n\n"),
      sectionTitle: buf.section,
      charStart: buf.start,
      charEnd: buf.end,
    });
    buf = null;
  };

  for (const block of blocks) {
    if (block.text.length > opts.chunkSize) {
      flush();
      const pieces = hardSplit(block.text, opts.chunkSize);
      const span = block.end - block.start;
      pieces.forEach((piece, i) => {
        chunks.push({
          content: piece,
          sectionTitle: block.sectionTitle,
          charStart: block.start + Math.round((span * i) / pieces.length),
          charEnd: block.start + Math.round((span * (i + 1)) / pieces.length),
        });
      });
      continue;
    }

    if (!buf) {
      buf = {
        parts: [block.text],
        section: block.sectionTitle,
        start: block.start,
        end: block.end,
      };
      continue;
    }

    const projected = buf.parts.join("\n\n").length + 2 + block.text.length;
    if (projected > opts.chunkSize) {
      flush();
      buf = {
        parts: [block.text],
        section: block.sectionTitle,
        start: block.start,
        end: block.end,
      };
    } else {
      buf.parts.push(block.text);
      buf.end = block.end;
    }
  }
  flush();
  return chunks;
}

/**
 * Merge any chunk shorter than `minChunkSize` into a neighbour — but never if
 * that would push the combined chunk past `chunkSize`. A fragment that cannot
 * be merged without overflow is kept standalone (a small chunk beats an
 * oversized one).
 */
function mergeTiny(
  chunks: CoreChunk[],
  minChunkSize: number,
  chunkSize: number,
): CoreChunk[] {
  if (chunks.length <= 1) return chunks;

  const fits = (a: string, b: string) => a.length + 2 + b.length <= chunkSize;

  const merged: CoreChunk[] = [];
  for (const chunk of chunks) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      chunk.content.length < minChunkSize &&
      fits(prev.content, chunk.content)
    ) {
      prev.content = `${prev.content}\n\n${chunk.content}`;
      prev.charEnd = chunk.charEnd;
    } else {
      merged.push({ ...chunk });
    }
  }

  // A small leading chunk can survive the forward pass; fold it forward if it fits.
  if (
    merged.length > 1 &&
    merged[0].content.length < minChunkSize &&
    fits(merged[0].content, merged[1].content)
  ) {
    merged[1].content = `${merged[0].content}\n\n${merged[1].content}`;
    merged[1].charStart = merged[0].charStart;
    merged.shift();
  }
  return merged;
}

function overlapPrefix(previous: string, overlap: number): string {
  if (overlap <= 0 || previous.length === 0) return "";
  const slice = previous.slice(Math.max(0, previous.length - overlap));
  const boundary = slice.search(/\s\S/);
  return boundary >= 0 ? slice.slice(boundary + 1) : slice;
}

/** Chunk normalized-or-raw text into deterministic, ordered {@link Chunk}s. */
export function chunkText(
  text: string,
  options: Partial<ChunkOptions> = {},
): Chunk[] {
  const opts: ChunkOptions = { ...DEFAULT_CHUNK_OPTIONS, ...options };
  const normalized = normalizeText(text);
  if (normalized.length === 0) return [];

  const core = mergeTiny(
    packBlocks(splitIntoBlocks(normalized), opts),
    opts.minChunkSize,
    opts.chunkSize,
  );

  return core.map((chunk, index) => {
    const prefix =
      index === 0
        ? ""
        : overlapPrefix(core[index - 1].content, opts.chunkOverlap);
    const content =
      prefix.length > 0 ? `${prefix} ${chunk.content}` : chunk.content;
    return {
      index,
      content,
      sectionTitle: chunk.sectionTitle,
      charStart: chunk.charStart,
      charEnd: chunk.charEnd,
      overlapChars: prefix.length,
      estimatedTokens: Math.ceil(content.length / 4),
    };
  });
}
