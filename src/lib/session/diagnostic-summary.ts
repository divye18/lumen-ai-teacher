import type {
  StoredDiagnosticConceptRef,
  StoredDiagnosticGap,
  StoredDiagnosticState,
  StoredDiagnosticSummary,
} from "./diagnostic-flow";

/**
 * DIAGNOSTIC INTELLIGENCE SUMMARY — pure, deterministic view-model.
 *
 * Turns the structured facts already computed by the diagnostic (concept
 * titles bucketed by apparent knowledge, plus any real prerequisite gap
 * found by `findMostImportantGap`) into concise, learner-facing copy.
 *
 * Follows the same pattern as `teaching/why-next.ts`'s `explainNextStep` and
 * `graph/select.ts`'s `loadBearingExplanation`: zero database access, zero
 * LLM access, deterministic for the same input, and it never claims more
 * than the evidence supports — a missing gap renders no prerequisite claim
 * at all, never a guessed one.
 */

export interface DiagnosticSummaryGapView extends StoredDiagnosticGap {
  /** One evidence-based sentence — never chain-of-thought, never an LLM call. */
  reason: string;
}

export interface DiagnosticSummaryView {
  strong: StoredDiagnosticConceptRef[];
  developing: StoredDiagnosticConceptRef[];
  weak: StoredDiagnosticConceptRef[];
  /** `null` when the graph doesn't support a meaningful prerequisite claim. */
  mostImportantGap: DiagnosticSummaryGapView | null;
  /** One sentence on how the teaching sequence will adapt because of this. */
  adaptationNote: string;
}

function buildAdaptationNote(
  summary: StoredDiagnosticSummary,
  gap: StoredDiagnosticGap | null,
): string {
  if (gap) {
    return `Based on this diagnostic, I'll spend more time on ${gap.prerequisiteConceptTitle} before moving to ${gap.conceptTitle}.`;
  }
  if (summary.weak.length > 0) {
    const [first, ...rest] = summary.weak;
    return rest.length > 0
      ? `I'll start by reinforcing ${first.conceptTitle} and ${rest.length} other concept${rest.length === 1 ? "" : "s"} before building on them.`
      : `I'll start by reinforcing ${first.conceptTitle} before building on it.`;
  }
  if (summary.developing.length > 0) {
    return `I'll check in early on ${summary.developing[0].conceptTitle} to make sure it's solid, then keep a normal pace.`;
  }
  if (summary.strong.length > 0) {
    return "You're off to a strong start — I'll move a little faster and focus on depth.";
  }
  return "I don't have enough evidence yet, so I'll teach from the beginning and adjust as we go.";
}

/**
 * Builds the presentation-ready summary from the structured diagnostic
 * evidence. Pure: same input always produces the same output.
 */
export function buildDiagnosticSummaryView(
  summary: StoredDiagnosticSummary,
): DiagnosticSummaryView {
  const mostImportantGap: DiagnosticSummaryGapView | null = summary.gap
    ? {
        ...summary.gap,
        reason: `Before we move ahead, I'll strengthen ${summary.gap.prerequisiteConceptTitle} because it supports ${summary.gap.conceptTitle}.`,
      }
    : null;

  return {
    strong: summary.strong,
    developing: summary.developing,
    weak: summary.weak,
    mostImportantGap,
    adaptationNote: buildAdaptationNote(summary, summary.gap),
  };
}

/**
 * The single decision point for "does this learner see the completed
 * diagnostic's summary right now?" Mirrors `resolveDiagnosticPhase`'s role
 * for the pending-question phase. The summary is shown exactly once per
 * completion: `current_action` is set to `"DIAGNOSTIC_SUMMARY"` when grading
 * finishes and cleared back to `null` once the learner acknowledges it (see
 * `orchestrator.ts`'s `submitDiagnostic`), so a reload before acknowledging
 * still shows it (nothing lost) and it never reappears afterwards (never
 * permanently blocks Teaching Room).
 */
export function resolveDiagnosticSummaryPhase(
  stored: StoredDiagnosticState | null,
  currentAction: string | null,
): DiagnosticSummaryView | null {
  if (!stored || stored.status !== "COMPLETED" || !stored.summary) {
    return null;
  }
  if (currentAction !== "DIAGNOSTIC_SUMMARY") return null;
  return buildDiagnosticSummaryView(stored.summary);
}
