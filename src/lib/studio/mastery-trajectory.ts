import type {
  ClientTeachingQuestion,
  TeachingAnswerRow,
} from "@/lib/db/repositories";
import { applyMasteryUpdate } from "@/lib/teaching/mastery";
import type { AnswerClassification } from "@/lib/db/enums";

/**
 * MASTERY TRAJECTORY.
 *
 * The real, persisted history of how a concept's mastery moved — one point per
 * answer. Each point uses the mastery delta that was actually persisted when
 * the answer was graded (`evaluation.masteryDelta`); for older answers that
 * predate Phase 5 it replays the same deterministic `applyMasteryUpdate` the
 * orchestrator used, so the line is always faithful to what happened.
 *
 * Never fabricates a point.
 */

export interface MasteryPoint {
  index: number;
  masteryBefore: number;
  masteryAfter: number;
  delta: number;
  classification: string;
  reason: string;
  /** Question format: FREE_FORM / MCQ / ORDER_STEPS / … */
  format: string;
  difficulty: number;
  at: string;
  misconceptionDetected: boolean;
}

export interface MasteryTrajectory {
  conceptKey: string;
  conceptTitle: string;
  start: number;
  current: number;
  points: MasteryPoint[];
}

interface EmbeddedDelta {
  before?: unknown;
  after?: unknown;
  delta?: unknown;
  reason?: unknown;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;
}

export function buildMasteryTrajectory(input: {
  conceptKey: string;
  conceptTitle: string;
  answers: TeachingAnswerRow[];
  questions: ClientTeachingQuestion[];
}): MasteryTrajectory {
  const questionById = new Map(input.questions.map((q) => [q.id, q]));
  const conceptQuestionIds = new Set(
    input.questions
      .filter((q) => q.concept_key === input.conceptKey)
      .map((q) => q.id),
  );

  const ordered = [...input.answers]
    .filter((a) => conceptQuestionIds.has(a.question_id))
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));

  const points: MasteryPoint[] = [];
  let running = 0;
  let attempts = 0;

  for (const answer of ordered) {
    const question = questionById.get(answer.question_id);
    const difficulty = question?.difficulty ?? 3;
    const evaluation = (answer.evaluation ?? {}) as {
      masteryDelta?: EmbeddedDelta;
      misconceptionCandidates?: unknown[];
      questionFormat?: unknown;
    };
    const embedded = evaluation.masteryDelta;

    let before = running;
    let after: number;
    let reason: string;

    const embBefore = num(embedded?.before);
    const embAfter = num(embedded?.after);
    if (embBefore !== null && embAfter !== null) {
      before = embBefore;
      after = embAfter;
      reason =
        typeof embedded?.reason === "string"
          ? embedded.reason
          : "Mastery updated from this answer.";
    } else {
      // Replay the deterministic transition for a pre-Phase-5 answer.
      const replay = applyMasteryUpdate({
        currentPoints: running,
        classification: (answer.classification ??
          "UNCERTAIN") as AnswerClassification,
        correctnessScore:
          typeof answer.correctness_score === "number"
            ? answer.correctness_score
            : 0.35,
        difficulty,
        priorAttempts: attempts,
      });
      after = replay.nextPoints;
      reason = replay.reason;
    }

    running = after;
    attempts += 1;

    const misconceptionDetected = Array.isArray(
      evaluation.misconceptionCandidates,
    )
      ? evaluation.misconceptionCandidates.length > 0
      : false;

    points.push({
      index: points.length,
      masteryBefore: before,
      masteryAfter: after,
      delta: after - before,
      classification: answer.classification ?? "UNCERTAIN",
      reason,
      format:
        typeof evaluation.questionFormat === "string"
          ? evaluation.questionFormat
          : (question?.question_format ?? "FREE_FORM"),
      difficulty,
      at: answer.created_at,
      misconceptionDetected,
    });
  }

  return {
    conceptKey: input.conceptKey,
    conceptTitle: input.conceptTitle,
    start: points[0]?.masteryBefore ?? 0,
    current: points.at(-1)?.masteryAfter ?? points[0]?.masteryBefore ?? 0,
    points,
  };
}

/**
 * A live trajectory from in-session answer results (client-side). Uses the
 * mastery before/after the orchestrator already returned per answer — no
 * fabrication, no replay.
 */
export function trajectoryFromResults(input: {
  conceptKey: string;
  conceptTitle: string;
  entries: {
    conceptKey: string;
    masteryBefore: number;
    masteryAfter: number;
    reason: string;
    classification: string;
    misconceptionDetected: boolean;
    format: string;
    difficulty: number;
    at: string;
  }[];
}): MasteryTrajectory {
  const points: MasteryPoint[] = input.entries
    .filter((e) => e.conceptKey === input.conceptKey)
    .map((e, i) => ({
      index: i,
      masteryBefore: Math.round(e.masteryBefore),
      masteryAfter: Math.round(e.masteryAfter),
      delta: Math.round(e.masteryAfter) - Math.round(e.masteryBefore),
      classification: e.classification,
      reason: e.reason,
      format: e.format,
      difficulty: e.difficulty,
      at: e.at,
      misconceptionDetected: e.misconceptionDetected,
    }));

  return {
    conceptKey: input.conceptKey,
    conceptTitle: input.conceptTitle,
    start: points[0]?.masteryBefore ?? 0,
    current: points.at(-1)?.masteryAfter ?? points[0]?.masteryBefore ?? 0,
    points,
  };
}
