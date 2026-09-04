import type { StructuredQuestion } from "@/lib/assessment/structured/contracts";

import { normalizeCategory } from "./misconception-tracker";

/**
 * MISCONCEPTION RESOLUTION — closing the loop `matchMisconception` /
 * `planMisconceptionUpdates` never did: a misconception a learner has
 * genuinely overcome can transition `ACTIVE -> IMPROVING -> RESOLVED`.
 *
 * This module is additive, not a replacement:
 *   - `matchMisconception` / `planMisconceptionUpdates` still own the ONLY
 *     path that creates or strengthens a misconception (a wrong / matching
 *     answer). Nothing here touches that.
 *   - This module only evaluates evidence those paths ignore: a CORRECT
 *     answer that specifically avoided a known trap (structured), or a
 *     correct free-form answer on the concept (weaker evidence — capped
 *     below RESOLVED).
 *
 * Pure, deterministic, no LLM: resolution is never inferred by a model.
 */

export type MisconceptionEvidenceSignal = "avoided" | "soft-improve" | null;

/**
 * Every misconception ref (category id) embedded as a distractor anywhere in
 * a structured question, normalized. Mirrors the per-format shape
 * `hasMisconceptionDistractor` (select.ts) already uses, but returns the ids
 * instead of a boolean — a CORRECT answer on a question that embeds one of
 * these is exactly the "avoided the trap" signal.
 */
export function misconceptionCategoriesInQuestion(
  question: StructuredQuestion,
): string[] {
  const ids: string[] = [];
  switch (question.format) {
    case "MCQ":
    case "MULTI_SELECT":
      for (const o of question.data.options) {
        if (o.misconception) ids.push(o.misconception.id);
      }
      break;
    case "TRUE_FALSE":
      if (question.data.misconception) ids.push(question.data.misconception.id);
      break;
    case "CLASSIFY":
      for (const item of question.data.items) {
        if (item.misconception) ids.push(item.misconception.id);
      }
      break;
    case "MATCH_RELATIONSHIP":
      if (question.data.misconceptionByLeft) {
        for (const ref of Object.values(question.data.misconceptionByLeft)) {
          if (ref) ids.push(ref.id);
        }
      }
      break;
    case "ORDER_STEPS":
      break;
  }
  return [...new Set(ids.map(normalizeCategory))];
}

/**
 * Whether THIS answer is positive evidence for THIS specific misconception.
 * Structured: only when the question actually tested that misconception's
 * trap and the learner avoided it. Free-form: any correct answer on the
 * concept is weaker, undirected evidence.
 */
export function classifyMisconceptionResponse(input: {
  isStructured: boolean;
  classification: string;
  /** Already-normalized category ids embedded in the answered question. */
  questionMisconceptionCategories: string[];
  /** Already-normalized category of the misconception being evaluated. */
  targetCategory: string;
}): MisconceptionEvidenceSignal {
  const positive = input.classification === "CORRECT";
  if (!positive) return null;

  if (input.isStructured) {
    return input.questionMisconceptionCategories.includes(input.targetCategory)
      ? "avoided"
      : null;
  }
  return "soft-improve";
}

export type ResolvableStatus = "ACTIVE" | "IMPROVING" | "RESOLVED" | string;

export interface ResolvableMisconceptionState {
  id: string;
  category: string;
  status: ResolvableStatus;
  /** From `metadata.clearedChecks` — verified checks since the last relapse. */
  clearedChecks: number;
  /** From `metadata.lastVerifiedQuestionId` — the anti-gaming spacing guard. */
  lastVerifiedQuestionId: string | null;
}

export interface MisconceptionResolutionTransition {
  status: "IMPROVING" | "RESOLVED";
  clearedChecks: number;
  lastVerifiedQuestionId: string;
}

/**
 * The deterministic state machine. `null` = no change.
 *
 *   ACTIVE    + avoided       -> IMPROVING (1st verified check)
 *   IMPROVING + avoided       -> RESOLVED  (2nd verified check, a DIFFERENT
 *                                 question than the one that set IMPROVING —
 *                                 the anti-gaming guard: an immediate re-check
 *                                 of the same question instance never counts
 *                                 as two independent pieces of evidence)
 *   ACTIVE    + soft-improve  -> IMPROVING (free-form is real but weaker
 *                                 evidence — it can start progress, never
 *                                 finish it)
 *   IMPROVING + soft-improve  -> no-op (still needs a structured verification)
 *   RESOLVED  + anything      -> no-op (already clear; a relapse is handled
 *                                 entirely by the EXISTING strengthen() path,
 *                                 which already re-activates RESOLVED -> ACTIVE)
 */
export function planMisconceptionResolution(input: {
  currentStatus: ResolvableStatus;
  clearedChecks: number;
  lastVerifiedQuestionId: string | null;
  signal: MisconceptionEvidenceSignal;
  questionId: string;
}): MisconceptionResolutionTransition | null {
  if (!input.signal) return null;
  if (input.currentStatus !== "ACTIVE" && input.currentStatus !== "IMPROVING") {
    return null;
  }

  if (input.signal === "avoided") {
    if (input.currentStatus === "ACTIVE") {
      return {
        status: "IMPROVING",
        clearedChecks: 1,
        lastVerifiedQuestionId: input.questionId,
      };
    }
    // IMPROVING: a second, genuinely distinct verified check resolves it.
    if (input.lastVerifiedQuestionId === input.questionId) return null;
    return {
      status: "RESOLVED",
      clearedChecks: input.clearedChecks + 1,
      lastVerifiedQuestionId: input.questionId,
    };
  }

  // soft-improve: only ever starts progress, never finishes it.
  if (input.currentStatus === "ACTIVE") {
    return {
      status: "IMPROVING",
      clearedChecks: 1,
      lastVerifiedQuestionId: input.questionId,
    };
  }
  return null;
}

export interface ResolutionOutcome {
  id: string;
  statusBefore: ResolvableStatus;
  statusAfter: "IMPROVING" | "RESOLVED";
  clearedChecks: number;
  lastVerifiedQuestionId: string;
}

/** Composes the two functions above for one misconception on one answer. */
export function evaluateMisconceptionResolution(input: {
  misconception: ResolvableMisconceptionState;
  isStructured: boolean;
  classification: string;
  /** Already-normalized category ids embedded in the answered question. */
  questionMisconceptionCategories: string[];
  questionId: string;
}): ResolutionOutcome | null {
  const signal = classifyMisconceptionResponse({
    isStructured: input.isStructured,
    classification: input.classification,
    questionMisconceptionCategories: input.questionMisconceptionCategories,
    targetCategory: normalizeCategory(input.misconception.category),
  });
  const transition = planMisconceptionResolution({
    currentStatus: input.misconception.status,
    clearedChecks: input.misconception.clearedChecks,
    lastVerifiedQuestionId: input.misconception.lastVerifiedQuestionId,
    signal,
    questionId: input.questionId,
  });
  if (!transition) return null;
  return {
    id: input.misconception.id,
    statusBefore: input.misconception.status,
    statusAfter: transition.status,
    clearedChecks: transition.clearedChecks,
    lastVerifiedQuestionId: transition.lastVerifiedQuestionId,
  };
}
