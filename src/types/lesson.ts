import type { DifficultyLevel, Id, ISODateTime, LanguageTag } from "./common";
import type { TeachingAction, TeachingDecision } from "./teaching";
import type { VisualDirective } from "./visuals";

export type LessonStatus = "draft" | "active" | "completed" | "abandoned";

/**
 * A planned sequence of teaching for one or more concepts. The plan is a
 * starting point; the orchestrator adapts it step-by-step at runtime.
 */
export interface Lesson {
  id: Id;
  learnerId: Id;
  title: string;
  /** Concept slugs this lesson covers, in intended order. */
  conceptSlugs: string[];
  status: LessonStatus;
  language: LanguageTag;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/**
 * One rendered unit of teaching within a lesson, produced by applying a
 * {@link TeachingDecision} deterministically.
 */
export interface LessonStep {
  id: Id;
  lessonId: Id;
  index: number;
  action: TeachingAction;
  conceptSlug: string;
  difficulty: DifficultyLevel;
  /** Learner-facing content for this step. */
  content: string;
  visualDirective?: VisualDirective;
  /** The decision this step was generated from. */
  decision: TeachingDecision;
  createdAt: ISODateTime;
}

export type SessionStatus = "active" | "paused" | "ended";

/**
 * A single continuous sitting with Lumen. Owns the authoritative teaching
 * state for its duration.
 */
export interface LearningSession {
  id: Id;
  learnerId: Id;
  lessonId?: Id;
  status: SessionStatus;
  startedAt: ISODateTime;
  endedAt?: ISODateTime;
  language: LanguageTag;
  learningGoal?: string;
}

export type InteractionRole = "teacher" | "learner" | "system";

export type InteractionKind =
  | "explanation"
  | "example"
  | "analogy"
  | "question"
  | "hint"
  | "answer"
  | "feedback"
  | "recap"
  | "note";

/**
 * An atomic exchange in a session's timeline. Learner answers are also
 * represented in more detail by {@link import("./assessment").StudentAnswer}.
 */
export interface Interaction {
  id: Id;
  sessionId: Id;
  stepId?: Id;
  role: InteractionRole;
  kind: InteractionKind;
  conceptSlug?: string;
  content: string;
  createdAt: ISODateTime;
}
