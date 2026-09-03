import type { NormalizedConcept, NormalizedEdge } from "./normalize";
import { ORDERING_EDGE_TYPES } from "./validate";

/**
 * DETERMINISTIC CONCEPT IMPORTANCE.
 *
 * A 0..1 score combining four bounded, explainable signals:
 *   - emphasis    : the raw 1..5 importance from the source / planner
 *   - centrality  : how many other concepts (transitively) depend on this one
 *   - connectivity: total degree in the graph
 *   - foundational: shallow concepts (early prerequisites) matter more
 *
 * No random weights. The same graph always yields the same scores.
 */

const WEIGHTS = {
  emphasis: 0.4,
  centrality: 0.35,
  connectivity: 0.15,
  foundational: 0.1,
} as const;

const ORDERING = new Set(ORDERING_EDGE_TYPES);

function normalise(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(1, Math.max(0, value / max));
}

export interface ImportanceInput {
  concepts: NormalizedConcept[];
  edges: NormalizedEdge[];
  /** normalizedKey → prerequisite depth (from `validateGraph`). */
  depthByKey: Map<string, number>;
}

export function computeImportance(input: ImportanceInput): Map<string, number> {
  const { concepts, edges, depthByKey } = input;
  const keys = concepts.map((c) => c.normalizedKey);

  // Transitive dependents over ordering edges: who needs this concept first?
  const forward = new Map<string, string[]>();
  for (const k of keys) forward.set(k, []);
  for (const e of edges) {
    if (ORDERING.has(e.type)) forward.get(e.sourceKey)?.push(e.targetKey);
  }
  const dependentsCount = new Map<string, number>();
  for (const start of keys) {
    const seen = new Set<string>();
    const queue = [...(forward.get(start) ?? [])];
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next || seen.has(next)) continue;
      seen.add(next);
      queue.push(...(forward.get(next) ?? []));
    }
    dependentsCount.set(start, seen.size);
  }

  const degree = new Map<string, number>();
  for (const k of keys) degree.set(k, 0);
  for (const e of edges) {
    degree.set(e.sourceKey, (degree.get(e.sourceKey) ?? 0) + 1);
    degree.set(e.targetKey, (degree.get(e.targetKey) ?? 0) + 1);
  }

  const maxDependents = Math.max(1, ...dependentsCount.values());
  const maxDegree = Math.max(1, ...degree.values());
  const maxDepth = Math.max(1, ...depthByKey.values());

  const scores = new Map<string, number>();
  for (const c of concepts) {
    const k = c.normalizedKey;
    const emphasis = (c.importance - 1) / 4; // 1..5 → 0..1
    const centrality = normalise(dependentsCount.get(k) ?? 0, maxDependents);
    const connectivity = normalise(degree.get(k) ?? 0, maxDegree);
    // Shallower (more foundational) → closer to 1.
    const foundational = 1 - normalise(depthByKey.get(k) ?? 0, maxDepth);

    const score =
      WEIGHTS.emphasis * emphasis +
      WEIGHTS.centrality * centrality +
      WEIGHTS.connectivity * connectivity +
      WEIGHTS.foundational * foundational;

    scores.set(k, Math.min(1, Math.max(0, Number(score.toFixed(5)))));
  }
  return scores;
}
