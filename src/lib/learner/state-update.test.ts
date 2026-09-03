import { describe, expect, it } from "vitest";

import type { RichAnswerEvaluation } from "@/lib/teaching/contracts";

import { applyInteractionOutcome } from "./state-update";
import type { ExistingMisconception } from "./misconception-tracker";

function evaluation(
  over: Partial<RichAnswerEvaluation> = {},
): RichAnswerEvaluation {
  return {
    classification: "CORRECT",
    correctnessScore: 0.95,
    confidence: 0.8,
    reasoningQuality: "sound",
    missingConcepts: [],
    misconceptionCandidates: [],
    feedback: "Nice work.",
    rationale: "All required points present.",
    ...over,
  };
}

const concept = {
  masteryScore: 0.5,
  confidenceScore: 0.5,
  attemptCount: 2,
  correctCount: 1,
  incorrectCount: 1,
  misconceptionCount: 0,
  preferredStrategy: "conversational" as const,
};

describe("applyInteractionOutcome", () => {
  it("CORRECT: mastery up, confidence up, correct + attempt counters up", () => {
    const out = applyInteractionOutcome({
      concept,
      evaluation: evaluation({ classification: "CORRECT" }),
      questionDifficulty: 3,
      strategyUsed: "conversational",
      existingMisconceptions: [],
    });
    expect(out.delta.masteryAfter).toBeGreaterThan(out.delta.masteryBefore);
    expect(out.delta.confidenceAfter).toBeGreaterThan(
      out.delta.confidenceBefore,
    );
    expect(out.masteryPatch.attemptCount).toBe(3);
    expect(out.masteryPatch.correctCount).toBe(2);
    expect(out.masteryPatch.incorrectCount).toBe(1);
    expect(out.masteryPatch.lastCorrectAt).toBeTypeOf("string");
  });

  it("INCORRECT: mastery down, incorrect counter up, misconception candidate created", () => {
    const out = applyInteractionOutcome({
      concept,
      evaluation: evaluation({
        classification: "INCORRECT",
        correctnessScore: 0.1,
        confidence: 0.75,
        misconceptionCandidates: [
          {
            category: "page-fault-is-a-crash",
            description: "Thinks the process dies.",
            confidence: 0.7,
          },
        ],
      }),
      questionDifficulty: 3,
      strategyUsed: "conversational",
      existingMisconceptions: [],
    });
    expect(out.delta.masteryAfter).toBeLessThan(out.delta.masteryBefore);
    expect(out.masteryPatch.incorrectCount).toBe(2);
    expect(out.masteryPatch.lastCorrectAt).toBeUndefined();
    expect(out.misconceptionPlan.creates).toHaveLength(1);
    expect(out.masteryPatch.misconceptionCount).toBe(1);
  });

  it("PARTIALLY_CORRECT: small gain, neither correct nor incorrect counter moves", () => {
    const out = applyInteractionOutcome({
      concept,
      evaluation: evaluation({
        classification: "PARTIALLY_CORRECT",
        correctnessScore: 0.5,
      }),
      questionDifficulty: 3,
      strategyUsed: "conversational",
      existingMisconceptions: [],
    });
    expect(out.delta.masteryAfter).toBeGreaterThanOrEqual(
      out.delta.masteryBefore,
    );
    expect(out.masteryPatch.correctCount).toBe(1);
    expect(out.masteryPatch.incorrectCount).toBe(1);
  });

  it("repeated misconception → NEEDS_RETEACHING and repeated flag", () => {
    const existing: ExistingMisconception[] = [
      {
        id: "m1",
        category: "page-fault-is-a-crash",
        description: "Thinks the process dies on a page fault.",
        confidence: 0.6,
        status: "ACTIVE",
        detections: 1,
      },
    ];
    const out = applyInteractionOutcome({
      concept: { ...concept, masteryScore: 0.7 },
      evaluation: evaluation({
        classification: "INCORRECT",
        correctnessScore: 0.2,
        misconceptionCandidates: [
          {
            category: "page fault is a crash",
            description: "Still says the process dies.",
            confidence: 0.7,
          },
        ],
      }),
      questionDifficulty: 3,
      strategyUsed: "formal",
      existingMisconceptions: existing,
    });
    expect(out.hasRepeatedMisconception).toBe(true);
    expect(out.masteryPatch.status).toBe("NEEDS_RETEACHING");
    expect(out.misconceptionPlan.strengthens).toHaveLength(1);
  });

  it("records the strategy that was used as the preferred strategy", () => {
    const out = applyInteractionOutcome({
      concept,
      evaluation: evaluation(),
      questionDifficulty: 2,
      strategyUsed: "analogy-first",
      existingMisconceptions: [],
    });
    expect(out.masteryPatch.preferredStrategy).toBe("analogy-first");
  });

  it("handles a first-ever attempt (no prior concept row)", () => {
    const out = applyInteractionOutcome({
      concept: null,
      evaluation: evaluation({ classification: "CORRECT" }),
      questionDifficulty: 2,
      strategyUsed: "conversational",
      existingMisconceptions: [],
    });
    expect(out.delta.masteryBefore).toBe(0);
    expect(out.masteryPatch.attemptCount).toBe(1);
    expect(out.masteryPatch.status).not.toBe("NOT_STARTED");
  });
});
