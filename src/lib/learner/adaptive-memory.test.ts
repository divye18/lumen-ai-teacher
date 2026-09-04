import { describe, expect, it } from "vitest";

import type {
  ClientTeachingQuestion,
  TeachingAnswerRow,
} from "@/lib/db/repositories";
import { pickStructuredQuestion } from "@/lib/assessment/structured";
import { deriveVisualIntent } from "@/lib/teaching/visual-adaptation";
import { coerceVisualDirective, resolveVisual } from "@/lib/visuals";

import { deriveLearningProfile } from "./learning-profile";
import { personalizeTeaching } from "./personalization-policy";
import type { StrategyMemory } from "./strategy-memory";

/**
 * ADAPTIVE TEACHER MEMORY — the behavioural scenarios from the milestone spec.
 * Each drives the real pipeline: evidence -> deriveLearningProfile ->
 * personalizeTeaching -> the existing resolver / question selector.
 */

const EMPTY_MEMORY: StrategyMemory = {
  outcomes: [],
  preferredStrategy: null,
  evidenceCount: 0,
};

let clock = 0;
const at = () =>
  new Date(Date.UTC(2026, 0, 1, 0, 0, (clock += 1))).toISOString();

function q(
  id: string,
  over: Partial<ClientTeachingQuestion> = {},
): ClientTeachingQuestion {
  return {
    id,
    session_id: "s",
    lesson_id: "l",
    user_id: "u",
    concept_key: "cache",
    concept_id: "c",
    question_kind: "CONCEPTUAL",
    question_format: "FREE_FORM",
    difficulty: 3,
    prompt: "…",
    source_grounded: false,
    citations: [],
    metadata: {},
    created_at: at(),
    ...over,
  } as ClientTeachingQuestion;
}

function ans(qid: string, classification: string): TeachingAnswerRow {
  return {
    id: `a-${qid}`,
    question_id: qid,
    session_id: "s",
    user_id: "u",
    response_text: "…",
    classification,
    correctness_score: classification === "CORRECT" ? 0.9 : 0.15,
    evaluation: {},
    response_time_ms: 15000,
    created_at: at(),
  } as TeachingAnswerRow;
}

const NEUTRAL_VISUAL_CTX = {
  masteryPoints: 45,
  previousMasteryPoints: 44,
  repeatedMisconception: false,
  lastClassification: "CORRECT" as string | null,
  incorrectStreak: 0,
  attempts: 3,
  action: "EXPLAIN",
  questionKind: "CONCEPTUAL" as string | null,
  strategy: "conversational",
  conceptImportance: 3,
};

describe("scenario 1 — fails abstract, recovers after concrete examples", () => {
  it("profile detects example-recovery and policy prefers a concrete example", () => {
    const strategyMemory: StrategyMemory = {
      outcomes: [
        {
          strategy: "example-first",
          exposures: 4,
          improvements: 4,
          successRate: 1,
        },
        {
          strategy: "formal",
          exposures: 4,
          improvements: 1,
          successRate: 0.25,
        },
      ],
      preferredStrategy: "example-first",
      evidenceCount: 8,
    };
    const profile = deriveLearningProfile({
      answers: [
        ans("q1", "INCORRECT"),
        ans("q2", "CORRECT"),
        ans("q3", "INCORRECT"),
        ans("q4", "CORRECT"),
        ans("q5", "CORRECT"),
      ],
      questions: [q("q1"), q("q2"), q("q3"), q("q4"), q("q5")],
      interactions: [],
      concepts: [],
      misconceptions: [],
      strategyMemory,
    });
    expect(profile.signals.some((s) => s.kind === "example-recovery")).toBe(
      true,
    );

    const adj = personalizeTeaching(profile);
    expect(adj.preferConcreteExample).toBe(true);
    expect(adj.visualBias).toBe("concrete");
  });
});

