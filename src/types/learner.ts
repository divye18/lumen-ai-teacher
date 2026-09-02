import type {
  ConfidenceScore,
  DifficultyLevel,
  ExplanationStrategy,
  Id,
  ISODateTime,
  LanguageTag,
  MasteryScore,
} from "./common";

/**
 * Durable facts about a learner. Changes rarely (per account, per goal),
 * unlike {@link LearnerState} which changes every interaction.
 */
export interface LearnerProfile {
  id: Id;
  displayName: string;
  /** Preferred UI + teaching language. */
  language: LanguageTag;
  /** Self-declared prior level for the current domain, if given. */
  selfDeclaredLevel?: DifficultyLevel;
  preferredExplanationStrategy?: ExplanationStrategy;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Per-concept mastery snapshot within {@link LearnerState}. */
export interface ConceptMastery {
  conceptSlug: string;
  mastery: MasteryScore;
  confidence: ConfidenceScore;
  attempts: number;
  correct: number;
  incorrect: number;
  /** Misconception ids currently associated with this concept. */
  activeMisconceptionIds: Id[];
  lastSeenAt: ISODateTime;
}

/** A compact reference to a recent interaction, for short-term context. */
export interface RecentInteractionRef {
  interactionId: Id;
  conceptSlug: string;
  at: ISODateTime;
  /** One-line summary for context windows. */
  digest: string;
}

/**
 * The evolving model of what a learner knows and how they are doing right now.
 * The orchestrator owns this object; the frontend never mutates it.
 */
export interface LearnerState {
  learnerId: Id;
  sessionId: Id;

  /** Mastery keyed by concept slug. */
  conceptMastery: Record<string, ConceptMastery>;

  /** Aggregate counters for the current session. */
  totals: {
    attempts: number;
    correct: number;
    incorrect: number;
  };

  /** Strategy the teaching engine is currently favouring. */
  preferredExplanationStrategy: ExplanationStrategy;

  recentInteractions: RecentInteractionRef[];

  currentConceptSlug?: string;
  currentLessonId?: Id;

  language: LanguageTag;
  learningGoal?: string;
  /** Minutes the learner has available this session, if declared. */
  availableTimeMinutes?: number;

  lastSeenAt: ISODateTime;
  updatedAt: ISODateTime;
}
