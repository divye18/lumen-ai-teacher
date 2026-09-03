import "server-only";

import {
  createConceptStore,
  createDocumentStore,
  createLessonStore,
  createMasteryStore,
  createMisconceptionStore,
  createSessionStore,
  type ConceptRow,
  type DbClient,
  type MisconceptionRow,
} from "@/lib/db/repositories";
import type { ConceptRelationshipType } from "@/lib/db/enums";
import {
  masteryBand,
  masteryBandLabel,
  scoreToPoints,
} from "@/lib/teaching/mastery";
import { slugifyConceptKey } from "@/lib/teaching/keys";
import { ok, type Result } from "@/lib/result";

import { layoutGraph } from "./layout";
import { validateGraph, type ValidatedGraph } from "./validate";
import type { NormalizedConcept, NormalizedEdge } from "./normalize";

/**
 * LEARNER-AWARE KNOWLEDGE GRAPH — read model.
 *
 * Merges the STATIC structure (`concepts` + `concept_relationships`) with the
 * DYNAMIC learner state (`concept_mastery` + `misconceptions` + lesson concept
 * status + the active session). Duplicate concept rows (same normalized key)
 * are folded into one node. Everything returned is real data; empty is empty.
 */

const RELATION_LABEL: Record<ConceptRelationshipType, string> = {
  PREREQUISITE: "comes before",
  DEPENDS_ON: "depends on",
  PART_OF: "part of",
  RELATED: "related to",
  CONTRASTS_WITH: "contrasts with",
};

export interface GraphMisconception {
  id: string;
  category: string;
  description: string;
  severity: string;
  detections: number;
}

export interface KnowledgeGraphNode {
  id: string;
  normalizedKey: string;
  conceptKey: string | null;
  title: string;
  description: string | null;
  importance: number;
  masteryPoints: number;
  masteryBand: string;
  bandId: string;
  confidence: number;
  attempts: number;
  assessed: boolean;
  status: string;
  misconceptionCount: number;
  misconceptions: GraphMisconception[];
  sourcePages: number[];
  sourceDocumentId: string | null;
  sourceDocumentTitle: string | null;
  lessonId: string | null;
  lessonTitle: string | null;
  depth: number;
  layer: number;
  row: number;
  x: number;
  y: number;
  isCurrent: boolean;
}

export interface KnowledgeGraphEdge {
  id: string;
  source: string;
  target: string;
  type: ConceptRelationshipType;
  label: string;
  confidence: number;
  ordering: boolean;
}

export interface KnowledgeGraphView {
  scope: "all" | "lesson" | "document";
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  layerCount: number;
  stats: {
    nodeCount: number;
    edgeCount: number;
    assessedCount: number;
    misconceptionCount: number;
    prerequisiteEdges: number;
    averageMastery: number | null;
  };
  generatedAt: string;
}

export interface GetKnowledgeGraphOptions {
  lessonId?: string | null;
  documentId?: string | null;
}

function detectionsOf(m: MisconceptionRow): number {
  const meta = (m.metadata as Record<string, unknown> | null) ?? {};
  const n = meta.detections;
  if (typeof n === "number" && Number.isFinite(n)) return Math.max(1, n);
  return Array.isArray(m.evidence) ? Math.max(1, m.evidence.length) : 1;
}

function pagesOf(row: ConceptRow): number[] {
  const raw = row.source_pages;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is number => typeof p === "number" && Number.isFinite(p))
    .slice(0, 40);
}

/** Tolerates the Phase-4 columns being absent (migration not yet deployed). */
function importanceOf(row: ConceptRow): number {
  const raw = (row as { importance_score?: unknown }).importance_score;
  return typeof raw === "number" && Number.isFinite(raw)
    ? Math.min(1, Math.max(0, raw))
    : 0;
}

