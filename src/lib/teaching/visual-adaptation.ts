import type { VisualMode } from "@/types/visuals";
import { type LearnerVisualSignal, visualSignalFromState } from "@/lib/visuals";

/**
 * VISUAL ADAPTATION — the educational intent behind the representation.
 *
 * The deterministic visual resolver already picks a complexity variant
 * (simple / standard / advanced / alternate) from the learner's live state.
 * This module names WHY, in teacher's terms, so the choice can be explained to
 * the learner and shown as part of the adaptive moment — not as a decorative
 * caption.
 *
 * Pure. No model. No invented facts — it only interprets facts the teaching
 * engine already computed and selects among representations the visual
 * contract already supports.
 */

export type VisualIntent =
  /** Minimal, concrete, one idea at a time — the concept is still forming. */
  | "concrete"
  /** A different representation of the same idea — a misconception keeps recurring. */
  | "reframe"
  /** The standard mental model — steady progress. */
  | "reinforce"
  /** Relationships / comparison brought back in — the learner is ready for more. */
  | "connect"
  /** The system-level / abstract view — the learner is solid on the basics. */
  | "systemView";

export type VisualComplexity = "minimal" | "standard" | "rich";

export interface VisualIntentContext {
  masteryPoints: number;
  previousMasteryPoints: number | null;
  repeatedMisconception: boolean;
  lastClassification: string | null;
  incorrectStreak: number;
  /** Prior attempts on this concept — a fresh concept is not "struggling". */
  attempts: number;
  /** Resolved teaching action (EXPLAIN, RETEACH, EXAMPLE, …). */
  action: string;
  /** Kind of the last question, when known. */
  questionKind: string | null;
  strategy: string;
  /** Concept importance 1–5 (load-bearing concepts get a gentler pace). */
  conceptImportance: number;
}

export interface VisualIntentResult {
  intent: VisualIntent;
  complexity: VisualComplexity;
  /** The signal the deterministic resolver should use — one source of truth. */
  signal: LearnerVisualSignal;
  /** Learner-facing educational reason. Never chain-of-thought. */
  rationale: string;
}

const INTENT_LABEL: Record<VisualIntent, string> = {
  concrete: "Simpler view",
  reframe: "A different framing",
  reinforce: "Core view",
  connect: "Connections",
  systemView: "System view",
};

export function visualIntentLabel(intent: VisualIntent): string {
  return INTENT_LABEL[intent] ?? "Visual";
}

const MODE_LABEL: Record<string, string> = {
  TEXT: "Explanation",
  DIAGRAM: "Step-by-step diagram",
  COMPARISON: "Comparison",
  FORMULA: "Formula",
  TIMELINE: "Timeline",
  CONCEPT_MAP: "Concept map",
  CHART: "Chart",
  CODE_VISUALIZATION: "Code walkthrough",
  THREE_D: "3D model",
  ANIMATION: "Animation",
  INTERACTIVE_SIMULATION: "Simulation",
};

export function visualModeLabel(mode: VisualMode | string): string {
  return MODE_LABEL[mode] ?? "Visual";
}

export function deriveVisualIntent(
  ctx: VisualIntentContext,
): VisualIntentResult {
  const signal = visualSignalFromState({
    masteryPoints: ctx.masteryPoints,
    lastClassification: ctx.lastClassification,
    repeatedMisconception: ctx.repeatedMisconception,
    incorrectStreak: ctx.incorrectStreak,
    attempts: ctx.attempts,
  });

  const improved =
    ctx.previousMasteryPoints !== null &&
    ctx.masteryPoints - ctx.previousMasteryPoints >= 6;
  const loadBearing = ctx.conceptImportance >= 4;

  // 1. A recurring misconception — the current picture isn't landing.
  if (ctx.repeatedMisconception) {
    return {
      intent: "reframe",
      complexity: "minimal",
      signal,
      rationale:
        "Showing this a different way — the same idea keeps tripping you up.",
    };
  }

  // 2. Just answered incorrectly / on a wrong streak — strip it back.
  if (ctx.lastClassification === "INCORRECT" || ctx.incorrectStreak >= 1) {
    return {
      intent: "concrete",
      complexity: "minimal",
      signal,
      rationale: loadBearing
        ? "Keeping this concrete — this concept underpins later material, so it's worth slowing down."
        : "Keeping this concrete and stripped-down while the concept is still forming.",
    };
  }

  // 3. Early and low — start from a simple picture, no pressure.
  if (ctx.attempts > 0 && ctx.masteryPoints < 35) {
    return {
      intent: "concrete",
      complexity: "minimal",
      signal,
      rationale:
        "Starting from a simpler picture — there's room to build it up.",
    };
  }

  // 4. Mastery visibly recovered — add the relationships back in.
  if (improved && ctx.masteryPoints >= 45) {
    return {
      intent: "connect",
      complexity: "rich",
      signal,
      rationale:
        "Bringing the connections back in — your answers show you're ready for more.",
    };
  }

  // 5. Solid on the basics — show the system-level view.
  if (ctx.masteryPoints >= 71) {
    return {
      intent: "systemView",
      complexity: "rich",
      signal,
      rationale:
        "Showing the system-level view since you're solid on the fundamentals.",
    };
  }

  // 6. Developing, and the last check was applied/scenario — connect ideas.
  if (
    ctx.masteryPoints >= 51 &&
    (ctx.questionKind === "APPLICATION" ||
      ctx.questionKind === "SCENARIO" ||
      ctx.questionKind === "PROBLEM_SOLVING")
  ) {
    return {
      intent: "connect",
      complexity: ctx.strategy === "visual-first" ? "rich" : "standard",
      signal,
      rationale:
        "Connecting this to the bigger picture — you're applying it, not just defining it.",
    };
  }

  // 7. Steady progress — the standard mental model.
  return {
    intent: "reinforce",
    complexity: ctx.strategy === "visual-first" ? "rich" : "standard",
    signal,
    rationale: "Building a solid mental model of this concept.",
  };
}
