import type { Citation, RetrievedChunk } from "@/lib/rag";

/**
 * A clean, UI-ready citation. Extends the RAG {@link Citation} with a short
 * snippet of the source text — never the raw retrieval metadata.
 */
export interface TeachingCitation extends Citation {
  /** A short excerpt (<= 240 chars) of the cited passage. */
  snippet: string;
  /** Cosine similarity to the query, 0–1. */
  relevance: number;
}

const SNIPPET_MAX = 240;

export function toTeachingCitation(match: RetrievedChunk): TeachingCitation {
  const text = match.chunk.content.trim().replace(/\s+/g, " ");
  return {
    ...match.citation,
    snippet:
      text.length > SNIPPET_MAX ? `${text.slice(0, SNIPPET_MAX - 1)}…` : text,
    relevance: Number(match.score.toFixed(3)),
  };
}

export function toTeachingCitations(
  matches: RetrievedChunk[],
): TeachingCitation[] {
  return matches.map(toTeachingCitation);
}

/** Concatenate retrieved passages into a bounded context string for prompts. */
export function buildSourceContextText(
  matches: RetrievedChunk[],
  maxChars = 4000,
): string {
  const parts: string[] = [];
  let used = 0;
  for (const match of matches) {
    const label = match.citation.pageNumber
      ? `[${match.citation.documentName} p.${match.citation.pageNumber}]`
      : `[${match.citation.documentName}]`;
    const block = `${label}\n${match.chunk.content.trim()}`;
    if (used + block.length > maxChars) break;
    parts.push(block);
    used += block.length + 2;
  }
  return parts.join("\n\n");
}
