import type { ConceptRelationshipType } from "@/lib/db/enums";
import { computeImportance } from "@/lib/graph/importance";
import type { NormalizedConcept, NormalizedEdge } from "@/lib/graph/normalize";
import { validateGraph } from "@/lib/graph/validate";

import {
  gradeStructuredAnswer,
  type StructuredGradeResult,
} from "./structured/grader";
import {
  pickStructuredQuestion,
  type PickedStructuredQuestion,
} from "./structured/select";
import {
  toClientStructured,
  type ClientStructuredQuestion,
  type StructuredAnswer,
  type StructuredQuestion,
} from "./structured/contracts";

/**
 * DIAGNOSTIC / PRE-ASSESSMENT ENGINE — foundation.
 *
 * Selects a small, deterministic set of structured questions that sample
 * across a concept graph before teaching starts, and scores the resulting
 * answers into a per-concept apparent-knowledge read. Pure: no LLM call
 * decides which questions to ask, no database row is written, and learner
 * mastery is never mutated here — this only produces a structured result
 * for a later milestone to consume when seeding `concept_mastery`.
 *
 * Reuses, rather than duplicates:
 *   - concept ranking: `graph/validate.ts` (acyclic depth) + `graph/importance.ts`
 *     (the same deterministic 0..1 importance score the knowledge graph uses)
 *   - question selection/grading: `assessment/structured/{select,grader}.ts`
 *     (authored bank → grounded template fallback, deterministic grading)
 */

const ORDERING_EDGE_TYPES = new Set<ConceptRelationshipType>([
  "PREREQUISITE",
  "DEPENDS_ON",
  "PART_OF",
]);

export const DIAGNOSTIC_MIN_QUESTIONS = 5;
export const DIAGNOSTIC_MAX_QUESTIONS = 8;
const DEFAULT_TARGET_COUNT = DIAGNOSTIC_MAX_QUESTIONS;
/** Baseline probe difficulty/kind — a pre-assessment measures footing, not mastery. */
const DIAGNOSTIC_KIND = "CONCEPTUAL" as const;
const DIAGNOSTIC_DIFFICULTY = 2;

export interface DiagnosticConceptInput {
  /** Stable, unique identifier for this concept (e.g. its normalizedKey). */
  key: string;
  title: string;
  /** Short description/summary used for bank matching and template distractors. */
  summary: string;
}

export interface DiagnosticEdgeInput {
  sourceKey: string;
  targetKey: string;
  type: ConceptRelationshipType;
}

export interface DiagnosticConceptRank {
  key: string;
  title: string;
  summary: string;
  /** 0..1, same deterministic scoring the knowledge graph uses. */
  importance: number;
  /** At least one other concept directly depends on / comes after this one. */
  isLoadBearing: boolean;
  /** This concept is a direct prerequisite of at least one other concept. */
  isPrerequisite: boolean;
}

/**
 * Rank concepts by deterministic graph importance (centrality + connectivity +
 * how foundational/shallow the concept is). No raw per-concept emphasis is
 * available at diagnostic time, so every concept starts at the same baseline
 * emphasis (3/5) — ranking is driven entirely by graph structure, which is
 * exactly the "load-bearing / prerequisite" signal this engine needs.
 */
