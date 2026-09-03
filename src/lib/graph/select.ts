import type { ConceptRelationshipType } from "@/lib/db/enums";

import type { KnowledgeGraphView } from "./read";

/**
 * GRAPH-AWARE TEACHING SIGNALS.
 *
 * Pure. Derives a few bounded signals about the CURRENT concept's position in
 * the knowledge graph so the deterministic policy can be prerequisite-aware
 * without handing pacing decisions to the LLM.
 */

export interface GraphSignalConcept {
  normalizedKey: string;
  title: string;
  masteryPoints: number;
  assessed: boolean;
  importance: number; // 0..1
}

export interface GraphSignalEdge {
  sourceKey: string;
  targetKey: string;
  type: ConceptRelationshipType;
}

export interface GraphTeachingSignal {
  /**
   * True when the current concept is a prerequisite for (or is depended on by)
   * at least one reasonably important downstream concept — i.e. rushing past it
   * now will hurt later.
   */
  currentConceptIsLoadBearing: boolean;
  /** How many concepts (directly) build on the current one. */
  dependentCount: number;
  /**
   * The weakest already-assessed upstream prerequisite of the current concept
   * that is still below a working threshold, if any. Safe, learner-facing.
   */
  weakUpstreamPrerequisite: { title: string; masteryPoints: number } | null;
}

const ORDERING = new Set<ConceptRelationshipType>([
  "PREREQUISITE",
  "DEPENDS_ON",
  "PART_OF",
]);
const WEAK_THRESHOLD = 50;
const LOAD_BEARING_IMPORTANCE = 0.45;

export function buildGraphTeachingSignal(input: {
  concepts: GraphSignalConcept[];
  edges: GraphSignalEdge[];
  currentNormalizedKey: string | null;
}): GraphTeachingSignal {
  const empty: GraphTeachingSignal = {
    currentConceptIsLoadBearing: false,
    dependentCount: 0,
    weakUpstreamPrerequisite: null,
  };
  if (!input.currentNormalizedKey) return empty;

  const byKey = new Map(input.concepts.map((c) => [c.normalizedKey, c]));
  const current = byKey.get(input.currentNormalizedKey);
  if (!current) return empty;

  const ordering = input.edges.filter((e) => ORDERING.has(e.type));

  const dependents = ordering.filter(
    (e) => e.sourceKey === input.currentNormalizedKey,
  );
  const dependentCount = new Set(dependents.map((e) => e.targetKey)).size;
  const currentConceptIsLoadBearing = dependents.some((e) => {
    const target = byKey.get(e.targetKey);
    return (target?.importance ?? 0) >= LOAD_BEARING_IMPORTANCE;
  });

  const upstream = ordering
    .filter((e) => e.targetKey === input.currentNormalizedKey)
    .map((e) => byKey.get(e.sourceKey))
    .filter(
      (c): c is GraphSignalConcept =>
        !!c && c.assessed && c.masteryPoints < WEAK_THRESHOLD,
    )
    .sort((a, b) => a.masteryPoints - b.masteryPoints);

  return {
    currentConceptIsLoadBearing,
    dependentCount,
    weakUpstreamPrerequisite: upstream[0]
      ? { title: upstream[0].title, masteryPoints: upstream[0].masteryPoints }
      : null,
  };
}

/**
 * Derive the teaching signal directly from a `KnowledgeGraphView` and the
 * current lesson concept key. Bridges the read model (node ids) to the pure
 * signal builder (normalized keys).
 */
export function graphSignalFromView(
  view: Pick<KnowledgeGraphView, "nodes" | "edges">,
  currentConceptKey: string | null,
): GraphTeachingSignal {
  const idToKey = new Map(view.nodes.map((n) => [n.id, n.normalizedKey]));
  const currentNode = currentConceptKey
    ? (view.nodes.find((n) => n.conceptKey === currentConceptKey) ?? null)
    : null;
  return buildGraphTeachingSignal({
    concepts: view.nodes.map((n) => ({
      normalizedKey: n.normalizedKey,
      title: n.title,
      masteryPoints: n.masteryPoints,
      assessed: n.assessed,
      importance: n.importance,
    })),
    edges: view.edges.map((e) => ({
      sourceKey: idToKey.get(e.source) ?? e.source,
      targetKey: idToKey.get(e.target) ?? e.target,
      type: e.type,
    })),
    currentNormalizedKey: currentNode?.normalizedKey ?? null,
  });
}

/**
 * A learner-safe sentence explaining why Lumen is reinforcing rather than
 * advancing. Never chain-of-thought.
 */
export function loadBearingExplanation(
  signal: GraphTeachingSignal,
  currentTitle: string,
): string | null {
  if (signal.weakUpstreamPrerequisite) {
    return `Reinforcing ${signal.weakUpstreamPrerequisite.title} first — it supports ${currentTitle}.`;
  }
  if (signal.currentConceptIsLoadBearing) {
    return `Making sure ${currentTitle} is solid before moving on — later concepts build directly on it.`;
  }
  return null;
}
