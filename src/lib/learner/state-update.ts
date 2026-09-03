import type { MasteryStatus, TeachingStyle } from "@/lib/db/enums";
import type { RichAnswerEvaluation } from "@/lib/teaching/contracts";
import {
  applyConfidenceUpdate,
  applyMasteryUpdate,
  deriveMasteryStatus,
  masteryBandLabel,
  pointsToScore,
  scoreToPoints,
} from "@/lib/teaching/mastery";

import {
  planMisconceptionUpdates,
  type ExistingMisconception,
  type MisconceptionUpdatePlan,
} from "./misconception-tracker";

/**
 * LEARNER STATE UPDATE.
 *
 * After every interaction: the LLM supplied a {@link RichAnswerEvaluation};
 * this pure function computes the deterministic, bounded state transition.
 * The product layer owns the numbers — the model never sets mastery.
 */

export interface CurrentConceptState {
  masteryScore: number; // 0–1 (DB scale)
  confidenceScore: number; // 0–1
  attemptCount: number;
  correctCount: number;
  incorrectCount: number;
  misconceptionCount: number;
  preferredStrategy: TeachingStyle | null;
}

export interface InteractionOutcomeInput {
  concept: CurrentConceptState | null;
  evaluation: RichAnswerEvaluation;
  questionDifficulty: number;
  strategyUsed: TeachingStyle;
  existingMisconceptions: ExistingMisconception[];
  nowISO?: string;
}

export interface MasteryPatch {
  masteryScore: number;
  confidenceScore: number;
  attemptCount: number;
  correctCount: number;
  incorrectCount: number;
  misconceptionCount: number;
  status: MasteryStatus;
  preferredStrategy: TeachingStyle;
  lastAttemptAt: string;
  lastCorrectAt?: string;
  evidenceSummary: string;
}

export interface LearnerStateDelta {
  masteryBefore: number; // 0–100
  masteryAfter: number; // 0–100
  masteryBandBefore: string;
  masteryBandAfter: string;
  confidenceBefore: number;
  confidenceAfter: number;
  reason: string;
}

export interface InteractionOutcome {
  masteryPatch: MasteryPatch;
  delta: LearnerStateDelta;
  misconceptionPlan: MisconceptionUpdatePlan;
  hasRepeatedMisconception: boolean;
}

const EMPTY_CONCEPT: CurrentConceptState = {
  masteryScore: 0,
  confidenceScore: 0,
  attemptCount: 0,
  correctCount: 0,
  incorrectCount: 0,
  misconceptionCount: 0,
  preferredStrategy: null,
};

export function applyInteractionOutcome(
  input: InteractionOutcomeInput,
): InteractionOutcome {
  const now = input.nowISO ?? new Date().toISOString();
  const current = input.concept ?? EMPTY_CONCEPT;

  const masteryBefore = scoreToPoints(current.masteryScore);
  const confidenceBefore = current.confidenceScore;
  const cls = input.evaluation.classification;

  const masteryUpdate = applyMasteryUpdate({
    currentPoints: masteryBefore,
    classification: cls,
    correctnessScore: input.evaluation.correctnessScore,
    difficulty: input.questionDifficulty,
    priorAttempts: current.attemptCount,
  });

  const confidenceAfter = applyConfidenceUpdate({
    current: confidenceBefore,
    classification: cls,
    evaluatorConfidence: input.evaluation.confidence,
  });

  const misconceptionPlan = planMisconceptionUpdates({
    candidates: input.evaluation.misconceptionCandidates,
    existing: input.existingMisconceptions,
  });

  const activeAfter =
    input.existingMisconceptions.filter((m) => m.status !== "RESOLVED").length +
    misconceptionPlan.creates.length;

  const attemptCount = current.attemptCount + 1;
  const correctCount = current.correctCount + (cls === "CORRECT" ? 1 : 0);
  const incorrectCount = current.incorrectCount + (cls === "INCORRECT" ? 1 : 0);

  const status = deriveMasteryStatus({
    points: masteryUpdate.nextPoints,
    attempts: attemptCount,
    hasRepeatedMisconception: misconceptionPlan.hasRepeated,
  });

  const patch: MasteryPatch = {
    masteryScore: pointsToScore(masteryUpdate.nextPoints),
    confidenceScore: round3(confidenceAfter),
    attemptCount,
    correctCount,
    incorrectCount,
    misconceptionCount: activeAfter,
    status,
    preferredStrategy: input.strategyUsed,
    lastAttemptAt: now,
    ...(cls === "CORRECT" ? { lastCorrectAt: now } : {}),
    evidenceSummary: buildEvidenceSummary(
      input.evaluation,
      masteryUpdate.nextPoints,
    ),
  };

  const delta: LearnerStateDelta = {
    masteryBefore,
    masteryAfter: masteryUpdate.nextPoints,
    masteryBandBefore: masteryBandLabel(masteryBefore),
    masteryBandAfter: masteryBandLabel(masteryUpdate.nextPoints),
    confidenceBefore: round3(confidenceBefore),
    confidenceAfter: round3(confidenceAfter),
    reason: masteryUpdate.reason,
  };

  return {
    masteryPatch: patch,
    delta,
    misconceptionPlan,
    hasRepeatedMisconception: misconceptionPlan.hasRepeated,
  };
}

function buildEvidenceSummary(
  evaluation: RichAnswerEvaluation,
  points: number,
): string {
  const parts = [
    `${evaluation.classification} (score ${evaluation.correctnessScore.toFixed(
      2,
    )}), reasoning ${evaluation.reasoningQuality}; mastery now ${points}/100.`,
  ];
  if (evaluation.missingConcepts.length > 0) {
    parts.push(`Missing: ${evaluation.missingConcepts.join(", ")}.`);
  }
  return parts.join(" ").slice(0, 4000);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
