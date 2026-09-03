import type { ConceptRelationshipType } from "@/lib/db/enums";

import type {
  NormalizedConcept,
  NormalizedEdge,
  NormalizedGraph,
} from "./normalize";

/**
 * DETERMINISTIC GRAPH VALIDATION.
 *
 * Runs after normalization and before persistence. Guarantees:
 *   - no self-edges (already handled upstream, re-checked)
 *   - no dangling edges (endpoint not a concept)
 *   - acyclic ordering edges: PREREQUISITE / DEPENDS_ON / PART_OF must form a
 *     DAG. When a cycle is found, the lowest-confidence edge on it is dropped
 *     (ties broken deterministically) and the check re-runs.
 *
 * Everything the model got wrong is reported in `rejected`, never silently
 * corrupts the graph.
 */

/** Edge types that impose a "must come before" ordering and must stay acyclic. */
export const ORDERING_EDGE_TYPES: readonly ConceptRelationshipType[] = [
  "PREREQUISITE",
  "DEPENDS_ON",
  "PART_OF",
];
const ORDERING = new Set<ConceptRelationshipType>(ORDERING_EDGE_TYPES);

export interface RejectedEdge {
  edge: NormalizedEdge;
  reason: "self-edge" | "dangling" | "cycle";
}

export interface ValidatedGraph {
  concepts: NormalizedConcept[];
  edges: NormalizedEdge[];
  rejected: RejectedEdge[];
  /** normalizedKey → 0-based prerequisite depth (longest path from a root). */
  depthByKey: Map<string, number>;
}

function findCycleEdge(edges: NormalizedEdge[]): NormalizedEdge[] | null {
  const adjacency = new Map<string, NormalizedEdge[]>();
  for (const e of edges) {
    const list = adjacency.get(e.sourceKey) ?? [];
    list.push(e);
    adjacency.set(e.sourceKey, list);
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const colour = new Map<string, number>();
  const stack: NormalizedEdge[] = [];

  const nodes = [
    ...new Set(edges.flatMap((e) => [e.sourceKey, e.targetKey])),
  ].sort();

  function dfs(node: string): NormalizedEdge[] | null {
    colour.set(node, GRAY);
    for (const edge of (adjacency.get(node) ?? []).sort((a, b) =>
      a.targetKey < b.targetKey ? -1 : 1,
    )) {
      stack.push(edge);
      const c = colour.get(edge.targetKey) ?? WHITE;
      if (c === GRAY) {
        // Found a back-edge — the cycle is the stack tail from the matching node.
        const start = stack.findIndex((s) => s.sourceKey === edge.targetKey);
        return stack.slice(start === -1 ? 0 : start);
      }
      if (c === WHITE) {
        const found = dfs(edge.targetKey);
        if (found) return found;
      }
      stack.pop();
    }
    colour.set(node, BLACK);
    return null;
  }

  for (const node of nodes) {
    if ((colour.get(node) ?? WHITE) === WHITE) {
      const cycle = dfs(node);
      if (cycle) return cycle;
      stack.length = 0;
    }
  }
  return null;
}

function computeDepths(
  concepts: NormalizedConcept[],
  orderingEdges: NormalizedEdge[],
): Map<string, number> {
  const incoming = new Map<string, NormalizedEdge[]>();
  for (const c of concepts) incoming.set(c.normalizedKey, []);
  for (const e of orderingEdges) {
    incoming.get(e.targetKey)?.push(e);
  }

  const depth = new Map<string, number>();
  const visiting = new Set<string>();

  function resolve(key: string): number {
    const cached = depth.get(key);
    if (cached !== undefined) return cached;
    if (visiting.has(key)) return 0; // guard (graph is a DAG here anyway)
    visiting.add(key);
    let d = 0;
    for (const edge of incoming.get(key) ?? []) {
      d = Math.max(d, resolve(edge.sourceKey) + 1);
    }
    visiting.delete(key);
    depth.set(key, d);
    return d;
  }

  for (const c of concepts) resolve(c.normalizedKey);
  return depth;
}

export function validateGraph(graph: NormalizedGraph): ValidatedGraph {
  const known = new Set(graph.concepts.map((c) => c.normalizedKey));
  const rejected: RejectedEdge[] = [];
  let edges: NormalizedEdge[] = [];

  for (const edge of graph.edges) {
    if (edge.sourceKey === edge.targetKey) {
      rejected.push({ edge, reason: "self-edge" });
      continue;
    }
    if (!known.has(edge.sourceKey) || !known.has(edge.targetKey)) {
      rejected.push({ edge, reason: "dangling" });
      continue;
    }
    edges.push(edge);
  }

  // Break cycles among ordering edges.
  for (let guard = 0; guard < 64; guard += 1) {
    const orderingEdges = edges.filter((e) => ORDERING.has(e.type));
    const cycle = findCycleEdge(orderingEdges);
    if (!cycle) break;
    // Drop the weakest edge on the cycle (deterministic tie-break by endpoints).
    const victim = [...cycle].sort((a, b) => {
      if (a.confidence !== b.confidence) return a.confidence - b.confidence;
      const ak = `${a.sourceKey} ${a.targetKey} ${a.type}`;
      const bk = `${b.sourceKey} ${b.targetKey} ${b.type}`;
      return ak < bk ? -1 : 1;
    })[0];
    edges = edges.filter((e) => e !== victim);
    rejected.push({ edge: victim, reason: "cycle" });
  }

  const depthByKey = computeDepths(
    graph.concepts,
    edges.filter((e) => ORDERING.has(e.type)),
  );

  return { concepts: graph.concepts, edges, rejected, depthByKey };
}
