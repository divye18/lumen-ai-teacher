import { z } from "zod";

import { teachingActionSchema, type TeachingAction } from "@/types/teaching";
import {
  answerClassificationSchema,
  questionKindSchema,
  teachingStyleSchema,
  type QuestionKind,
  type TeachingStyle,
} from "@/lib/db/enums";
import { conceptKeySchema } from "@/lib/db/schemas";

/**
 * AI OUTPUT CONTRACTS.
 *
 * Every model-driven pedagogical operation produces a value that MUST pass one
 * of these Zod schemas before the deterministic product layer uses it. Raw
 * model output is never trusted. Reasoning fields ask for a single concise
 * sentence — a product/debug rationale, never chain-of-thought.
 */

export const DIFFICULTY_DIRECTIONS = ["EASIER", "SAME", "HARDER"] as const;
export type DifficultyDirection = (typeof DIFFICULTY_DIRECTIONS)[number];
export const difficultyDirectionSchema = z.enum(DIFFICULTY_DIRECTIONS);

// ── Lesson plan ────────────────────────────────────────────────────────────
export const lessonPlanConceptSchema = z.object({
  key: conceptKeySchema,
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(1200),
  difficulty: z.number().int().min(1).max(5),
  importance: z.number().int().min(1).max(5),
  prerequisites: z.array(conceptKeySchema).max(10).default([]),
});

export const lessonPlanStepSchema = z.object({
  conceptKey: conceptKeySchema,
  actions: z.array(teachingActionSchema).min(1).max(12),
});

export const lessonPlanSchema = z
  .object({
    objective: z.string().min(1).max(1200),
    estimatedMinutes: z.number().int().min(1).max(600),
    assessmentStrategy: z.string().min(1).max(1200),
    concepts: z.array(lessonPlanConceptSchema).min(1).max(12),
    sequence: z.array(lessonPlanStepSchema).min(1).max(12),
  })
  .superRefine((plan, ctx) => {
    const keys = new Set(plan.concepts.map((c) => c.key));
    plan.concepts.forEach((c, i) => {
      c.prerequisites.forEach((p) => {
        if (!keys.has(p)) {
          ctx.addIssue({
            code: "custom",
            path: ["concepts", i, "prerequisites"],
            message: `prerequisite "${p}" is not a concept in this plan`,
          });
        }
      });
    });
    plan.sequence.forEach((s, i) => {
      if (!keys.has(s.conceptKey)) {
        ctx.addIssue({
          code: "custom",
          path: ["sequence", i, "conceptKey"],
          message: `sequence references unknown concept "${s.conceptKey}"`,
        });
      }
    });
  });

export type LessonPlan = z.infer<typeof lessonPlanSchema>;

// ── Engine decision (AI proposal, pre-reconciliation) ──────────────────────
export const engineDecisionSchema = z.object({
  action: teachingActionSchema,
  strategy: teachingStyleSchema,
  difficultyDirection: difficultyDirectionSchema,
  targetConceptKey: z.string().min(1).max(80),
  /** One concise sentence. Not chain-of-thought. */
  reason: z.string().min(1).max(600),
  nextAction: teachingActionSchema.nullish(),
});
export type EngineDecisionProposal = z.infer<typeof engineDecisionSchema>;

/**
 * The decision after deterministic reconciliation. This is what the
 * orchestrator acts on and persists.
 */
export interface ResolvedTeachingDecision {
  action: TeachingAction;
  strategy: TeachingStyle;
  difficultyDirection: DifficultyDirection;
  targetConceptKey: string;
  /** Concise pedagogical rationale (product/debug, never CoT). */
  reason: string;
  nextAction: TeachingAction | null;
  /** Where the decision came from. */
  source: "ai" | "policy" | "ai+policy";
  /** What the deterministic guardrail changed about the AI proposal. */
  overrides: string[];
  /** Concise, user-facing "visible intelligence" bullets. Never CoT. */
  adaptationNarrative: string[];
}

// ── Generated question ────────────────────────────────────────────────────
export const generatedQuestionSchema = z.object({
  kind: questionKindSchema,
  difficulty: z.number().int().min(1).max(5),
  prompt: z.string().min(1).max(1600),
  /** Model rubric. Stored server-side, never returned to the client. */
  expectedReasoning: z.string().min(1).max(1600),
  groundedInSource: z.boolean(),
});
export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;

// ── Teaching content ──────────────────────────────────────────────────────
export const teachingContentSchema = z.object({
  title: z.string().min(1).max(160),
  body: z.string().min(1).max(4000),
  /** Whether the body is grounded in provided source material. */
  groundedInSource: z.boolean(),
});
export type TeachingContent = z.infer<typeof teachingContentSchema>;

// ── Rich answer evaluation ────────────────────────────────────────────────
export const REASONING_QUALITIES = [
  "none",
  "weak",
  "partial",
  "sound",
  "strong",
] as const;
export type ReasoningQuality = (typeof REASONING_QUALITIES)[number];

export const misconceptionCandidateSchema = z.object({
  category: z.string().min(1).max(120),
  description: z.string().min(1).max(600),
  confidence: z.number().min(0).max(1),
});
export type MisconceptionCandidate = z.infer<
  typeof misconceptionCandidateSchema
>;

export const richAnswerEvaluationSchema = z.object({
  classification: answerClassificationSchema,
  correctnessScore: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  reasoningQuality: z.enum(REASONING_QUALITIES),
  missingConcepts: z.array(z.string().min(1).max(200)).max(10).default([]),
  misconceptionCandidates: z
    .array(misconceptionCandidateSchema)
    .max(5)
    .default([]),
  /** Short verbatim snippet from the answer that drove the judgement. */
  evidenceQuote: z.string().max(600).optional(),
  /** Learner-facing feedback. */
  feedback: z.string().min(1).max(1600),
  /** One concise sentence for product logic/debugging. Not CoT. */
  rationale: z.string().min(1).max(600),
});
export type RichAnswerEvaluation = z.infer<typeof richAnswerEvaluationSchema>;

export type { QuestionKind, TeachingStyle, TeachingAction };
