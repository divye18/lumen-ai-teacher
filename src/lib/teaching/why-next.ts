import { masteryBandLabel } from "./mastery";
import type { PolicyFacts } from "./policy";
import type { DifficultyDirection, TeachingAction } from "./contracts";

/**
 * "WHY THIS NEXT?" — a deterministic, learner-facing explanation of the next
 * teaching move.
 *
 * Built ENTIRELY from facts the teaching engine already computed (the resolved
 * action + `PolicyFacts` + concept titles from the plan/graph). It never calls
 * the LLM and never surfaces chain-of-thought or internal policy vocabulary —
 * only a short "here's why" a learner would want to read.
 */

export interface NextStepExplanation {
  /** 3–6 word framing, e.g. "Applying the idea to a scenario". */
  headline: string;
  /** One concise sentence of evidence-based reasoning. */
  reason: string;
}

export interface ExplainNextStepInput {
  action: TeachingAction;
  difficultyDirection: DifficultyDirection;
  nextActionKind?: "question" | "teaching" | null;
  facts: Pick<
    PolicyFacts,
    | "masteryPoints"
    | "previousMasteryPoints"
    | "confidence"
    | "lastClassification"
    | "correctStreak"
    | "incorrectStreak"
    | "repeatedMisconception"
    | "activeMisconceptionCount"
    | "explanationsSinceQuestion"
  >;
  /** Current concept title (already de-slugged). */
  conceptTitle: string;
  /** The concept Lumen moves to on MOVE_FORWARD, when known. */
  nextConceptTitle?: string | null;
  /** An already-taught prerequisite that is still weak, when the graph flags one. */
  weakPrerequisiteTitle?: string | null;
  /** How many times the recurring misconception has now been seen. */
  misconceptionDetectionCount?: number;
}

const RETEACH_ACTIONS = new Set<TeachingAction>([
  "RETEACH",
  "SIMPLIFY",
  "HINT",
  "DECREASE_DIFFICULTY",
]);
const EXPLAIN_ACTIONS = new Set<TeachingAction>([
  "EXPLAIN",
  "EXAMPLE",
  "ANALOGY",
  "VISUALIZE",
]);
const QUESTION_ACTIONS = new Set<TeachingAction>(["ASK", "ASSESS"]);

function bandPhrase(points: number): string {
  return masteryBandLabel(points).toLowerCase();
}

export function explainNextStep(
  input: ExplainNextStepInput,
): NextStepExplanation {
  const { action, facts, conceptTitle } = input;
  const recovered =
    facts.previousMasteryPoints !== null &&
    facts.masteryPoints - facts.previousMasteryPoints >= 6;

  // A weak upstream prerequisite always leads the explanation — it's the
  // clearest "why am I seeing this" answer the graph can give.
  if (
    input.weakPrerequisiteTitle &&
    action !== "MOVE_FORWARD" &&
    action !== "INCREASE_DIFFICULTY"
  ) {
    return {
      headline: `Reinforcing ${input.weakPrerequisiteTitle} first`,
      reason: `${conceptTitle} builds directly on ${input.weakPrerequisiteTitle}, and that prerequisite is still shaky.`,
    };
  }

  if (action === "MOVE_FORWARD") {
    const target = input.nextConceptTitle ?? "the next concept";
    return {
      headline: `Moving on to ${target}`,
      reason:
        facts.masteryPoints >= 71
          ? `Your answers on ${conceptTitle} are strong, so it's ready to build on.`
          : `${conceptTitle} is solid enough to continue — you can return to it later.`,
    };
  }

  if (
    action === "INCREASE_DIFFICULTY" ||
    input.difficultyDirection === "HARDER"
  ) {
    return {
      headline: "Raising the challenge",
      reason: recovered
        ? `Your mastery recovered to ${facts.masteryPoints}/100, so the next question goes deeper.`
        : `You're at ${bandPhrase(facts.masteryPoints)} mastery — a harder question will confirm it.`,
    };
  }

  if (action === "RETEACH" && facts.repeatedMisconception) {
    const n = input.misconceptionDetectionCount ?? 2;
    return {
      headline: `Revisiting ${conceptTitle} a different way`,
      reason: `The same misconception has come up ${n === 2 ? "twice" : `${n} times`} — a fresh explanation should break the pattern.`,
    };
  }

  if (RETEACH_ACTIONS.has(action)) {
    return {
      headline: `Another angle on ${conceptTitle}`,
      reason:
        facts.lastClassification === "INCORRECT"
          ? `Your last answer suggests ${conceptTitle} needs a different representation.`
          : `Simplifying ${conceptTitle} before checking again.`,
    };
  }

  if (QUESTION_ACTIONS.has(action)) {
    if (facts.lastClassification === "CORRECT" || facts.correctStreak >= 1) {
      return {
        headline: "Checking how solid this is",
        reason:
          input.nextActionKind === "teaching"
            ? `Your recall looks strong — next Lumen checks whether you can apply ${conceptTitle}.`
            : `Your last answer was strong, so this question pushes on application.`,
      };
    }
    if (
      facts.lastClassification === "INCORRECT" ||
      facts.lastClassification === "PARTIALLY_CORRECT"
    ) {
      return {
        headline: `Staying with ${conceptTitle}`,
        reason: `Your last answer showed some uncertainty, so Lumen is checking understanding again before moving on.`,
      };
    }
    return {
      headline: `A first check on ${conceptTitle}`,
      reason: `Lumen needs a signal on where you stand with ${conceptTitle}.`,
    };
  }

  if (EXPLAIN_ACTIONS.has(action)) {
    const worked = action === "EXAMPLE";
    return {
      headline: worked
        ? `A worked example for ${conceptTitle}`
        : `Explaining ${conceptTitle}`,
      reason:
        facts.lastClassification === "INCORRECT"
          ? `Your answer missed the core idea, so Lumen is teaching ${conceptTitle} again before the next check.`
          : facts.masteryPoints < 31
            ? `You're just starting ${conceptTitle} — here's the idea before any questions.`
            : `Filling the specific gap your last answer revealed.`,
    };
  }

  if (action === "RECAP") {
    return {
      headline: "Wrapping up",
      reason:
        "You've worked through every concept — a short recap before the summary.",
    };
  }

  return {
    headline: `Continuing with ${conceptTitle}`,
    reason: `Lumen is staying with ${conceptTitle} based on your recent answers.`,
  };
}
