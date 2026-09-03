import {
  teachingDecisionSchema,
  type TeachingDecision,
} from "@/types/teaching";
import { ValidationError } from "@/lib/errors";
import { err, ok, type Result } from "@/lib/result";

/**
 * Teaching domain — the adaptive decision layer.
 *
 * Core principle: AI decides WHAT (a proposal), deterministic code decides HOW
 * (validation + reconciliation + numeric state). See:
 *   - `contracts.ts` — every AI-output Zod schema
 *   - `mastery.ts`   — bounded, interpretable 0–100 learner-state math
 *   - `policy.ts`    — deterministic guardrails + strategy/difficulty ladders
 *   - `engine.ts`    — LLM proposal → reconcile → `ResolvedTeachingDecision`
 */

/**
 * Validate an untrusted object into the rendered {@link TeachingDecision} that
 * a `LessonStep` records. This is the choke point for the *rendered* decision
 * (with its question text attached), distinct from the engine's proposal.
 */
export function parseTeachingDecision(
  input: unknown,
): Result<TeachingDecision, ValidationError> {
  const parsed = teachingDecisionSchema.safeParse(input);
  if (!parsed.success) {
    return err(
      new ValidationError(
        "Teaching decision failed schema validation.",
        parsed.error.issues,
      ),
    );
  }

  const decision = parsed.data;
  if (
    (decision.action === "ASK" || decision.action === "ASSESS") &&
    !decision.question
  ) {
    return err(
      new ValidationError(
        `A "${decision.action}" decision must include a question.`,
      ),
    );
  }

  return ok(decision);
}

export { teachingDecisionSchema, type TeachingDecision };

export * from "./contracts";
export * from "./mastery";
export {
  QUESTION_LADDER,
  STRATEGY_ROTATION,
  nextQuestionKind,
  nextStrategy,
  baselineDecision,
  reconcileDecision,
  type PolicyFacts,
} from "./policy";
export {
  createTeachingEngine,
  type TeachingEngine,
  type TeachingReasoningInput,
  type CreateTeachingEngineOptions,
} from "./engine";
export {
  generateTeachingContent,
  type GenerateTeachingContentInput,
  type TeachingContentResult,
} from "./content-generator";
export { slugifyConceptKey, titleCase, clampInt } from "./keys";
export {
  buildEnginePrompt,
  buildTeachingContentPrompt,
  type PromptPair,
  type EngineConceptContext,
  type EngineSignalContext,
} from "./prompts";
