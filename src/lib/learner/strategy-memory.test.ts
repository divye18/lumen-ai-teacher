import { describe, expect, it } from "vitest";

import type {
  ClientTeachingQuestion,
  InteractionRow,
  TeachingAnswerRow,
} from "@/lib/db/repositories";

import { buildStrategyMemory } from "./strategy-memory";

const base = Date.parse("2026-09-01T10:00:00Z");
const at = (min: number) => new Date(base + min * 60_000).toISOString();

function teach(
  min: number,
  strategy: string,
  conceptKey = "pf",
): InteractionRow {
  return {
    id: `i-${min}`,
    session_id: "s1",
    user_id: "u1",
    concept_id: "c1",
    role: "TEACHER",
    interaction_type: "EXPLANATION",
    content: "…",
    metadata: { strategy, conceptKey },
    created_at: at(min),
  };
}

function question(min: number, conceptKey = "pf"): ClientTeachingQuestion {
  return {
    id: `q-${min}`,
    session_id: "s1",
    lesson_id: "l1",
    user_id: "u1",
    concept_key: conceptKey,
    concept_id: "c1",
    question_kind: "APPLICATION",
    question_format: "FREE_FORM",
    difficulty: 3,
    prompt: "…",
    source_grounded: false,
    citations: [],
    metadata: {},
    created_at: at(min),
  };
}

function answer(
  min: number,
  classification: string,
  qMin: number,
): TeachingAnswerRow {
  return {
    id: `a-${min}`,
    question_id: `q-${qMin}`,
    session_id: "s1",
    user_id: "u1",
    response_text: "…",
    classification,
    correctness_score: classification === "CORRECT" ? 0.9 : 0.3,
    evaluation: {},
    response_time_ms: 9000,
    created_at: at(min),
  };
}

describe("buildStrategyMemory", () => {
  it("attributes an answer to the most recent prior teaching turn on the concept", () => {
    const mem = buildStrategyMemory({
      interactions: [teach(1, "example-first"), teach(10, "formal")],
      questions: [question(2), question(11)],
      answers: [answer(3, "CORRECT", 2), answer(12, "INCORRECT", 11)],
    });
    const ef = mem.outcomes.find((o) => o.strategy === "example-first");
    const fm = mem.outcomes.find((o) => o.strategy === "formal");
    expect(ef).toMatchObject({ exposures: 1, improvements: 1 });
    expect(fm).toMatchObject({ exposures: 1, improvements: 0 });
    expect(mem.evidenceCount).toBe(2);
  });

  it("only names a preferred strategy with enough, clearly-better evidence", () => {
    const weak = buildStrategyMemory({
      interactions: [teach(1, "example-first")],
      questions: [question(2)],
      answers: [answer(3, "CORRECT", 2)],
    });
    expect(weak.preferredStrategy).toBeNull(); // one exposure only

    const strong = buildStrategyMemory({
      interactions: [
        teach(1, "example-first"),
        teach(20, "example-first"),
        teach(40, "example-first"),
        teach(5, "formal"),
        teach(25, "formal"),
      ],
      questions: [
        question(2),
        question(21),
        question(41),
        question(6),
        question(26),
      ],
      answers: [
        answer(3, "CORRECT", 2),
        answer(22, "CORRECT", 21),
        answer(42, "PARTIALLY_CORRECT", 41),
        answer(7, "INCORRECT", 6),
        answer(27, "INCORRECT", 26),
      ],
    });
    expect(strong.preferredStrategy).toBe("example-first");
  });

  it("ignores interactions without a recorded strategy", () => {
    const mem = buildStrategyMemory({
      interactions: [{ ...teach(1, "formal"), metadata: { conceptKey: "pf" } }],
      questions: [question(2)],
      answers: [answer(3, "CORRECT", 2)],
    });
    expect(mem.evidenceCount).toBe(0);
  });
});
