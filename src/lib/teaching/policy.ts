import type { TeachingAction } from "@/types/teaching";
import type { AnswerClassification, QuestionKind } from "@/lib/db/enums";
import { TEACHING_STYLES, type TeachingStyle } from "@/lib/db/enums";

import type {
  DifficultyDirection,
  EngineDecisionProposal,
  ResolvedTeachingDecision,
} from "./contracts";
import { masteryBandLabel } from "./mastery";

/**
 * DETERMINISTIC TEACHING POLICY.
 *
 * The LLM proposes a pedagogical action; this module is the product layer that
 * validates and, where needed, overrides it so the system stays reliable and
 * explainable. It also produces a safe decision with no LLM at all.
 *
 * Implements the Phase-2 decision rules:
 *  - high mastery      → increase difficulty / move forward
 *  - medium mastery    → explain + ask
 *  - partially correct → target the missing component
 *  - incorrect         → investigate a misconception
 *  - repeated misconception → RETEACH with a *different* strategy
 *  - mastery improved  → REASSESS
 *  - time low          → prioritise high-value concepts
 */

/** Question difficulty ladder: definition → application → scenario → problem. */
export const QUESTION_LADDER: readonly QuestionKind[] = [
  "CONCEPTUAL",
  "APPLICATION",
  "SCENARIO",
  "PROBLEM_SOLVING",
];

/** Strategy rotation used when a learner is struggling / on RETEACH. */
export const STRATEGY_ROTATION: readonly TeachingStyle[] = [
  "formal",
  "analogy-first",
  "visual-first",
  "example-first",
  "socratic",
];

const LOW_TIME_MINUTES = 5;
const MASTERY_HIGH = 71;
const MASTERY_MEDIUM = 51;
const MASTERY_LOW = 31;

/** The deterministic facts the policy reasons over. All derived, no free text. */
export interface PolicyFacts {
  masteryPoints: number;
  previousMasteryPoints: number;
  confidence: number;
  attempts: number;
  correctStreak: number;
  incorrectStreak: number;
  hintsRequested: number;
  repeatedMisconception: boolean;
  activeMisconceptionCount: number;
  conceptImportance: number; // 1–5
  conceptDifficulty: number; // 1–5
  timeRemainingMinutes: number | null;
  lastClassification: AnswerClassification | null;
  lastCorrectnessScore: number | null;
  currentStrategy: TeachingStyle;
  triedStrategies: TeachingStyle[];
  lastQuestionKind: QuestionKind | null;
  conceptsRemaining: number;
  /**
   * Teaching-content deliveries (EXPLAIN / RETEACH / RECAP / VISUAL) for the
   * current concept since its most recent question. Used to break an
   * explain-forever loop when the learner has not yet been assessed.
   */
  explanationsSinceQuestion: number;
}

export function nextQuestionKind(
  current: QuestionKind | null,
  direction: DifficultyDirection,
): QuestionKind {
  const idx = current ? QUESTION_LADDER.indexOf(current) : 0;
  const base = idx === -1 ? 0 : idx;
  const step = direction === "HARDER" ? 1 : direction === "EASIER" ? -1 : 0;
  const next = Math.min(QUESTION_LADDER.length - 1, Math.max(0, base + step));
  return QUESTION_LADDER[next];
}

export function nextStrategy(
  current: TeachingStyle,
  tried: TeachingStyle[],
): TeachingStyle {
  const seen = new Set<TeachingStyle>([current, ...tried]);
  for (const s of STRATEGY_ROTATION) {
    if (!seen.has(s)) return s;
  }
  // Everything tried — rotate to the next slot after `current`.
  const i = STRATEGY_ROTATION.indexOf(current);
  return STRATEGY_ROTATION[(Math.max(0, i) + 1) % STRATEGY_ROTATION.length];
}

