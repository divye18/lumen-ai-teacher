import { describe, expect, it, vi } from "vitest";

import { ok } from "@/lib/result";
import type { LLMProvider } from "@/lib/ai/types";
import { applyInteractionOutcome } from "@/lib/learner/state-update";

import type { RichAnswerEvaluation } from "./contracts";
import { createTeachingEngine, type TeachingReasoningInput } from "./engine";
import type { PolicyFacts } from "./policy";

function fakeLLM(json: unknown): LLMProvider {
  return {
    id: "fake-llm",
    generate: vi.fn(async () =>
      ok({
        text: JSON.stringify(json),
        model: "fake",
        finishReason: "stop" as const,
      }),
    ),
  };
}

function facts(over: Partial<PolicyFacts> = {}): PolicyFacts {
  return {
    masteryPoints: 45,
    previousMasteryPoints: 45,
    confidence: 0.5,
    attempts: 2,
    correctStreak: 0,
    incorrectStreak: 0,
    hintsRequested: 0,
    repeatedMisconception: false,
    activeMisconceptionCount: 0,
    conceptImportance: 4,
    conceptDifficulty: 3,
    timeRemainingMinutes: 20,
    lastClassification: null,
    lastCorrectnessScore: null,
    currentStrategy: "conversational",
    triedStrategies: [],
    lastQuestionKind: null,
    conceptsRemaining: 2,
    explanationsSinceQuestion: 0,
    ...over,
  };
}

function input(
  over: Partial<TeachingReasoningInput> = {},
): TeachingReasoningInput {
  return {
    facts: facts(),
    concept: {
      key: "page-faults",
      title: "Page Faults",
      summary: "What the OS does when a referenced page is not resident.",
      difficulty: 3,
      importance: 4,
      prerequisites: ["virtual-memory"],
    },
    signal: {
      lastAnswerText: null,
      lastClassification: null,
      lastFeedback: null,
      missingConcepts: [],
      misconceptionSummaries: [],
    },
    language: "en",
    learningGoal: "Understand demand paging",
    sourceGrounded: false,
    ...over,
  };
}

describe("createTeachingEngine — policy-only (no LLM)", () => {
  it("always returns a usable decision and never throws", async () => {
    const engine = createTeachingEngine({ llm: null });
    const d = await engine.decide(input());
    expect(d.action).toBeTypeOf("string");
    expect(d.targetConceptKey).toBe("page-faults");
    expect(d.adaptationNarrative.length).toBeGreaterThan(0);
    expect(d.source).toBe("policy");
  });
});

describe("createTeachingEngine — AI proposal + reconciliation", () => {
  it("accepts a sound proposal", async () => {
    const engine = createTeachingEngine({
      llm: fakeLLM({
        action: "EXPLAIN",
        strategy: "conversational",
        difficultyDirection: "SAME",
        targetConceptKey: "page-faults",
        reason: "Emerging mastery needs a clear explanation.",
        nextAction: "ASK",
      }),
    });
    const d = await engine.decide(
      input({ facts: facts({ masteryPoints: 40 }) }),
    );
    expect(d.action).toBe("EXPLAIN");
    expect(d.source).toBe("ai");
  });

  it("overrides an unsafe proposal (advance while struggling)", async () => {
    const engine = createTeachingEngine({
      llm: fakeLLM({
        action: "MOVE_FORWARD",
        strategy: "conversational",
        difficultyDirection: "HARDER",
        targetConceptKey: "page-faults",
        reason: "Move on.",
        nextAction: null,
      }),
    });
    const d = await engine.decide(
      input({
        facts: facts({
          masteryPoints: 30,
          incorrectStreak: 1,
          lastClassification: "INCORRECT",
        }),
      }),
    );
    expect(d.action).not.toBe("MOVE_FORWARD");
    expect(d.source).toBe("ai+policy");
    expect(d.overrides.length).toBeGreaterThan(0);
  });

  it("falls back to deterministic policy when the model output is malformed", async () => {
    const engine = createTeachingEngine({ llm: fakeLLM({ garbage: true }) });
    const d = await engine.decide(input());
    expect(d.adaptationNarrative.join(" ")).toMatch(/deterministic policy/i);
  });
});