export async function getKnowledgeGraph(
  db: DbClient,
  userId: string,
  options: GetKnowledgeGraphOptions = {},
): Promise<Result<KnowledgeGraphView>> {
  const concepts = createConceptStore(db);
  const lessons = createLessonStore(db);
  const mastery = createMasteryStore(db);
  const misconceptions = createMisconceptionStore(db);
  const sessions = createSessionStore(db);
  const documents = createDocumentStore(db);

  const scope: KnowledgeGraphView["scope"] = options.lessonId
    ? "lesson"
    : options.documentId
      ? "document"
      : "all";

  const [conceptRes, masteryRes, misconRes, lessonRes, docRes, sessionRes] =
    await Promise.all([
      concepts.listForUser(userId),
      mastery.listForUser(userId),
      misconceptions.listActiveForUser(userId),
      lessons.listForUser(userId),
      documents.listForUser(userId),
      sessions.listForUser(userId, { limit: 25 }),
    ]);

  const allConcepts = conceptRes.ok ? conceptRes.value : [];
  const masteryRows = masteryRes.ok ? masteryRes.value : [];
  const misconRows = misconRes.ok ? misconRes.value : [];
  const lessonRows = lessonRes.ok ? lessonRes.value : [];
  const docRows = docRes.ok ? docRes.value : [];
  const sessionRows = sessionRes.ok ? sessionRes.value : [];

  // Per-lesson concept rows → conceptKey / status / lessonTitle by concept id.
  const lessonInfoByConceptId = new Map<
    string,
    {
      conceptKey: string;
      status: string;
      lessonId: string;
      lessonTitle: string;
    }
  >();
  const lessonConceptIdsByLesson = new Map<string, Set<string>>();
  await Promise.all(
    lessonRows.map(async (lesson) => {
      const res = await lessons.listConcepts(lesson.id);
      if (!res.ok) return;
      const ids = new Set<string>();
      for (const lc of res.value) {
        if (!lc.concept_id) continue;
        ids.add(lc.concept_id);
        if (!lessonInfoByConceptId.has(lc.concept_id)) {
          lessonInfoByConceptId.set(lc.concept_id, {
            conceptKey: lc.concept_key,
            status: lc.status,
            lessonId: lesson.id,
            lessonTitle: lesson.title,
          });
        }
      }
      lessonConceptIdsByLesson.set(lesson.id, ids);
    }),
  );

  // Scope filter.
  let scopedConcepts = allConcepts;
  if (options.lessonId) {
    const ids = lessonConceptIdsByLesson.get(options.lessonId) ?? new Set();
    scopedConcepts = allConcepts.filter((c) => ids.has(c.id));
  } else if (options.documentId) {
    scopedConcepts = allConcepts.filter(
      (c) => c.document_id === options.documentId,
    );
  }

  if (scopedConcepts.length === 0) {
    return ok({
      scope,
      nodes: [],
      edges: [],
      layerCount: 0,
      stats: {
        nodeCount: 0,
        edgeCount: 0,
        assessedCount: 0,
        misconceptionCount: 0,
        prerequisiteEdges: 0,
        averageMastery: null,
      },
      generatedAt: new Date().toISOString(),
    });
  }

  // Fold duplicate concept rows (same normalized key) into one node.
  const masteryByConceptId = new Map(masteryRows.map((m) => [m.concept_id, m]));
  const misconByConceptId = new Map<string, MisconceptionRow[]>();
  for (const m of misconRows) {
    const list = misconByConceptId.get(m.concept_id) ?? [];
    list.push(m);
    misconByConceptId.set(m.concept_id, list);
  }

  interface Group {
    primaryId: string;
    ids: string[];
    normalizedKey: string;
    row: ConceptRow;
  }
  const groups = new Map<string, Group>();
  for (const c of scopedConcepts) {
    const nk =
      c.normalized_key && c.normalized_key.length > 0
        ? c.normalized_key
        : slugifyConceptKey(c.name, "concept");
    const existing = groups.get(nk);
    if (!existing) {
      groups.set(nk, {
        primaryId: c.id,
        ids: [c.id],
        normalizedKey: nk,
        row: c,
      });
      continue;
    }
    existing.ids.push(c.id);
    // Prefer the row that carries learner state / richer importance as primary.
    const currentHasMastery = masteryByConceptId.has(existing.primaryId);
    const candidateHasMastery = masteryByConceptId.has(c.id);
    if (
      (candidateHasMastery && !currentHasMastery) ||
      importanceOf(c) > importanceOf(existing.row)
    ) {
      existing.primaryId = c.id;
      existing.row = c;
    }
  }

  const idToNormalizedKey = new Map<string, string>();
  for (const g of groups.values()) {
    for (const id of g.ids) idToNormalizedKey.set(id, g.normalizedKey);
  }

  // Edges among the scoped concept ids.
  const scopedIds = [...idToNormalizedKey.keys()];
  const edgeRes = await concepts.listRelationshipsForConcepts(scopedIds);
  const edgeRows = edgeRes.ok ? edgeRes.value : [];

  const rawEdges: NormalizedEdge[] = [];
  const seenEdge = new Set<string>();
  for (const e of edgeRows) {
    const s = idToNormalizedKey.get(e.source_concept_id);
    const t = idToNormalizedKey.get(e.target_concept_id);
    if (!s || !t || s === t) continue;
    if (
      !(
        [
          "PREREQUISITE",
          "RELATED",
          "PART_OF",
          "DEPENDS_ON",
          "CONTRASTS_WITH",
        ] as const
      ).includes(e.relationship_type as ConceptRelationshipType)
    ) {
      continue;
    }
    const type = e.relationship_type as ConceptRelationshipType;
    const key = `${s} ${t} ${type}`;
    if (seenEdge.has(key)) continue;
    seenEdge.add(key);
    rawEdges.push({
      sourceKey: s,
      targetKey: t,
      type,
      confidence: typeof e.strength === "number" ? e.strength : 1,
    });
  }

  const normConcepts: NormalizedConcept[] = [...groups.values()].map((g) => ({
    normalizedKey: g.normalizedKey,
    title: g.row.name,
    description: g.row.description ?? "",
    importance: 3,
    sourcePages: pagesOf(g.row),
    aliases: g.ids,
  }));

  const validated: ValidatedGraph = validateGraph({
    concepts: normConcepts,
    edges: rawEdges,
    keyMap: new Map(),
  });

  const layout = layoutGraph(
    validated.concepts.map((c) => ({
      key: c.normalizedKey,
      depth: validated.depthByKey.get(c.normalizedKey) ?? 0,
      importance: importanceOf(groups.get(c.normalizedKey)!.row),
    })),
  );

  // Active session's current concept → highlight.
  const activeRow = sessionRows.find(
    (s) =>
      s.lesson_id &&
      (s.status === "ACTIVE" ||
        s.status === "PAUSED" ||
        s.status === "PLANNED"),
  );
  let currentNormalizedKey: string | null = null;
  if (activeRow?.lesson_id) {
    const lc = await lessons.listConcepts(activeRow.lesson_id);
    if (lc.ok) {
      const current =
        lc.value.find((c) => c.position === activeRow.plan_cursor) ??
        lc.value[0];
      if (current?.concept_id) {
        currentNormalizedKey =
          idToNormalizedKey.get(current.concept_id) ?? null;
      }
    }
  }

  const docTitleById = new Map(docRows.map((d) => [d.id, d.title]));

  const nodes: KnowledgeGraphNode[] = validated.concepts.map((c) => {
    const group = groups.get(c.normalizedKey)!;
    const masteryRow =
      group.ids.map((id) => masteryByConceptId.get(id)).find(Boolean) ?? null;
    const points = masteryRow ? scoreToPoints(masteryRow.mastery_score) : 0;
    const attempts = masteryRow?.attempt_count ?? 0;

    const miscon = group.ids
      .flatMap((id) => misconByConceptId.get(id) ?? [])
      .filter((m) => m.status !== "RESOLVED");
    const lessonInfo = group.ids
      .map((id) => lessonInfoByConceptId.get(id))
      .find(Boolean);
    const pos = layout.positions.get(c.normalizedKey);

    return {
      id: group.primaryId,
      normalizedKey: c.normalizedKey,
      conceptKey: lessonInfo?.conceptKey ?? null,
      title: group.row.name,
      description: group.row.description,
      importance: importanceOf(group.row),
      masteryPoints: points,
      masteryBand: masteryBandLabel(points),
      bandId: masteryBand(points),
      confidence: masteryRow
        ? Math.round(masteryRow.confidence_score * 100)
        : 0,
      attempts,
      assessed: attempts > 0,
      status: lessonInfo?.status ?? masteryRow?.status ?? "PENDING",
      misconceptionCount: miscon.length,
      misconceptions: miscon.slice(0, 6).map((m) => ({
        id: m.id,
        category: m.category,
        description: m.description,
        severity: m.severity,
        detections: detectionsOf(m),
      })),
      sourcePages: pagesOf(group.row),
      sourceDocumentId: group.row.document_id,
      sourceDocumentTitle: group.row.document_id
        ? (docTitleById.get(group.row.document_id) ?? null)
        : null,
      lessonId: lessonInfo?.lessonId ?? null,
      lessonTitle: lessonInfo?.lessonTitle ?? null,
      depth: validated.depthByKey.get(c.normalizedKey) ?? 0,
      layer: pos?.layer ?? 0,
      row: pos?.row ?? 0,
      x: pos?.x ?? 0.5,
      y: pos?.y ?? 0.5,
      isCurrent: c.normalizedKey === currentNormalizedKey,
    };
  });

  const nodeIdByKey = new Map(nodes.map((n) => [n.normalizedKey, n.id]));
  const orderingTypes = new Set(["PREREQUISITE", "DEPENDS_ON", "PART_OF"]);
  const edges: KnowledgeGraphEdge[] = validated.edges.map((e) => ({
    id: `${e.sourceKey}__${e.type}__${e.targetKey}`,
    source: nodeIdByKey.get(e.sourceKey) ?? e.sourceKey,
    target: nodeIdByKey.get(e.targetKey) ?? e.targetKey,
    type: e.type,
    label: RELATION_LABEL[e.type],
    confidence: e.confidence,
    ordering: orderingTypes.has(e.type),
  }));

  const assessedCount = nodes.filter((n) => n.assessed).length;
  const masterySum = nodes
    .filter((n) => n.assessed)
    .reduce((s, n) => s + n.masteryPoints, 0);

  return ok({
    scope,
    nodes,
    edges,
    layerCount: layout.layerCount,
    stats: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      assessedCount,
      misconceptionCount: nodes.reduce((s, n) => s + n.misconceptionCount, 0),
      prerequisiteEdges: edges.filter((e) => e.type === "PREREQUISITE").length,
      averageMastery:
        assessedCount > 0 ? Math.round(masterySum / assessedCount) : null,
    },
    generatedAt: new Date().toISOString(),
  });
}
