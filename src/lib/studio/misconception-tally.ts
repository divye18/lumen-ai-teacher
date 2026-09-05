/**
 * MISCONCEPTION SESSION-ACTIVITY TALLY.
 *
 * `misconceptionsIdentified` is meant to represent misconception ACTIVITY
 * during a session — every category a graded answer surfaced, whether that
 * candidate resulted in a brand-new misconception row or reinforced
 * (strengthened) an existing one. This module makes that unit of counting
 * explicit and resilient, per the 12.5/13.1 audit trail:
 *
 *   - `candidateMentions` (from `teaching_answers.evaluation.
 *     misconceptionCandidates`, one entry per candidate a graded answer
 *     surfaced this session) is the FULL signal — it already counts both
 *     creates and strengthens, exactly as the pre-13.2 metric did. It
 *     degrades only when a `teaching_answers` row is missing (the 12.4 bug,
 *     historical rows only).
 *   - `sessionCreatedCount` (misconceptions whose `session_id` column is
 *     THIS session — i.e. genuinely NEW detections) is independently
 *     reliable: it's a normalized column stamped once at creation, never
 *     touched by the risky nested `evaluation` JSON that caused the 12.4
 *     bug. It can never be missing for a session where a create actually
 *     happened.
 *
 * IMPORTANT, HONEST LIMITATION: a strengthen/reinforcement event has NO
 * independent per-event session back-reference anywhere in the current
 * schema — `misconceptions.strengthen()` appends an evidence entry with no
 * interaction/session id (unlike `record()`'s creation-time evidence
 * entry), and `interactions` (TEACHER/FEEDBACK) never stores a misconception
 * category/id. So a session containing ONLY strengthen activity (no new
 * creates) still depends entirely on `teaching_answers` being intact — this
 * tally cannot, and does not pretend to, fix that specific gap without a
 * schema change. What it DOES fix: the metric never reports fewer
 * misconceptions than we have DIRECT PROOF of via `session_id`, even when
 * `teaching_answers` is completely missing for the session.
 *
 * Pure, deterministic, no DB access.
 */

export interface MisconceptionActivityInput {
  /** One entry per misconception-candidate a graded answer surfaced this
   * session (from `teaching_answers.evaluation.misconceptionCandidates`) —
   * includes both new-creation and strengthen candidates, exactly as before. */
  candidateMentions: unknown[];
  /** Misconceptions rows whose `session_id` is this session (genuinely new
   * detections here) — independently reliable regardless of
   * `teaching_answers` completeness. */
  sessionCreatedCount: number;
}

export interface MisconceptionActivityTally {
  /** The unit of activity is a misconception-candidate MENTION, not a
   * misconception ENTITY — the same concept can be mentioned (and counted)
   * more than once in one session. */
  count: number;
  /**
   * True when `candidateMentions` (the fuller signal, covering both creates
   * and strengthens) was already at least as large as the proven creation
   * floor and was used as-is. False only when `candidateMentions`
   * undercounted relative to confirmed creates — meaning `teaching_answers`
   * is missing rows for this session, and the reported count is a FLOOR
   * (confirmed creates only), not necessarily the true total activity
   * (strengthen activity in that same gap cannot be recovered).
   */
  usedFallbackFloor: boolean;
}

export function tallyMisconceptionActivity(
  input: MisconceptionActivityInput,
): MisconceptionActivityTally {
  const candidateCount = input.candidateMentions.length;
  const createdCount = Math.max(0, input.sessionCreatedCount);

  if (candidateCount >= createdCount) {
    return { count: candidateCount, usedFallbackFloor: false };
  }
  return { count: createdCount, usedFallbackFloor: true };
}