describe("the critical loop — the next action changes with what the student did", () => {
  const priorConcept = {
    masteryScore: 0.5,
    confidenceScore: 0.5,
    attemptCount: 2,
    correctCount: 1,
    incorrectCount: 1,
    misconceptionCount: 0,
    preferredStrategy: "conversational" as const,
  };

  function evaluation(
    over: Partial<RichAnswerEvaluation>,
  ): RichAnswerEvaluation {
    return {
      classification: "CORRECT",
      correctnessScore: 0.9,
      confidence: 0.8,
      reasoningQuality: "sound",
      missingConcepts: [],
      misconceptionCandidates: [],
      feedback: "ok",
      rationale: "ok",
      ...over,
    };
  }

  it("wrong answer lowers mastery and steers toward remediation; right answer raises it and advances", async () => {
    // Engine echoes a neutral proposal so the difference is driven by state.
    const neutral = {
      action: "ASK",
      strategy: "conversational",
      difficultyDirection: "SAME",
      targetConceptKey: "page-faults",
      reason: "check understanding",
      nextAction: null,
    };
    const engine = createTeachingEngine({ llm: fakeLLM(neutral) });

    const wrong = applyInteractionOutcome({
      concept: priorConcept,
      evaluation: evaluation({
        classification: "INCORRECT",
        correctnessScore: 0.1,
        misconceptionCandidates: [
          {
            category: "page-fault-is-a-crash",
            description: "process dies",
            confidence: 0.7,
          },
        ],
      }),
      questionDifficulty: 3,
      strategyUsed: "conversational",
      existingMisconceptions: [],
    });
    const right = applyInteractionOutcome({
      concept: priorConcept,
      evaluation: evaluation({
        classification: "CORRECT",
        correctnessScore: 0.95,
      }),
      questionDifficulty: 3,
      strategyUsed: "conversational",
      existingMisconceptions: [],
    });

    expect(wrong.delta.masteryAfter).toBeLessThan(
      priorConcept.masteryScore * 100,
    );
    expect(right.delta.masteryAfter).toBeGreaterThan(
      priorConcept.masteryScore * 100,
    );

    const afterWrong = await engine.decide(
      input({
        facts: facts({
          masteryPoints: wrong.delta.masteryAfter,
          previousMasteryPoints: wrong.delta.masteryBefore,
          confidence: wrong.masteryPatch.confidenceScore,
          incorrectStreak: 1,
          lastClassification: "INCORRECT",
          activeMisconceptionCount: 1,
        }),
      }),
    );
    const afterRight = await engine.decide(
      input({
        facts: facts({
          masteryPoints: right.delta.masteryAfter,
          previousMasteryPoints: right.delta.masteryBefore,
          confidence: right.masteryPatch.confidenceScore,
          correctStreak: 1,
          lastClassification: "CORRECT",
        }),
      }),
    );

    // The system does something different because of what the learner did.
    expect(afterWrong.action).not.toBe(afterRight.action);
    expect(["HINT", "SIMPLIFY", "EXPLAIN", "RETEACH"]).toContain(
      afterWrong.action,
    );
    expect(["ASK", "ASSESS", "INCREASE_DIFFICULTY", "MOVE_FORWARD"]).toContain(
      afterRight.action,
    );
  });

  it("a repeated misconception forces a strategy switch on the next turn", async () => {
    const engine = createTeachingEngine({
      llm: fakeLLM({
        action: "EXPLAIN",
        strategy: "formal",
        difficultyDirection: "SAME",
        targetConceptKey: "page-faults",
        reason: "explain again",
        nextAction: "ASK",
      }),
    });
    const d = await engine.decide(
      input({
        facts: facts({
          repeatedMisconception: true,
          currentStrategy: "formal",
          triedStrategies: ["formal"],
          lastClassification: "INCORRECT",
        }),
      }),
    );
    expect(d.action).toBe("RETEACH");
    expect(d.strategy).not.toBe("formal");
  });
});