export function rankDiagnosticConcepts(
  concepts: DiagnosticConceptInput[],
  edges: DiagnosticEdgeInput[],
): DiagnosticConceptRank[] {
  const dedupedConcepts = concepts.filter(
    (c, i) => concepts.findIndex((o) => o.key === c.key) === i,
  );
  const knownKeys = new Set(dedupedConcepts.map((c) => c.key));
  const validEdges = edges.filter(
    (e) =>
      e.sourceKey !== e.targetKey &&
      knownKeys.has(e.sourceKey) &&
      knownKeys.has(e.targetKey),
  );

  const normConcepts: NormalizedConcept[] = dedupedConcepts.map((c) => ({
    normalizedKey: c.key,
    title: c.title,
    description: c.summary,
    importance: 3,
    sourcePages: [],
    aliases: [c.key],
  }));
  const normEdges: NormalizedEdge[] = validEdges.map((e) => ({
    sourceKey: e.sourceKey,
    targetKey: e.targetKey,
    type: e.type,
    confidence: 1,
  }));

  const validated = validateGraph({
    concepts: normConcepts,
    edges: normEdges,
    keyMap: new Map(),
  });
  const importanceByKey = computeImportance({
    concepts: validated.concepts,
    edges: validated.edges,
    depthByKey: validated.depthByKey,
  });

  const orderingEdges = validated.edges.filter((e) =>
    ORDERING_EDGE_TYPES.has(e.type),
  );
  const loadBearingKeys = new Set(orderingEdges.map((e) => e.sourceKey));
  const prerequisiteKeys = new Set(orderingEdges.map((e) => e.sourceKey));

  return dedupedConcepts
    .map((c) => ({
      key: c.key,
      title: c.title,
      summary: c.summary,
      importance: importanceByKey.get(c.key) ?? 0,
      isLoadBearing: loadBearingKeys.has(c.key),
      isPrerequisite: prerequisiteKeys.has(c.key),
    }))
    .sort((a, b) => {
      if (a.importance !== b.importance) return b.importance - a.importance;
      return a.key < b.key ? -1 : 1; // stable, deterministic tiebreak
    });
}

export interface DiagnosticQuestionItem {
  conceptKey: string;
  conceptTitle: string;
  importance: number;
  isLoadBearing: boolean;
  isPrerequisite: boolean;
  question: StructuredQuestion;
  client: ClientStructuredQuestion;
  origin: PickedStructuredQuestion["origin"];
}

export interface DiagnosticQuestionSet {
  items: DiagnosticQuestionItem[];
  /** The target question count requested (bounded to [MIN, MAX]). */
  requestedCount: number;
  /** How many distinct concepts were considered for selection. */
  conceptsConsidered: number;
}

export interface SelectDiagnosticQuestionSetOptions {
  /** Desired question count; clamped to [DIAGNOSTIC_MIN_QUESTIONS, DIAGNOSTIC_MAX_QUESTIONS]. */
  targetCount?: number;
}

function graphTitlesFor(
  key: string,
  ranked: DiagnosticConceptRank[],
  edges: DiagnosticEdgeInput[],
): {
  prerequisiteTitles: string[];
  dependentTitles: string[];
  otherConceptTitles: string[];
} {
  const titleByKey = new Map(ranked.map((c) => [c.key, c.title]));
  const orderingEdges = edges.filter((e) => ORDERING_EDGE_TYPES.has(e.type));
  const prerequisiteTitles = orderingEdges
    .filter((e) => e.targetKey === key)
    .map((e) => titleByKey.get(e.sourceKey))
    .filter((t): t is string => Boolean(t));
  const dependentTitles = orderingEdges
    .filter((e) => e.sourceKey === key)
    .map((e) => titleByKey.get(e.targetKey))
    .filter((t): t is string => Boolean(t));
  const otherConceptTitles = ranked
    .filter((c) => c.key !== key)
    .map((c) => c.title);
  return { prerequisiteTitles, dependentTitles, otherConceptTitles };
}

/**
 * Select a small, deterministic diagnostic question set: one question per
 * concept, walking concepts from most to least graph-important (load-bearing
 * / prerequisite concepts first) until `targetCount` distinct concepts have a
 * question or the ranked list is exhausted. Never invents a question — a
 * concept with no bank match and no groundable template is simply skipped, so
 * the returned set can be shorter than requested.
 */
