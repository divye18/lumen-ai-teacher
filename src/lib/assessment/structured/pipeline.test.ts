import { describe, expect, it } from "vitest";

import { applyInteractionOutcome } from "@/lib/learner";

import {
  gradeStructuredAnswer,
  structuredQuestionFromRow,
  toClientStructured,
  type StructuredQuestion,
} from "./index";
import { MISCONCEPTIONS as M } from "./misconceptions";

/**
 * Structured grade → the SAME deterministic learner-state pipeline the LLM
 * evaluator feeds. Proves mastery actually moves and misconceptions are planned
 * — end to end at the state-transition level, no DB.
 */

const question: StructuredQuestion = {
  format: "MCQ",
  kind: "APPLICATION",
  difficulty: 3,
  prompt:
    "A program reuses a small array in a tight loop. What helps, and why?",
  data: {
    options: [
      { id: "a", text: "It stays in cache, so accesses are fast hits" },
      {
        id: "b",
        text: "It is copied to disk to survive iterations",
        misconception: M.CONFUSES_CACHE_WITH_STORAGE,
      },
      { id: "c", text: "Nothing changes" },
    ],
    correctId: "a",
  },
};

const priorConcept = {
  masteryScore: 0.4,
  confidenceScore: 0.45,
  attemptCount: 2,
  correctCount: 1,
  incorrectCount: 1,
  misconceptionCount: 0,
  preferredStrategy: "conversational" as const,
};

describe("structured assessment → learner state", () => {
  it("a correct structured answer raises mastery (bounded)", () => {
    const graded = gradeStructuredAnswer(question, {
      format: "MCQ",
      selectedId: "a",
    });
    const outcome = applyInteractionOutcome({
      concept: priorConcept,
      evaluation: graded,
      questionDifficulty: question.difficulty,
      strategyUsed: "conversational",
      existingMisconceptions: [],
    });
    expect(outcome.delta.masteryAfter).toBeGreaterThan(
      outcome.delta.masteryBefore,
    );
    expect(
      outcome.delta.masteryAfter - outcome.delta.masteryBefore,
    ).toBeLessThanOrEqual(12);
    expect(outcome.misconceptionPlan.creates).toHaveLength(0);
  });

  it("a misconception-distractor answer lowers mastery and plans a misconception", () => {
    const graded = gradeStructuredAnswer(question, {
      format: "MCQ",
      selectedId: "b",
    });
    expect(graded.classification).toBe("INCORRECT");
    const outcome = applyInteractionOutcome({
      concept: priorConcept,
      evaluation: graded,
      questionDifficulty: question.difficulty,
      strategyUsed: "conversational",
      existingMisconceptions: [],
    });
    expect(outcome.delta.masteryAfter).toBeLessThan(
      outcome.delta.masteryBefore,
    );
    expect(outcome.misconceptionPlan.creates).toHaveLength(1);
    expect(outcome.misconceptionPlan.creates[0].category).toContain("cache");
  });

  it("repeating the same misconception escalates it", () => {
    const graded = gradeStructuredAnswer(question, {
      format: "MCQ",
      selectedId: "b",
    });
    const outcome = applyInteractionOutcome({
      concept: priorConcept,
      evaluation: graded,
      questionDifficulty: question.difficulty,
      strategyUsed: "conversational",
      existingMisconceptions: [
        {
          id: "m1",
          category: M.CONFUSES_CACHE_WITH_STORAGE.id,
          description: "prev",
          confidence: 0.6,
          status: "ACTIVE",
          detections: 1,
        },
      ],
    });
    expect(outcome.hasRepeatedMisconception).toBe(true);
    expect(outcome.misconceptionPlan.strengthens).toHaveLength(1);
  });
});

describe("row round-trip", () => {
  it("structuredQuestionFromRow reconstructs a gradeable question", () => {
    const row = {
      question_format: question.format,
      question_kind: question.kind,
      difficulty: question.difficulty,
      prompt: question.prompt,
      answer_key: question.data,
      metadata: {},
    };
    const reconstructed = structuredQuestionFromRow(row);
    expect(reconstructed).not.toBeNull();
    const graded = gradeStructuredAnswer(reconstructed!, {
      format: "MCQ",
      selectedId: "a",
    });
    expect(graded.classification).toBe("CORRECT");
  });

  it("returns null for a malformed stored question", () => {
    expect(
      structuredQuestionFromRow({
        question_format: "MCQ",
        question_kind: "CONCEPTUAL",
        difficulty: 3,
        prompt: "x",
        answer_key: { options: [], correctId: "z" },
        metadata: {},
      }),
    ).toBeNull();
  });

  it("client projection is missing the grading key", () => {
    const client = toClientStructured(question, "seed");
    expect(JSON.stringify(client)).not.toContain("correctId");
    expect(client.mcq?.options).toHaveLength(3);
  });
});
