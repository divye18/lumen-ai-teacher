/**
 * Shared primitive types used across Lumen domain contracts.
 *
 * These are domain contracts only — no behaviour, no persistence details.
 */

/** ISO-8601 timestamp string, e.g. "2026-01-01T12:00:00.000Z". */
export type ISODateTime = string;

/** Opaque identifier. All entity ids are UUID strings in practice. */
export type Id = string;

/** BCP-47 language tag, e.g. "en", "en-GB", "hi". */
export type LanguageTag = string;

/**
 * Normalised difficulty on a 1–5 scale.
 * 1 = most accessible, 5 = most demanding.
 */
export type DifficultyLevel = 1 | 2 | 3 | 4 | 5;

/**
 * Mastery estimate for a single concept, 0–1.
 * 0 = no evidence of understanding, 1 = confident mastery.
 */
export type MasteryScore = number;

/** Model/learner confidence estimate, 0–1. */
export type ConfidenceScore = number;

/** How a learner prefers new material to be introduced. */
export type ExplanationStrategy =
  | "formal"
  | "conversational"
  | "example-first"
  | "analogy-first"
  | "visual-first"
  | "socratic";
