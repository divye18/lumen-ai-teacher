import { z } from "zod";

import type { DifficultyLevel, Id, ISODateTime } from "./common";

export type QuestionFormat =
  | "multiple-choice"
  | "short-answer"
  | "numeric"
  | "free-response"
  | "explain-why";

/** A single question, either standalone or part of an {@link Assessment}. */
export interface AssessmentQuestion {
  id: Id;
  conceptSlug: string;
  format: QuestionFormat;
  difficulty: DifficultyLevel;
  prompt: string;
  /** Present for "multiple-choice". */
  choices?: { key: string; text: string }[];
  /** Reference answer / rubric key. Never sent to the browser during a test. */
  expectedAnswer?: string;
  /** Misconception slugs a wrong answer may indicate. */
  probesMisconceptions: string[];
}

export type AssessmentPurpose =
  "placement" | "formative" | "summative" | "diagnostic";

/** An ordered set of questions with a shared purpose. */
export interface Assessment {
  id: Id;
  learnerId: Id;
  purpose: AssessmentPurpose;
  conceptSlugs: string[];
  questionIds: Id[];
  createdAt: ISODateTime;
}

/** A learner's raw response to a question. */
export interface StudentAnswer {
  id: Id;
  sessionId: Id;
  questionId: Id;
  conceptSlug: string;
  /** Raw response text (or selected choice key). */
  response: string;
  /** Milliseconds from question shown to answer submitted. */
  responseTimeMs?: number;
  submittedAt: ISODateTime;
}

/**
 * The evaluation of a {@link StudentAnswer}. This is an AI-assisted judgement
 * and must pass `answerEvaluationSchema` before it is trusted.
 */
export const answerEvaluationSchema = z.object({
  studentAnswerId: z.string().min(1),
  correct: z.boolean(),
  /** Partial-credit score, 0–1. */
  score: z.number().min(0).max(1),
  /** Grader confidence in this evaluation, 0–1. */
  confidence: z.number().min(0).max(1),
  /** Learner-facing feedback. */
  feedback: z.string().min(1).max(2_000),
  /** Misconception slugs this answer provides evidence for. */
  detectedMisconceptionSlugs: z.array(z.string().min(1)).max(16).default([]),
});

export type AnswerEvaluation = z.infer<typeof answerEvaluationSchema>;