/** A safe, fully deterministic decision — the fallback when the LLM is unusable. */
export function baselineDecision(facts: PolicyFacts): ResolvedTeachingDecision {
  const narrative: string[] = [];
  let action: TeachingAction;
  let difficultyDirection: DifficultyDirection = "SAME";
  let strategy = facts.currentStrategy;
  let nextAction: TeachingAction | null = null;
  let reason: string;

  const masteryImproved =
    facts.masteryPoints - facts.previousMasteryPoints >= 6 &&
    facts.attempts > 0;
  const timeLow =
    facts.timeRemainingMinutes !== null &&
    facts.timeRemainingMinutes <= LOW_TIME_MINUTES;

  if (facts.repeatedMisconception) {
    action = "RETEACH";
    strategy = nextStrategy(facts.currentStrategy, facts.triedStrategies);
    difficultyDirection = "EASIER";
    nextAction = "ASK";
    reason = `A misconception on "${facts.currentStrategy}" framing keeps recurring; re-teaching with a ${strategy} approach.`;
    narrative.push(
      "The same misconception came back after another attempt.",
      `Previous "${facts.currentStrategy}" explanation was not effective.`,
      `Switching teaching strategy to "${strategy}".`,
      "Reducing difficulty and re-checking the concept.",
    );
  } else if (timeLow && facts.masteryPoints >= MASTERY_MEDIUM) {
    action = "MOVE_FORWARD";
    reason =
      "Time budget is nearly spent and this concept is at a developing level — moving to the next high-value concept.";
    narrative.push(
      "Session time is almost up.",
      `"${masteryBandLabel(facts.masteryPoints)}" mastery is good enough to progress.`,
      "Prioritising the next high-value concept.",
    );
  } else if (timeLow) {
    // Consolidate a high-importance concept once, but always make forward
    // progress after that so the session can actually wrap up.
    const alreadyConsolidated = facts.explanationsSinceQuestion >= 1;
    action =
      facts.conceptImportance >= 4 && !alreadyConsolidated
        ? "RECAP"
        : "MOVE_FORWARD";
    reason =
      action === "RECAP"
        ? "Time is low; consolidating the most important concept before wrapping up."
        : "Time is up — moving on to make the most of what's left.";
    narrative.push(
      "Session time is almost up.",
      action === "RECAP"
        ? "This is a high-importance concept — doing a quick recap."
        : "Moving forward to cover remaining ground.",
    );
  } else if (
    facts.explanationsSinceQuestion >= 1 &&
    facts.masteryPoints < MASTERY_HIGH
  ) {
    // A teaching turn (explain / simplify / hint / reteach) just happened for
    // this concept with no follow-up question. Check understanding to get a
    // fresh signal instead of teaching into a void.
    action = "ASK";
    difficultyDirection = "SAME";
    reason =
      "The concept was just taught — checking understanding before deciding what to do next.";
    narrative.push(
      "A teaching turn just happened here.",
      "Checking understanding to get a fresh signal.",
    );
  } else if (facts.lastClassification === "INCORRECT") {
    action = "HINT";
    difficultyDirection = "EASIER";
    nextAction = "ASK";
    reason =
      "Answer was incorrect — offering a targeted hint to surface the likely gap, then re-asking.";
    narrative.push(
      "Answer was incorrect.",
      "Confidence adjusted down for this concept.",
      "Giving a focused hint rather than repeating the full explanation.",
    );
  } else if (facts.lastClassification === "PARTIALLY_CORRECT") {
    action = "EXPLAIN";
    difficultyDirection = "SAME";
    nextAction = "ASK";
    reason =
      "Answer was on the right track but incomplete — explaining the missing component, then re-checking.";
    narrative.push(
      "Answer was partially correct.",
      "Targeting the specific missing piece.",
    );
  } else if (masteryImproved && facts.masteryPoints >= MASTERY_MEDIUM) {
    action = "ASSESS";
    difficultyDirection = "HARDER";
    reason =
      "Mastery improved noticeably — reassessing with a harder question.";
    narrative.push(
      "Mastery improved since the last check.",
      "Reassessing at a higher difficulty.",
    );
  } else if (facts.masteryPoints >= MASTERY_HIGH) {
    action =
      facts.conceptsRemaining > 0 ? "INCREASE_DIFFICULTY" : "MOVE_FORWARD";
    difficultyDirection = "HARDER";
    nextAction = "ASK";
    reason =
      "Mastery is high — raising difficulty rather than repeating easy questions.";
    narrative.push(
      `"${masteryBandLabel(facts.masteryPoints)}" mastery reached.`,
      "Increasing question difficulty along the ladder.",
    );
  } else if (facts.masteryPoints >= MASTERY_MEDIUM) {
    action = "ASK";
    difficultyDirection = "SAME";
    reason = "Medium mastery — checking understanding with a question.";
    narrative.push("Developing mastery — probing with a question.");
  } else if (facts.masteryPoints >= MASTERY_LOW) {
    action = "EXPLAIN";
    nextAction = "ASK";
    reason = "Emerging mastery — explaining the concept, then asking.";
    narrative.push("Emerging mastery — teaching the concept before assessing.");
  } else {
    action = facts.attempts === 0 ? "EXPLAIN" : "SIMPLIFY";
    difficultyDirection = "EASIER";
    nextAction = "ASK";
    reason =
      facts.attempts === 0
        ? "New concept — starting with a clear explanation."
        : "Concept not yet understood — simplifying the explanation.";
    narrative.push(
      facts.attempts === 0
        ? "Introducing a new concept."
        : "Concept still not landing — simplifying.",
    );
  }

  return {
    action,
    strategy,
    difficultyDirection,
    targetConceptKey: "",
    reason,
    nextAction,
    source: "policy",
    overrides: [],
    adaptationNarrative: narrative,
  };
}

