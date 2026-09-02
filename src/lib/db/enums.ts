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
