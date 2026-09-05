import type { InteractionRow } from "@/lib/db/repositories";

/**
 * SESSION ANSWER TALLY — the authoritative count of questions answered and
 * how they were classified, derived from `interactions` rather than
 * `teaching_answers`.
 *
 * Why: a structured grader's evaluation payload (persisted to
 * `teaching_answers.evaluation`) could contain real `undefined` values that
 * failed strict JSON validation, silently dropping the row (fixed in
 * `submitAnswer`, but historical rows created before that fix may still be
 * missing). The STUDENT/ANSWER interaction (written the moment an answer is
 * submitted, before grading) and the TEACHER/FEEDBACK interaction (written
 * right after, carrying only primitive `metadata` — never the risky nested
 * `evaluation.breakdown` object) were NEVER exposed to that failure mode —
 * confirmed live against the real database (see
 * `session/teaching-room.integration.test.ts`). They are the reliable
 * source for "how many questions were answered" and "how were they
 * classified", for both historical and current sessions.
 *
 * Pure and deterministic. Counts each real event exactly once — a
 * STUDENT/ANSWER interaction contributes to `questionsAnswered` and
 * `answeredConceptIds`; a TEACHER/FEEDBACK interaction contributes to the
 * classification breakdown. Neither is combined with `teaching_answers`
 * counts elsewhere, so nothing is double-counted.
 */

export interface SessionAnswerTally {
  questionsAnswered: number;
  correct: number;
  partial: number;
  incorrect: number;
  /** Concept ids (not keys) with at least one recorded answer this session. */
  answeredConceptIds: Set<string>;
}

function classificationOf(interaction: InteractionRow): string | null {
  const meta = interaction.metadata as Record<string, unknown> | null;
  const value = meta?.classification;
  return typeof value === "string" ? value : null;
}

export function tallyFromInteractions(
  interactions: InteractionRow[],
): SessionAnswerTally {
  const studentAnswers = interactions.filter(
    (i) => i.role === "STUDENT" && i.interaction_type === "ANSWER",
  );
  const teacherFeedback = interactions.filter(
    (i) => i.role === "TEACHER" && i.interaction_type === "FEEDBACK",
  );

  let correct = 0;
  let partial = 0;
  let incorrect = 0;
  for (const feedback of teacherFeedback) {
    switch (classificationOf(feedback)) {
      case "CORRECT":
        correct += 1;
        break;
      case "PARTIALLY_CORRECT":
        partial += 1;
        break;
      case "INCORRECT":
        incorrect += 1;
        break;
      default:
        break; // UNCERTAIN or missing — not counted in any bucket.
    }
  }

  const answeredConceptIds = new Set(
    studentAnswers
      .map((i) => i.concept_id)
      .filter((id): id is string => Boolean(id)),
  );

  return {
    questionsAnswered: studentAnswers.length,
    correct,
    partial,
    incorrect,
    answeredConceptIds,
  };
}