/** Actions that mean "the learner is progressing past this concept". */
const FORWARD_ACTIONS = new Set<TeachingAction>([
  "MOVE_FORWARD",
  "INCREASE_DIFFICULTY",
]);

/**
 * Reconcile an AI proposal against the deterministic policy.
 * Returns the resolved decision plus a record of every override.
 */
export function reconcileDecision(
  proposal: EngineDecisionProposal,
  facts: PolicyFacts,
): ResolvedTeachingDecision {
  const baseline = baselineDecision(facts);
  const overrides: string[] = [];
  const narrative: string[] = [];

  let action = proposal.action;
  let strategy = proposal.strategy;
  let difficultyDirection = proposal.difficultyDirection;
  let nextAction: TeachingAction | null = proposal.nextAction ?? null;

  // 1. Repeated misconception ALWAYS forces a reteach with a fresh strategy.
  if (facts.repeatedMisconception && action !== "RETEACH") {
    overrides.push(
      `AI proposed ${action}, but a misconception is recurring — forced RETEACH.`,
    );
    action = "RETEACH";
    nextAction = "ASK";
  }
  if (action === "RETEACH") {
    const rotated = nextStrategy(facts.currentStrategy, facts.triedStrategies);
    if (
      facts.triedStrategies.includes(strategy) ||
      strategy === facts.currentStrategy
    ) {
      overrides.push(
        `Strategy "${strategy}" was already tried — rotating to "${rotated}".`,
      );
      strategy = rotated;
    }
    difficultyDirection = "EASIER";
    narrative.push(
      "Previous explanation approach was not effective.",
      `Switching teaching strategy to "${strategy}".`,
      "Lowering difficulty and re-checking the concept.",
    );
  }

  // 2. Don't advance / harden when the learner just struggled.
  if (
    FORWARD_ACTIONS.has(action) &&
    (facts.incorrectStreak >= 1 || facts.masteryPoints < MASTERY_MEDIUM)
  ) {
    overrides.push(
      `AI proposed ${action} at ${facts.masteryPoints}/100 mastery / incorrect streak ${facts.incorrectStreak} — not ready to advance.`,
    );
    action = facts.lastClassification === "INCORRECT" ? "HINT" : "EXPLAIN";
    difficultyDirection = "SAME";
    nextAction = "ASK";
    narrative.push(
      "Mastery is not high enough to move on yet — consolidating first.",
    );
  }

  // 2b. After an incorrect answer, support the learner before re-questioning.
  if (
    (action === "ASK" || action === "ASSESS") &&
    facts.lastClassification === "INCORRECT" &&
    !facts.repeatedMisconception
  ) {
    const supported: TeachingAction =
      facts.hintsRequested >= 1
        ? "RETEACH"
        : facts.masteryPoints < MASTERY_LOW
          ? "SIMPLIFY"
          : "HINT";
    overrides.push(
      `AI proposed ${action} right after an incorrect answer — ${supported} first.`,
    );
    action = supported;
    if (action === "RETEACH") {
      strategy = nextStrategy(facts.currentStrategy, facts.triedStrategies);
      difficultyDirection = "EASIER";
    } else {
      difficultyDirection = "EASIER";
    }
    nextAction = "ASK";
    narrative.push(
      "Answer was incorrect — offering support before asking another question.",
    );
  }

  // 3. Don't raise difficulty right after an incorrect answer.
  if (
    difficultyDirection === "HARDER" &&
    facts.lastClassification === "INCORRECT"
  ) {
    overrides.push(
      "Refusing to raise difficulty immediately after an incorrect answer.",
    );
    difficultyDirection = "SAME";
  }

  // 4. Time low → prioritise: progress if good enough, else consolidate high value.
  const timeLow =
    facts.timeRemainingMinutes !== null &&
    facts.timeRemainingMinutes <= LOW_TIME_MINUTES;
  if (timeLow && !facts.repeatedMisconception) {
    if (facts.masteryPoints >= MASTERY_MEDIUM && !FORWARD_ACTIONS.has(action)) {
      overrides.push(
        "Time budget low and mastery is adequate — moving forward.",
      );
      action = "MOVE_FORWARD";
      nextAction = null;
    } else if (
      facts.masteryPoints < MASTERY_MEDIUM &&
      facts.conceptImportance < 4
    ) {
      overrides.push(
        "Time budget low and this is not a high-importance concept — moving on.",
      );
      action = "MOVE_FORWARD";
      nextAction = null;
    }
    narrative.push(
      "Session time is short — focusing on the highest-value next step.",
    );
  }

  // 5. If the learner improved a lot, prefer a reassessment.
  const masteryImproved =
    facts.masteryPoints - facts.previousMasteryPoints >= 8 &&
    facts.attempts > 0;
  if (
    masteryImproved &&
    action === "EXPLAIN" &&
    facts.masteryPoints >= MASTERY_MEDIUM
  ) {
    overrides.push("Mastery jumped — reassessing instead of re-explaining.");
    action = "ASSESS";
    difficultyDirection = "HARDER";
    narrative.push("Understanding improved — reassessing at a higher level.");
  }

  // 6. Break an explain-forever loop: if the concept has been explained
  //    repeatedly and never assessed, check understanding instead.
  const teachingActions = new Set([
    "EXPLAIN",
    "SIMPLIFY",
    "RETEACH",
    "HINT",
    "EXAMPLE",
    "ANALOGY",
  ]);
  if (
    teachingActions.has(action) &&
    facts.explanationsSinceQuestion >= 2 &&
    facts.masteryPoints < MASTERY_HIGH
  ) {
    overrides.push(
      "Concept taught repeatedly without a check — asking a question instead.",
    );
    action = "ASK";
    nextAction = null;
    narrative.push("Enough explanation — checking understanding now.");
  }

  // Guard the strategy value itself.
  if (!TEACHING_STYLES.includes(strategy)) {
    overrides.push(
      `AI returned unknown strategy — using "${baseline.strategy}".`,
    );
    strategy = baseline.strategy;
  }

  const source: ResolvedTeachingDecision["source"] =
    overrides.length === 0 ? "ai" : "ai+policy";

  const finalNarrative =
    narrative.length > 0
      ? dedupe(narrative)
      : dedupe([
          summariseSituation(facts),
          `Chosen action: ${humaniseAction(action)}.`,
        ]);

  return {
    action,
    strategy,
    difficultyDirection,
    targetConceptKey: proposal.targetConceptKey,
    reason: proposal.reason,
    nextAction,
    source,
    overrides,
    adaptationNarrative: finalNarrative,
  };
}

function summariseSituation(facts: PolicyFacts): string {
  const band = masteryBandLabel(facts.masteryPoints);
  if (facts.lastClassification === "INCORRECT") {
    return `Last answer incorrect; mastery "${band}".`;
  }
  if (facts.lastClassification === "PARTIALLY_CORRECT") {
    return `Last answer partially correct; mastery "${band}".`;
  }
  if (facts.lastClassification === "CORRECT") {
    return `Last answer correct; mastery "${band}".`;
  }
  return `Starting this concept; mastery "${band}".`;
}

function humaniseAction(action: TeachingAction): string {
  return action.toLowerCase().replace(/_/g, " ");
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const t = item.trim();
    if (t.length > 0 && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}
