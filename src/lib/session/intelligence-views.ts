import {
  eventPresenceLine,
  type LearningEvent,
  type LearningIntelligence,
} from "./learning-intelligence";
import type {
  LearningEventView,
  LearningIntelligenceView,
  LiveStatusView,
} from "./views";

/**
 * Map the internal learning-intelligence shapes to their client-safe views.
 * Drops audit-only fields (`evidenceCount`) and internal advisory
 * (`recommendedIntervention`) — the UI only ever sees learner-facing text.
 */

export function toIntelligenceView(
  i: LearningIntelligence,
): LearningIntelligenceView {
  return {
    conceptKey: i.concept.key,
    conceptTitle: i.concept.title,
    masteryPoints: i.masteryPoints,
    masteryDirection: i.masteryDirection,
    confidenceDirection: i.confidenceDirection,
    recentAccuracy: i.recentAccuracy,
    recoveryVelocity: i.recoveryVelocity,
    misconceptionRisk: i.misconceptionRisk,
    conceptStability: i.conceptStability,
    momentum: i.momentum,
    difficultyFit: i.difficultyFit,
    readiness: i.readiness,
    readinessRationale: i.readinessRationale,
    readyToAdvance: i.readyToAdvance,
    nextConceptTitle: i.nextConcept?.title ?? null,
    hasEvidence: i.hasEvidence,
  };
}

export function toLearningEventView(e: LearningEvent): LearningEventView {
  return {
    kind: e.kind,
    headline: e.headline,
    summary: e.summary,
    conceptTitle: e.concept.title,
    masteryFrom: e.masteryFrom,
    masteryTo: e.masteryTo,
    next: e.next,
    presenceLine: eventPresenceLine(e.kind),
  };
}

export function toLiveStatusView(
  i: LearningIntelligence,
  nextKind: string | null,
): LiveStatusView {
  const state =
    i.readiness === "READY" || i.readiness === "MASTERED"
      ? i.readiness
      : i.recoveryVelocity === "RECOVERING" || i.recoveryVelocity === "QUICK"
        ? "RECOVERING"
        : i.recoveryVelocity === "PERSISTENT"
          ? "STUCK"
          : i.readiness === "DEVELOPING"
            ? "DEVELOPING"
            : "FORMING";
  const momentum =
    i.momentum === "accelerating"
      ? "up"
      : i.momentum === "slowing"
        ? "down"
        : "flat";
  return {
    conceptTitle: i.concept.title,
    masteryPoints: i.masteryPoints,
    state,
    momentum,
    nextKind,
  };
}