describe("scenario 2 — fails ORDER_STEPS but succeeds MCQ", () => {
  it("profile detects the format weakness and question selection targets it", () => {
    const questions = [
      q("m1", { question_format: "MCQ" }),
      q("m2", { question_format: "MCQ" }),
      q("m3", { question_format: "MCQ" }),
      q("o1", { question_format: "ORDER_STEPS" }),
      q("o2", { question_format: "ORDER_STEPS" }),
      q("o3", { question_format: "ORDER_STEPS" }),
    ];
    const answers = [
      ans("m1", "CORRECT"),
      ans("m2", "CORRECT"),
      ans("m3", "CORRECT"),
      ans("o1", "INCORRECT"),
      ans("o2", "INCORRECT"),
      ans("o3", "INCORRECT"),
    ];
    const profile = deriveLearningProfile({
      answers,
      questions,
      interactions: [],
      concepts: [],
      misconceptions: [],
      strategyMemory: EMPTY_MEMORY,
    });
    const adj = personalizeTeaching(profile);
    expect(adj.targetFormatWeakness).toBe("ORDER_STEPS");

    const baseline = pickStructuredQuestion({
      conceptKey: "memory-hierarchy",
      title: "Memory hierarchy",
      summary: "registers, cache, ram, disk",
      targetKind: "CONCEPTUAL",
      difficulty: 2,
      masteryPoints: 55,
      struggling: false,
      usedPrompts: [],
    });
    const targeted = pickStructuredQuestion({
      conceptKey: "memory-hierarchy",
      title: "Memory hierarchy",
      summary: "registers, cache, ram, disk",
      targetKind: "CONCEPTUAL",
      difficulty: 2,
      masteryPoints: 55,
      struggling: false,
      usedPrompts: [],
      preferFormat: adj.targetFormatWeakness,
    });
    expect(baseline?.question.format).toBe("MCQ");
    expect(targeted?.question.format).toBe("ORDER_STEPS");
  });
});

describe("scenario 3 — insufficient history", () => {
  it("yields the baseline policy and makes no claim", () => {
    const profile = deriveLearningProfile({
      answers: [ans("q1", "CORRECT")],
      questions: [q("q1")],
      interactions: [],
      concepts: [],
      misconceptions: [],
      strategyMemory: EMPTY_MEMORY,
    });
    expect(profile.signals).toEqual([]);
    const adj = personalizeTeaching(profile);
    expect(adj.note).toBeNull();
    expect(adj.preferConcreteExample).toBe(false);
    expect(adj.visualBias).toBeNull();
  });
});

describe("scenario 4 — misconception guardrails stay authoritative", () => {
  it("a recurring misconception still forces a reframe, ignoring the personalization bias", () => {
    const r = deriveVisualIntent({
      ...NEUTRAL_VISUAL_CTX,
      repeatedMisconception: true,
      personalizationBias: "concrete",
    });
    expect(r.intent).toBe("reframe");
    expect(r.personalized).toBe(false);
  });

  it("a wrong answer still strips back to concrete, not a personalization connect", () => {
    const r = deriveVisualIntent({
      ...NEUTRAL_VISUAL_CTX,
      lastClassification: "INCORRECT",
      personalizationBias: "connect",
    });
    expect(r.intent).toBe("concrete");
    expect(r.personalized).toBe(false);
  });
});

describe("scenario 5 — personalized visual stays schema-valid", () => {
  it("the biased intent still resolves to a valid visual directive", () => {
    const r = deriveVisualIntent({
      ...NEUTRAL_VISUAL_CTX,
      personalizationBias: "concrete",
    });
    expect(r.personalized).toBe(true);
    expect(r.intent).toBe("concrete");

    const resolved = resolveVisual({
      conceptKey: "cache",
      title: "Cache",
      summary: "A small fast memory close to the CPU.",
      action: "EXPLAIN",
      strategy: "conversational",
      learnerSignal: r.signal,
    });
    const directive = coerceVisualDirective(
      resolved.directive,
      "A small fast memory close to the CPU.",
    );
    expect(directive).toBeTruthy();
    expect(typeof directive.mode).toBe("string");
  });
});
