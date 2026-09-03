import "server-only";

import { createConceptStore, type DbClient } from "@/lib/db/repositories";
import { ok, type Result } from "@/lib/result";

import type { ExtractedGraph } from "./contracts";
import { computeImportance } from "./importance";
import { normalizeGraph, rawFromExtraction } from "./normalize";
import { validateGraph, type ValidatedGraph } from "./validate";

/**
 * DETERMINISTIC GRAPH CONSTRUCTION + PERSISTENCE.
 *
 *   extraction → normalize → validate → importance → persist
 *
 * Persistence is best-effort and non-fatal: a failed edge write is counted and
 * skipped, never thrown, so a partial graph never blocks lesson creation or
 * corrupts state. Concepts are matched to already-persisted `concepts` rows by
 * the extraction key; edges only persist when BOTH endpoints resolve.
 */

export interface BuildGraphInput {
  db: DbClient;
  userId: string;
  extraction: ExtractedGraph;
  /** extraction concept `key` → persisted `concepts.id` */
  conceptIdByKey: Map<string, string>;
}

export interface BuildGraphResult {
  nodes: number;
  edgesPersisted: number;
  edgesRejected: number;
  edgesFailed: number;
}

/** Pure pipeline stage — exposed for testing without a database. */
export function computeGraph(extraction: ExtractedGraph): {
  validated: ValidatedGraph;
  importance: Map<string, number>;
} {
  const normalized = normalizeGraph(rawFromExtraction(extraction));
  const validated = validateGraph(normalized);
  const importance = computeImportance(validated);
  return { validated, importance };
}

export async function buildAndPersistGraph(
  input: BuildGraphInput,
): Promise<Result<BuildGraphResult>> {
  const concepts = createConceptStore(input.db);
  const normalized = normalizeGraph(rawFromExtraction(input.extraction));
  const validated = validateGraph(normalized);
  const importance = computeImportance(validated);

  // normalizedKey → persisted concept id (via the extraction key map).
  const idByNormalizedKey = new Map<string, string>();
  for (const [originalKey, conceptId] of input.conceptIdByKey) {
    const nk = normalized.keyMap.get(originalKey);
    if (nk && !idByNormalizedKey.has(nk)) idByNormalizedKey.set(nk, conceptId);
  }

  const degree = new Map<string, number>();
  for (const e of validated.edges) {
    degree.set(e.sourceKey, (degree.get(e.sourceKey) ?? 0) + 1);
    degree.set(e.targetKey, (degree.get(e.targetKey) ?? 0) + 1);
  }

  for (const concept of validated.concepts) {
    const id = idByNormalizedKey.get(concept.normalizedKey);
    if (!id) continue;
    await concepts.updateGraphFields(id, {
      normalizedKey: concept.normalizedKey,
      importanceScore: importance.get(concept.normalizedKey) ?? 0,
      sourcePages: concept.sourcePages,
      graphDegree: degree.get(concept.normalizedKey) ?? 0,
    });
  }

  let edgesPersisted = 0;
  let edgesFailed = 0;
  for (const edge of validated.edges) {
    const sourceId = idByNormalizedKey.get(edge.sourceKey);
    const targetId = idByNormalizedKey.get(edge.targetKey);
    if (!sourceId || !targetId || sourceId === targetId) {
      edgesFailed += 1;
      continue;
    }
    const res = await concepts.addRelationship({
      sourceConceptId: sourceId,
      targetConceptId: targetId,
      relationshipType: edge.type,
      strength: edge.confidence,
      metadata: { origin: "graph-build" },
    });
    if (res.ok) edgesPersisted += 1;
    else edgesFailed += 1;
  }

  return ok({
    nodes: validated.concepts.length,
    edgesPersisted,
    edgesRejected: validated.rejected.length,
    edgesFailed,
  });
}
