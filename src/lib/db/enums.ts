import { z } from "zod";

/**
 * String-union mirrors of the CHECK constraints in the SQL migrations.
 *
 * This file is the single source of truth for those value sets on the
 * application side — repositories validate against these before writing, so an
 * invalid value is rejected in TypeScript-land before it ever reaches Postgres.
 * Keep in sync with `supabase/migrations/*`.
 */

export const SUPPORTED_LANGUAGES = ["en", "hi", "hinglish"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const supportedLanguageSchema = z.enum(SUPPORTED_LANGUAGES);

/** Matches `ExplanationStrategy` in `@/types/common`. */
export const LEARNING_STRATEGIES = [
  "formal",
  "conversational",
  "example-first",
  "analogy-first",
  "visual-first",
  "socratic",
] as const;
export type LearningStrategy = (typeof LEARNING_STRATEGIES)[number];
export const learningStrategySchema = z.enum(LEARNING_STRATEGIES);

export const DOCUMENT_STATUSES = [
  "UPLOADED",
  "PROCESSING",
  "READY",
  "FAILED",
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];
export const documentStatusSchema = z.enum(DOCUMENT_STATUSES);

export const CONCEPT_RELATIONSHIP_TYPES = [
  "PREREQUISITE",
  "RELATED",
  "PART_OF",
  "DEPENDS_ON",
] as const;
export type ConceptRelationshipType =
  (typeof CONCEPT_RELATIONSHIP_TYPES)[number];
export const conceptRelationshipTypeSchema = z.enum(CONCEPT_RELATIONSHIP_TYPES);

export const SESSION_STATUSES = [
  "PLANNED",
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "ABANDONED",
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];
export const sessionStatusSchema = z.enum(SESSION_STATUSES);

export const INTERACTION_ROLES = ["STUDENT", "TEACHER", "SYSTEM"] as const;
export type InteractionRole = (typeof INTERACTION_ROLES)[number];
export const interactionRoleSchema = z.enum(INTERACTION_ROLES);

export const INTERACTION_TYPES = [
  "EXPLANATION",
  "QUESTION",
  "ANSWER",
  "HINT",
  "FEEDBACK",
  "RETEACH",
  "RECAP",
  "VISUAL",
  "ASSESSMENT",
  "OTHER",
] as const;
export type InteractionType = (typeof INTERACTION_TYPES)[number];
export const interactionTypeSchema = z.enum(INTERACTION_TYPES);

export const MASTERY_STATUSES = [
  "NOT_STARTED",
  "LEARNING",
  "DEVELOPING",
  "MASTERED",
  "NEEDS_RETEACHING",
] as const;
export type MasteryStatus = (typeof MASTERY_STATUSES)[number];
export const masteryStatusSchema = z.enum(MASTERY_STATUSES);

export const MISCONCEPTION_STATUSES = [
  "ACTIVE",
  "IMPROVING",
  "RESOLVED",
] as const;
export type MisconceptionStatus = (typeof MISCONCEPTION_STATUSES)[number];
export const misconceptionStatusSchema = z.enum(MISCONCEPTION_STATUSES);

export const MISCONCEPTION_SEVERITIES = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
] as const;
export type MisconceptionSeverity = (typeof MISCONCEPTION_SEVERITIES)[number];
export const misconceptionSeveritySchema = z.enum(MISCONCEPTION_SEVERITIES);

export const ASSESSMENT_TYPES = [
  "PLACEMENT",
  "FORMATIVE",
  "SUMMATIVE",
  "DIAGNOSTIC",
] as const;
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];
export const assessmentTypeSchema = z.enum(ASSESSMENT_TYPES);

export const ASSESSMENT_STATUSES = [
  "PLANNED",
  "IN_PROGRESS",
  "COMPLETED",
  "ABANDONED",
] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];
export const assessmentStatusSchema = z.enum(ASSESSMENT_STATUSES);

export const QUESTION_TYPES = [
  "MULTIPLE_CHOICE",
  "SHORT_ANSWER",
  "NUMERIC",
  "FREE_RESPONSE",
  "EXPLAIN_WHY",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
export const questionTypeSchema = z.enum(QUESTION_TYPES);

// ── Phase 2: teaching engine ───────────────────────────────────────────────

export const LESSON_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "COMPLETED",
  "ABANDONED",
] as const;
export type LessonStatus = (typeof LESSON_STATUSES)[number];
export const lessonStatusSchema = z.enum(LESSON_STATUSES);

export const LESSON_PLAN_SOURCES = ["ai", "ai+source", "fallback"] as const;
export type LessonPlanSource = (typeof LESSON_PLAN_SOURCES)[number];
export const lessonPlanSourceSchema = z.enum(LESSON_PLAN_SOURCES);

export const LESSON_CONCEPT_STATUSES = [
  "PENDING",
  "TEACHING",
  "ASSESSING",
  "COMPLETED",
  "SKIPPED",
] as const;
export type LessonConceptStatus = (typeof LESSON_CONCEPT_STATUSES)[number];
export const lessonConceptStatusSchema = z.enum(LESSON_CONCEPT_STATUSES);

/** Question difficulty ladder: definition → application → scenario → problem. */
export const QUESTION_KINDS = [
  "CONCEPTUAL",
  "APPLICATION",
  "SCENARIO",
  "PROBLEM_SOLVING",
] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];
export const questionKindSchema = z.enum(QUESTION_KINDS);

export const ANSWER_CLASSIFICATIONS = [
  "CORRECT",
  "PARTIALLY_CORRECT",
  "INCORRECT",
  "UNCERTAIN",
] as const;
export type AnswerClassification = (typeof ANSWER_CLASSIFICATIONS)[number];
export const answerClassificationSchema = z.enum(ANSWER_CLASSIFICATIONS);

/** Matches `TEACHING_ACTIONS` in `@/types/teaching`; duplicated here for DB-layer validation. */
export const TEACHING_ACTIONS = [
  "EXPLAIN",
  "EXAMPLE",
  "ANALOGY",
  "VISUALIZE",
  "ASK",
  "HINT",
  "SIMPLIFY",
  "RETEACH",
  "RECAP",
  "INCREASE_DIFFICULTY",
  "DECREASE_DIFFICULTY",
  "ASSESS",
  "MOVE_FORWARD",
] as const;
export type TeachingActionName = (typeof TEACHING_ACTIONS)[number];

/** Teaching style === explanation strategy; alias for readability at call sites. */
export const TEACHING_STYLES = LEARNING_STRATEGIES;
export type TeachingStyle = LearningStrategy;
export const teachingStyleSchema = learningStrategySchema;
