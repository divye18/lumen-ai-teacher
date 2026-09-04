import { z } from "zod";

import type {
  ConceptRelationshipType,
  StructuredQuestionFormat,
} from "@/lib/db/enums";
import type { CreateAssessmentInput } from "@/lib/db/schemas";
import type { ConceptMasteryUpsertInput } from "@/lib/db/schemas";
import {
  structuredQuestionSchema,
  toClientStructured,
  type ClientStructuredQuestion,
  type StructuredQuestion,
} from "@/lib/assessment/structured/contracts";
import type {
  ConceptMasterySeed,
  DiagnosticMasteryPatch,
} from "@/lib/assessment/diagnostic-mastery";
import type {
  DiagnosticConceptInput,
  DiagnosticEdgeInput,
  DiagnosticQuestionSet,
  DiagnosticResult,
} from "@/lib/assessment/diagnostic";

/**
 * DIAGNOSTIC LESSON-STARTUP WIRING — pure decision/mapping logic.
 *
 * Everything here is a pure function: no database access, no LLM call. The
 * orchestrator (`session/orchestrator.ts`) is the only caller and owns all
 * persistence; keeping the decisions here pure makes them unit-testable
 * without a database, matching how `learner/misconception-tracker.ts` and
 * `learner/state-update.ts` are tested in this codebase.
 *
 * Session-scoped diagnostic state is stored under the existing
 * `learning_sessions.mastery_snapshot.__diagnostic` jsonb key — the same
 * established convention `__baseline`/`__ending` already use for session
 * side-channel data that doesn't warrant its own column. No migration.
 */

// ── 1. does this learner need a diagnostic for this lesson? ────────────────

export interface DiagnosticLessonConcept {
  conceptId: string | null;
  conceptKey: string;
  title: string;
  summary: string;
}

export interface DiagnosticMasteryEvidence {
  conceptId: string;
  /** `concept_mastery.attempt_count` — >0 means the learner has evidence. */
  attemptCount: number;
}

/**
 * A diagnostic runs only when the learner has NO evidence on ANY concept
 * this specific lesson covers — never a global "has this user ever done
 * anything" check. As soon as at least one lesson concept has been assessed
 * (regardless of how), Lumen already has evidence for this lesson and should
 * teach immediately rather than re-assess.
 */
export function needsDiagnostic(
  lessonConcepts: DiagnosticLessonConcept[],
  masteryEvidence: DiagnosticMasteryEvidence[],
): boolean {
  const assessedConceptIds = new Set(
    masteryEvidence.filter((m) => m.attemptCount > 0).map((m) => m.conceptId),
  );
  const anyLessonConceptAssessed = lessonConcepts.some(
    (c) => c.conceptId !== null && assessedConceptIds.has(c.conceptId),
  );
  return !anyLessonConceptAssessed;
}

// ── 2. scope the diagnostic engine's inputs to this lesson's graph ─────────

export interface DiagnosticGraphInput {
  nodes: { id: string; conceptKey: string | null }[];
  edges: { source: string; target: string; type: ConceptRelationshipType }[];
}

/**
 * Builds the diagnostic engine's concept/edge inputs strictly from this
 * lesson's concepts and (optionally) this lesson's knowledge-graph edges —
 * never the learner's whole graph. Edges whose endpoints aren't lesson
 * concepts are dropped, same as `graph/select.ts` does for out-of-scope keys.
 */
export function buildDiagnosticConceptsAndEdges(
  lessonConcepts: DiagnosticLessonConcept[],
  graph?: DiagnosticGraphInput,
): { concepts: DiagnosticConceptInput[]; edges: DiagnosticEdgeInput[] } {
  const concepts: DiagnosticConceptInput[] = lessonConcepts.map((c) => ({
    key: c.conceptKey,
    title: c.title,
    summary: c.summary,
  }));
  const lessonKeys = new Set(concepts.map((c) => c.key));

  if (!graph) return { concepts, edges: [] };

  const idToKey = new Map(
    graph.nodes
      .filter((n): n is { id: string; conceptKey: string } =>
        Boolean(n.conceptKey),
      )
      .map((n) => [n.id, n.conceptKey]),
  );

  const edges: DiagnosticEdgeInput[] = graph.edges
    .map((e) => ({
      sourceKey: idToKey.get(e.source),
      targetKey: idToKey.get(e.target),
      type: e.type,
    }))
    .filter(
      (e): e is DiagnosticEdgeInput =>
        Boolean(e.sourceKey) &&
        Boolean(e.targetKey) &&
        lessonKeys.has(e.sourceKey!) &&
        lessonKeys.has(e.targetKey!),
    );

  return { concepts, edges };
}

// ── 3. client-safe question view ────────────────────────────────────────

export interface DiagnosticQuestionItemView {
  conceptKey: string;
  conceptTitle: string;
  format: StructuredQuestionFormat;
  structured: ClientStructuredQuestion;
}

export function buildDiagnosticQuestionItemViews(
  set: DiagnosticQuestionSet,
): DiagnosticQuestionItemView[] {
  return set.items.map((item) => ({
    conceptKey: item.conceptKey,
    conceptTitle: item.conceptTitle,
    format: item.question.format,
    structured: item.client,
  }));
}

// ── 4. session-scoped stored diagnostic state (jsonb) ───────────────────

const storedDiagnosticQuestionItemSchema = z.object({
  conceptKey: z.string(),
  conceptTitle: z.string(),
  question: structuredQuestionSchema,
});
export type StoredDiagnosticQuestionItem = z.infer<
  typeof storedDiagnosticQuestionItemSchema
