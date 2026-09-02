import type { ConfidenceScore, Id, ISODateTime, MasteryScore } from "./common";

export type RecommendationKind =
  | "review-concept"
  | "practice-concept"
  | "advance-to-concept"
  | "address-misconception"
  | "revisit-document"
  | "take-assessment";

export type RecommendationPriority = "low" | "medium" | "high";

/** A concrete, actionable next step surfaced to the learner. */
export interface Recommendation {
  id: Id;
  kind: RecommendationKind;
  priority: RecommendationPriority;
  /** Concept slug or document id the action targets. */
  targetRef: string;
  title: string;
  rationale: string;
}

/** Per-concept outcome line in a {@link LearningReport}. */
export interface ConceptOutcome {
  conceptSlug: string;
  masteryBefore: MasteryScore;
  masteryAfter: MasteryScore;
  attempts: number;
  correct: number;
  /** Misconception slugs still unresolved for this concept. */
  openMisconceptionSlugs: string[];
}

/**
 * A summary of one session (or a span of sessions) for the learner and,
 * later, for educators.
 */
export interface LearningReport {
  id: Id;
  learnerId: Id;
  sessionId: Id;
  generatedAt: ISODateTime;

  /** Narrative summary, learner-facing. */
  summary: string;
  /** Overall confidence in the report's mastery estimates, 0–1. */
  confidence: ConfidenceScore;

  outcomes: ConceptOutcome[];
  recommendations: Recommendation[];

  timeSpentMinutes: number;
}
