import { z } from "zod";

import { visualDirectiveSchema } from "./visuals";

/**
 * TEACHING DECISION CONTRACT
 *
 * Core principle: AI decides WHAT, deterministic code decides HOW.
 *
 * A TeachingDecision is the typed, validated hand-off from the (AI-assisted)
 * decision layer to the deterministic lesson runtime. Raw LLM output is never
 * used directly — it must be coerced into this shape and pass
 * `teachingDecisionSchema` first.
 */

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

export type TeachingAction = (typeof TEACHING_ACTIONS)[number];

export const teachingActionSchema = z.enum(TEACHING_ACTIONS);

/** A pointer back to source material supporting a decision. */
export const sourceReferenceSchema = z.object({
  documentId: z.string().min(1),
  chunkId: z.string().min(1).optional(),
  /** Short quoted or paraphrased snippet, for grounding and citation. */
  snippet: z.string().max(1_200).optional(),
});

export type SourceReference = z.infer<typeof sourceReferenceSchema>;

export const teachingDecisionSchema = z.object({
  action: teachingActionSchema,
  /** Model-supplied rationale, for logging and explainability. */
  reason: z.string().min(1).max(2_000),
  /** Concept slug the decision operates on. */
  targetConcept: z.string().min(1),
  /** Target difficulty for the next step, 1–5. */
  difficulty: z.number().int().min(1).max(5),
  /** BCP-47 language tag the response should be delivered in. */
  language: z.string().min(2).max(35),
  /** Optional visual to render alongside this step. */
  visualDirective: visualDirectiveSchema.optional(),
  /**
   * Question to pose to the learner. Required in practice when
   * `action` is "ASK" or "ASSESS"; enforced by the decision layer.
   */
  question: z.string().min(1).max(2_000).optional(),
  sourceReferences: z.array(sourceReferenceSchema).max(16).default([]),
});

export type TeachingDecision = z.infer<typeof teachingDecisionSchema>;