export function selectDiagnosticQuestionSet(
  concepts: DiagnosticConceptInput[],
  edges: DiagnosticEdgeInput[],
  options: SelectDiagnosticQuestionSetOptions = {},
): DiagnosticQuestionSet {
  const targetCount = Math.min(
    DIAGNOSTIC_MAX_QUESTIONS,
    Math.max(
      DIAGNOSTIC_MIN_QUESTIONS,
      options.targetCount ?? DEFAULT_TARGET_COUNT,
    ),
  );

  const ranked = rankDiagnosticConcepts(concepts, edges);
  const items: DiagnosticQuestionItem[] = [];
  const usedPrompts: string[] = [];
  const coveredConceptKeys = new Set<string>();

  for (const candidate of ranked) {
    if (items.length >= targetCount) break;
    if (coveredConceptKeys.has(candidate.key)) continue;

    const { prerequisiteTitles, dependentTitles, otherConceptTitles } =
      graphTitlesFor(candidate.key, ranked, edges);

    const picked = pickStructuredQuestion({
      conceptKey: candidate.key,
      title: candidate.title,
      summary: candidate.summary,
      targetKind: DIAGNOSTIC_KIND,
      difficulty: DIAGNOSTIC_DIFFICULTY,
      masteryPoints: 0,
      struggling: false,
      usedPrompts,
      graph: { prerequisiteTitles, dependentTitles, otherConceptTitles },
    });
    if (!picked) continue;

    usedPrompts.push(picked.question.prompt);
    coveredConceptKeys.add(candidate.key);
    items.push({
      conceptKey: candidate.key,
      conceptTitle: candidate.title,
      importance: candidate.importance,
      isLoadBearing: candidate.isLoadBearing,
      isPrerequisite: candidate.isPrerequisite,
      question: picked.question,
      client: toClientStructured(picked.question, picked.question.prompt),
      origin: picked.origin,
    });
  }

  return {
    items,
    requestedCount: targetCount,
    conceptsConsidered: ranked.length,
  };
}

// ── scoring ──────────────────────────────────────────────────────────────

export type ApparentKnowledge = "STRONG" | "DEVELOPING" | "WEAK";

export interface DiagnosticAnswerInput {
  conceptKey: string;
  answer: StructuredAnswer;
}

export interface ConceptDiagnosticResult {
  conceptKey: string;
  conceptTitle: string;
  apparentKnowledge: ApparentKnowledge;
  isLoadBearing: boolean;
  isPrerequisite: boolean;
  grade: StructuredGradeResult;
}

export interface DiagnosticResult {
  concepts: ConceptDiagnosticResult[];
  strongConceptKeys: string[];
  developingConceptKeys: string[];
  weakConceptKeys: string[];
  /** Weak concepts that are also load-bearing/prerequisite — teach these first. */
  weakLoadBearingConceptKeys: string[];
  /** Concepts in the question set that received no answer. */
  unansweredConceptKeys: string[];
}

function apparentKnowledgeOf(grade: StructuredGradeResult): ApparentKnowledge {
  if (grade.classification === "CORRECT") return "STRONG";
  if (grade.classification === "PARTIALLY_CORRECT") return "DEVELOPING";
  return "WEAK";
}

/**
 * Grade a diagnostic question set's answers and roll them up into a
 * per-concept apparent-knowledge read. Pure — does not touch the database or
 * mutate `concept_mastery`; the caller decides how (or whether) to seed
 * learner state from this result.
 */
export function scoreDiagnosticQuestionSet(
  set: DiagnosticQuestionSet,
  answers: DiagnosticAnswerInput[],
): DiagnosticResult {
  const answerByConceptKey = new Map(
    answers.map((a) => [a.conceptKey, a.answer]),
  );

  const concepts: ConceptDiagnosticResult[] = [];
  const unansweredConceptKeys: string[] = [];

  for (const item of set.items) {
    const answer = answerByConceptKey.get(item.conceptKey);
    if (!answer) {
      unansweredConceptKeys.push(item.conceptKey);
      continue;
    }
    const grade = gradeStructuredAnswer(item.question, answer);
    concepts.push({
      conceptKey: item.conceptKey,
      conceptTitle: item.conceptTitle,
      apparentKnowledge: apparentKnowledgeOf(grade),
      isLoadBearing: item.isLoadBearing,
      isPrerequisite: item.isPrerequisite,
      grade,
    });
  }

  const strongConceptKeys = concepts
    .filter((c) => c.apparentKnowledge === "STRONG")
    .map((c) => c.conceptKey);
  const developingConceptKeys = concepts
    .filter((c) => c.apparentKnowledge === "DEVELOPING")
    .map((c) => c.conceptKey);
  const weakConceptKeys = concepts
    .filter((c) => c.apparentKnowledge === "WEAK")
    .map((c) => c.conceptKey);
  const weakLoadBearingConceptKeys = concepts
    .filter(
      (c) =>
        c.apparentKnowledge === "WEAK" && (c.isLoadBearing || c.isPrerequisite),
    )
    .map((c) => c.conceptKey);

  return {
    concepts,
    strongConceptKeys,
    developingConceptKeys,
    weakConceptKeys,
    weakLoadBearingConceptKeys,
    unansweredConceptKeys,
  };
}
