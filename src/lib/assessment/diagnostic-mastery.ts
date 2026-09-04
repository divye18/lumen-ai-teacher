import type { MasteryStatus } from "@/lib/db/enums";
import type { CurrentConceptState } from "@/lib/learner/state-update";
import {
  applyConfidenceUpdate,
  applyMasteryUpdate,
  deriveMasteryStatus,
  pointsToScore,
  scoreToPoints,
} from "@/lib/teaching/mastery";

import {
  DIAGNOSTIC_DIFFICULTY,
  type ApparentKnowledge,
  type ConceptDiagnosticResult,
  type DiagnosticResult,
} from "./diagnostic";

/**
 * DIAGNOSTIC → INITIAL MASTERY BRIDGE.
 *
 * Converts a completed `DiagnosticResult` (see `diagnostic.ts`) into initial
 * `concept_mastery` field patches, ready for a caller to persist via the
 * existing `MasteryStore.upsert` — no new persistence path, no migration.
 *
 * Deliberately conservative and pure:
 *   - reuses the same bounded mastery/confidence math every ordinary teaching
 *     interaction uses (`teaching/mastery.ts`), so a diagnostic answer moves
 *     the numbers by exactly the same rules a first real answer would;
 *   - a diagnostic result NEVER lowers mastery/confidence the learner already
 *     has on record — only raises it when the diagnostic evidence supports a
 *     higher floor (`Math.max` merge against any existing state);
 *   - NEVER creates or strengthens a `misconceptions` row. A WEAK diagnostic
 *     answer is signal for low initial mastery only; `misconceptionCount` on
 *     the patch is always carried over unchanged. Confirmed misconception
 *     creation stays exclusively behind the ordinary teaching-interaction
 *     path (`learner/misconception-tracker.ts`, via `applyInteractionOutcome`),
 *     which the diagnostic flow does not call;
 *   - does not set `preferredStrategy` — a diagnostic probe is not taught
 *     with any particular strategy, so that field is left untouched by
 *     omitting it from the patch (the upsert only writes fields present).
 */

export interface DiagnosticMasteryPatch {
  masteryScore: number;
  confidenceScore: number;
  attemptCount: number;
  correctCount: number;
  incorrectCount: number;
  misconceptionCount: number;
  status: MasteryStatus;
  lastAttemptAt: string;
  lastCorrectAt?: string;
  evidenceSummary: string;
}

export interface ConceptMasterySeed {
  conceptKey: string;
  conceptTitle: string;
  apparentKnowledge: ApparentKnowledge;
  patch: DiagnosticMasteryPatch;
  /** True when this seed actually moves mastery/confidence/attempt state. */
  changed: boolean;
}

export interface SeedMasteryFromDiagnosticInput {
  result: DiagnosticResult;
  /**
   * Existing per-concept mastery state, keyed by the same `conceptKey` used
   * in `DiagnosticResult`. A missing or `null` entry means the learner has no
   * prior record for that concept — the diagnostic becomes its initial state.
   */
  existingByConceptKey?: Record<string, CurrentConceptState | null | undefined>;
  nowISO?: string;
}

export interface SeedMasteryFromDiagnosticResult {
  seeds: ConceptMasterySeed[];
}

const EMPTY_STATE: CurrentConceptState = {
  masteryScore: 0,
  confidenceScore: 0,
  attemptCount: 0,
  correctCount: 0,
  incorrectCount: 0,
  misconceptionCount: 0,
  preferredStrategy: null,
};

function seedOneConcept(
  concept: ConceptDiagnosticResult,
  existing: CurrentConceptState | null,
  now: string,
): ConceptMasterySeed {
  const base = existing ?? EMPTY_STATE;
  const existingPoints = scoreToPoints(base.masteryScore);

  // What this single diagnostic answer alone suggests, computed from a clean
  // baseline (0) via the same bounded update every ordinary answer uses —
  // never inflated by, or blended with, prior evidence.
  const proposed = applyMasteryUpdate({
    currentPoints: 0,
    classification: concept.grade.classification,
    correctnessScore: concept.grade.correctnessScore,
    difficulty: DIAGNOSTIC_DIFFICULTY,
    priorAttempts: 0,
  });
  const proposedConfidence = applyConfidenceUpdate({
    current: 0,
    classification: concept.grade.classification,
    evaluatorConfidence: concept.grade.confidence,
  });

  // Conservative merge: diagnostic evidence can only raise the floor, never
  // lower mastery/confidence the learner already had on record.
  const finalPoints = Math.max(existingPoints, proposed.nextPoints);
  const finalConfidence = Math.max(base.confidenceScore, proposedConfidence);

  const attemptCount = base.attemptCount + 1;
  const correctCount =
    base.correctCount + (concept.grade.classification === "CORRECT" ? 1 : 0);
  const incorrectCount =
    base.incorrectCount +
    (concept.grade.classification === "INCORRECT" ? 1 : 0);

  const status = deriveMasteryStatus({
    points: finalPoints,
    attempts: attemptCount,
    // Diagnostic evidence alone never confirms a repeated misconception.
    hasRepeatedMisconception: false,
  });

  const patch: DiagnosticMasteryPatch = {
    masteryScore: pointsToScore(finalPoints),
    confidenceScore: round3(finalConfidence),
    attemptCount,
    correctCount,
    incorrectCount,
    // Unchanged: the diagnostic never creates or strengthens a misconception.
    misconceptionCount: base.misconceptionCount,
    status,
    lastAttemptAt: now,
    ...(concept.grade.classification === "CORRECT"
      ? { lastCorrectAt: now }
      : {}),
    evidenceSummary: buildEvidenceSummary(concept, finalPoints),
  };

  const changed =
    finalPoints !== existingPoints ||
    round3(finalConfidence) !== round3(base.confidenceScore) ||
    !existing;

  return {
    conceptKey: concept.conceptKey,
    conceptTitle: concept.conceptTitle,
    apparentKnowledge: concept.apparentKnowledge,
    patch,
    changed,
  };
}

/**
 * Pure transformation from a completed `DiagnosticResult` into initial
 * `concept_mastery` patches, one per assessed concept. Idempotent: seeding
 * from the same diagnostic result twice in a row (feeding the first run's
 * output back in as `existingByConceptKey`) produces the same final patch
 * the second time, since the proposed floor doesn't change and `Math.max`
 * against an equal value is a no-op.
 */
export function seedMasteryFromDiagnostic(
  input: SeedMasteryFromDiagnosticInput,
): SeedMasteryFromDiagnosticResult {
  const now = input.nowISO ?? new Date().toISOString();
  const seeds = input.result.concepts.map((concept) =>
    seedOneConcept(
      concept,
      input.existingByConceptKey?.[concept.conceptKey] ?? null,
      now,
    ),
  );
  return { seeds };
}

function buildEvidenceSummary(
  concept: ConceptDiagnosticResult,
  points: number,
): string {
  return (
    `Diagnostic: ${concept.grade.classification} ` +
    `(apparent knowledge: ${concept.apparentKnowledge}); ` +
    `initial mastery estimate ${points}/100.`
  ).slice(0, 4000);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
