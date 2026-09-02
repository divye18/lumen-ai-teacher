import {
  teachingDecisionSchema,
  type TeachingDecision,
} from "@/types/teaching";
import type { LearnerState } from "@/types/learner";
import type { Interaction } from "@/types/lesson";
import { ValidationError } from "@/lib/errors";
import { err, ok, type Result } from "@/lib/result";

/**
 * Teaching orchestration boundary.
 *
 * Core principle: AI decides WHAT, deterministic code decides HOW. A
 * `TeachingEngine` implementation may consult an LLM to choose an action, but
 * its output MUST be a schema-valid {@link TeachingDecision}. The deterministic
 * lesson runtime (later phase) turns that decision into a `LessonStep`.
 *
 * The decision engine itself is not implemented in the foundation phase.
 */
export interface TeachingContext {
  learnerState: LearnerState;
  /** Most recent interactions, newest last. */
  recentInteractions: Interaction[];
  /** Concept slug currently in focus. */
  conceptSlug: string;
}

export interface TeachingEngine {
  readonly id: string;
  decide(context: TeachingContext): Promise<Result<TeachingDecision>>;
}

/**
 * Validate an untrusted (e.g. AI-produced) object into a `TeachingDecision`.
 * This is the single choke point every decision must pass through.
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
