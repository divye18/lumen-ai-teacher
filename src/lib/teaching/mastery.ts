import type { MasteryStatus } from "@/lib/db/enums";

import type { DifficultyDirection } from "./contracts";
import type { AnswerClassification } from "@/lib/db/enums";

/**
 * Deterministic, interpretable learner-state math.
 *
 * Mastery is a PRODUCT decision variable on a 0–100 scale, not a scientific
 * measurement. The LLM supplies evidence (classification + correctness); this
 * module owns every numeric state transition, and the transitions are bounded
 * so a single answer never swings mastery wildly.
 */

export const MASTERY_MIN = 0;
export const MASTERY_MAX = 100;

/** Interpretation bands (see product spec). */
export const MASTERY_BANDS = [
  { id: "not-understood", label: "Not understood", min: 0, max: 30 },
  { id: "emerging", label: "Emerging", min: 31, max: 50 },
  { id: "developing", label: "Developing", min: 51, max: 70 },
  { id: "proficient", label: "Proficient", min: 71, max: 85 },
  { id: "strong", label: "Strong", min: 86, max: 100 },
] as const;

export type MasteryBand = (typeof MASTERY_BANDS)[number]["id"];

// Bounded per-answer movement.
const MAX_GAIN = 12;
const MAX_LOSS = 10;
const PARTIAL_MAX_GAIN = 5;
const UNCERTAIN_MAX_MOVE = 2;

export function clampMastery(points: number): number {
  if (Number.isNaN(points)) return MASTERY_MIN;
  return Math.min(MASTERY_MAX, Math.max(MASTERY_MIN, Math.round(points)));
}

/** DB stores 0–1; the app reasons in 0–100. */
export function scoreToPoints(score01: number): number {
  return clampMastery(score01 * 100);
}
export function pointsToScore(points: number): number {
  return clampMastery(points) / 100;
}

export function masteryBand(points: number): MasteryBand {
  const p = clampMastery(points);
  for (const band of MASTERY_BANDS) {
    if (p >= band.min && p <= band.max) return band.id;
  }
  return "strong";
}

export function masteryBandLabel(points: number): string {
  const id = masteryBand(points);
  return MASTERY_BANDS.find((b) => b.id === id)?.label ?? "Strong";
}

export interface MasteryUpdateInput {
  currentPoints: number;
  classification: AnswerClassification;
  /** Evaluator correctness 0–1. */
  correctnessScore: number;
  /** Question difficulty 1–5. */
  difficulty: number;
  /** Prior attempts on this concept (before this one). */
  priorAttempts: number;
}

export interface MasteryUpdateResult {
  nextPoints: number;
  delta: number;
  reason: string;
}

/**
 * Bounded mastery update.
 * - CORRECT: gain scales with difficulty, shrinks as mastery approaches 100
 *   (diminishing returns) and as attempts accumulate (anti-grind damping).
 * - PARTIALLY_CORRECT: small gain proportional to correctnessScore.
 * - INCORRECT: loss scales with difficulty; smaller when mastery is already low.
 * - UNCERTAIN: near-neutral nudge.
 */
export function applyMasteryUpdate(
  input: MasteryUpdateInput,
): MasteryUpdateResult {
  const current = clampMastery(input.currentPoints);
  const difficultyFactor = 0.6 + 0.1 * clampDifficulty(input.difficulty); // 0.7..1.1
  const attemptDamping = 1 / (1 + Math.min(input.priorAttempts, 8) * 0.12);

  let delta = 0;
  let reason = "";

  switch (input.classification) {
    case "CORRECT": {
      const headroom = (MASTERY_MAX - current) / MASTERY_MAX; // 0..1
      const base = MAX_GAIN * difficultyFactor * (0.35 + 0.65 * headroom);
      delta = base * attemptDamping;
      reason =
        "Correct answer — mastery increased (bounded, with diminishing returns).";
      break;
    }
    case "PARTIALLY_CORRECT": {
      const base = PARTIAL_MAX_GAIN * clamp01(input.correctnessScore);
      delta = base * attemptDamping;
      reason =
        "Partially correct — small mastery gain proportional to what was right.";
      break;
    }
    case "INCORRECT": {
      const lowMasteryShield = 0.5 + 0.5 * (current / MASTERY_MAX); // 0.5..1
      delta = -MAX_LOSS * difficultyFactor * lowMasteryShield;
      reason =
        "Incorrect answer — mastery decreased (bounded, softer at low mastery).";
      break;
    }
    case "UNCERTAIN": {
      delta = UNCERTAIN_MAX_MOVE * (clamp01(input.correctnessScore) - 0.5) * 2;
      reason = "Evaluation uncertain — near-neutral adjustment.";
      break;
    }
  }

  delta = clampDelta(delta);
  const nextPoints = clampMastery(current + delta);
  return { nextPoints, delta: nextPoints - current, reason };
}

export interface ConfidenceUpdateInput {
  /** Current confidence 0–1. */
  current: number;
  classification: AnswerClassification;
  /** Evaluator's own confidence 0–1. */
  evaluatorConfidence: number;
}

/** Blend current confidence toward a classification-implied target, weighted by evaluator confidence. */
export function applyConfidenceUpdate(input: ConfidenceUpdateInput): number {
  const current = clamp01(input.current);
  const w = 0.25 + 0.4 * clamp01(input.evaluatorConfidence); // 0.25..0.65
  const target =
    input.classification === "CORRECT"
      ? 0.9
      : input.classification === "PARTIALLY_CORRECT"
        ? 0.55
        : input.classification === "INCORRECT"
          ? 0.2
          : current; // UNCERTAIN → hold
  return clamp01(current + (target - current) * w);
}

export function deriveMasteryStatus(input: {
  points: number;
  attempts: number;
  hasRepeatedMisconception: boolean;
}): MasteryStatus {
  if (input.attempts === 0) return "NOT_STARTED";
  if (input.hasRepeatedMisconception) return "NEEDS_RETEACHING";
  const p = clampMastery(input.points);
  if (p >= 86) return "MASTERED";
  if (p >= 51) return "DEVELOPING";
  return "LEARNING";
}

/** Recommended teaching action for a concept, from mastery alone (product rule). */
export function recommendedActionForMastery(points: number): {
  action: string;
  difficultyDirection: DifficultyDirection;
} {
  const p = clampMastery(points);
  if (p >= 86) return { action: "MOVE_FORWARD", difficultyDirection: "HARDER" };
  if (p >= 71)
    return { action: "INCREASE_DIFFICULTY", difficultyDirection: "HARDER" };
  if (p >= 51) return { action: "ASK", difficultyDirection: "SAME" };
  if (p >= 31) return { action: "EXPLAIN", difficultyDirection: "SAME" };
  return { action: "EXPLAIN", difficultyDirection: "EASIER" };
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
function clampDifficulty(d: number): number {
  if (Number.isNaN(d)) return 3;
  return Math.min(5, Math.max(1, Math.round(d)));
}
function clampDelta(d: number): number {
  return Math.min(MAX_GAIN, Math.max(-MAX_LOSS, d));
}