>;

const storedDiagnosticSummarySchema = z.object({
  strong: z.array(z.string()),
  developing: z.array(z.string()),
  weak: z.array(z.string()),
});

const storedDiagnosticStateSchema = z.object({
  status: z.enum(["IN_PROGRESS", "COMPLETED"]),
  assessmentId: z.string(),
  items: z.array(storedDiagnosticQuestionItemSchema),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  summary: storedDiagnosticSummarySchema.optional(),
});
export type StoredDiagnosticState = z.infer<typeof storedDiagnosticStateSchema>;

/** Validates the `__diagnostic` jsonb blob read back from `mastery_snapshot`. */
export function parseStoredDiagnosticState(
  raw: unknown,
): StoredDiagnosticState | null {
  if (raw === null || raw === undefined) return null;
  const parsed = storedDiagnosticStateSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Build the initial `__diagnostic` state to store when a diagnostic starts. */
export function buildStoredDiagnosticState(
  assessmentId: string,
  set: DiagnosticQuestionSet,
  nowISO: string,
): StoredDiagnosticState {
  return {
    status: "IN_PROGRESS",
    assessmentId,
    items: set.items.map((item) => ({
      conceptKey: item.conceptKey,
      conceptTitle: item.conceptTitle,
      question: item.question,
    })),
    startedAt: nowISO,
  };
}

/** Reconstruct a gradeable `DiagnosticQuestionSet` from stored state. */
export function toDiagnosticQuestionSet(
  stored: StoredDiagnosticState,
): DiagnosticQuestionSet {
  return {
    items: stored.items.map((item) => ({
      conceptKey: item.conceptKey,
      conceptTitle: item.conceptTitle,
      importance: 0,
      isLoadBearing: false,
      isPrerequisite: false,
      question: item.question as StructuredQuestion,
      client: toClientStructured(
        item.question as StructuredQuestion,
        item.question.prompt,
      ),
      origin: "bank",
    })),
    requestedCount: stored.items.length,
    conceptsConsidered: stored.items.length,
  };
}

export function markDiagnosticCompleted(
  stored: StoredDiagnosticState,
  result: DiagnosticResult,
  nowISO: string,
): StoredDiagnosticState {
  return {
    ...stored,
    status: "COMPLETED",
    completedAt: nowISO,
    summary: {
      strong: result.strongConceptKeys,
      developing: result.developingConceptKeys,
      weak: result.weakConceptKeys,
    },
  };
}

// ── 5. what should the session view show right now? ────────────────────

export interface DiagnosticPendingView {
  assessmentId: string;
  items: DiagnosticQuestionItemView[];
}

/**
 * The single decision point for "does this learner see the diagnostic right
 * now?" — `null` input (never started), a COMPLETED state, or a set with no
 * questions all resolve to `pending: null` (go straight to teaching).
 * `IN_PROGRESS` always replays the SAME stored question set — never
 * regenerates it — so a reload/re-entry cannot produce a different
 * diagnostic or a duplicate attempt.
 */
export function resolveDiagnosticPhase(stored: StoredDiagnosticState | null): {
  pending: DiagnosticPendingView | null;
} {
  if (!stored || stored.status === "COMPLETED" || stored.items.length === 0) {
    return { pending: null };
  }
  return {
    pending: {
      assessmentId: stored.assessmentId,
      items: buildDiagnosticQuestionItemViews(toDiagnosticQuestionSet(stored)),
    },
  };
}

// ── 6. persistence-shaped builders (reuse EXISTING store input shapes) ──

/** `assessments.assessment_type = 'DIAGNOSTIC'` — the existing envelope table. */
export function buildDiagnosticAssessmentInput(
  userId: string,
  sessionId: string,
): CreateAssessmentInput {
  return {
    userId,
    sessionId,
    title: "Diagnostic pre-assessment",
    assessmentType: "DIAGNOSTIC",
    status: "IN_PROGRESS",
  };
}

/**
 * Maps diagnostic mastery seeds into the SAME `ConceptMasteryUpsertInput`
 * shape `MasteryStore.upsert` already accepts for ordinary teaching
 * interactions — no new persistence path. `preferredStrategy` is
 * intentionally omitted (a diagnostic probe isn't taught with any
 * strategy), so the upsert leaves that field untouched. Seeds for a concept
 * whose id can't be resolved (not part of this lesson) are skipped.
 */
export function buildMasteryUpsertInputs(
  userId: string,
  conceptIdByKey: Map<string, string | null>,
  seeds: ConceptMasterySeed[],
): ConceptMasteryUpsertInput[] {
  const out: ConceptMasteryUpsertInput[] = [];
  for (const seed of seeds) {
    const conceptId = conceptIdByKey.get(seed.conceptKey);
    if (!conceptId) continue;
    out.push(toUpsertInput(userId, conceptId, seed.patch));
  }
  return out;
}

function toUpsertInput(
  userId: string,
  conceptId: string,
  patch: DiagnosticMasteryPatch,
): ConceptMasteryUpsertInput {
  return {
    userId,
    conceptId,
    masteryScore: patch.masteryScore,
    confidenceScore: patch.confidenceScore,
    attemptCount: patch.attemptCount,
    correctCount: patch.correctCount,
    incorrectCount: patch.incorrectCount,
    misconceptionCount: patch.misconceptionCount,
    status: patch.status,
    lastAttemptAt: patch.lastAttemptAt,
    ...(patch.lastCorrectAt ? { lastCorrectAt: patch.lastCorrectAt } : {}),
    evidenceSummary: patch.evidenceSummary,
  };
}
