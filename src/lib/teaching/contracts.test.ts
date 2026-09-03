import { describe, expect, it } from "vitest";

import {
  engineDecisionSchema,
  generatedQuestionSchema,
  lessonPlanSchema,
  richAnswerEvaluationSchema,
  teachingContentSchema,
} from "./contracts";

const validPlan = {
  objective: "Understand demand paging and page faults.",
  estimatedMinutes: 25,
  assessmentStrategy: "One conceptual then one scenario question per concept.",
  concepts: [
    {
      key: "virtual-memory",
      title: "Virtual Memory",
      summary: "An abstraction giving each process its own address space.",
      difficulty: 2,
      importance: 5,
      prerequisites: [],
    },
    {
      key: "page-faults",
      title: "Page Faults",
      summary: "What happens when a referenced page is not resident in RAM.",
      difficulty: 3,
      importance: 5,
      prerequisites: ["virtual-memory"],
    },
  ],
  sequence: [
    { conceptKey: "virtual-memory", actions: ["EXPLAIN", "ASK"] },
    { conceptKey: "page-faults", actions: ["EXPLAIN", "EXAMPLE", "ASK"] },
  ],
};

describe("lessonPlanSchema", () => {
  it("accepts a well-formed plan", () => {
    expect(lessonPlanSchema.safeParse(validPlan).success).toBe(true);
  });

  it("rejects a prerequisite that is not a concept in the plan", () => {
    const bad = structuredClone(validPlan);
    bad.concepts[1].prerequisites = ["does-not-exist"];
    expect(lessonPlanSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a sequence referencing an unknown concept", () => {
    const bad = structuredClone(validPlan);
    bad.sequence[0].conceptKey = "ghost";
    expect(lessonPlanSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an invalid concept key and an unknown action", () => {
    expect(
      lessonPlanSchema.safeParse({
        ...validPlan,
        concepts: [{ ...validPlan.concepts[0], key: "Not A Key" }],
      }).success,
    ).toBe(false);
    const badAction = structuredClone(validPlan);
    badAction.sequence[0].actions = ["MEDITATE"];
    expect(lessonPlanSchema.safeParse(badAction).success).toBe(false);
  });
});

describe("engineDecisionSchema", () => {
  it("accepts a valid proposal", () => {
    expect(
      engineDecisionSchema.safeParse({
        action: "RETEACH",
        strategy: "analogy-first",
        difficultyDirection: "EASIER",
        targetConceptKey: "page-faults",
        reason: "Learner repeated the same misconception.",
        nextAction: "ASK",
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown action / strategy / direction", () => {
    expect(
      engineDecisionSchema.safeParse({
        action: "NAP",
        strategy: "analogy-first",
        difficultyDirection: "SAME",
        targetConceptKey: "x",
        reason: "y",
      }).success,
    ).toBe(false);
    expect(
      engineDecisionSchema.safeParse({
        action: "ASK",
        strategy: "vibes",
        difficultyDirection: "SAME",
        targetConceptKey: "x",
        reason: "y",
      }).success,
    ).toBe(false);
    expect(
      engineDecisionSchema.safeParse({
        action: "ASK",
        strategy: "formal",
        difficultyDirection: "MUCH_HARDER",
        targetConceptKey: "x",
        reason: "y",
      }).success,
    ).toBe(false);
  });
});

describe("generatedQuestionSchema", () => {
  it("accepts an open-ended question with a rubric", () => {
    expect(
      generatedQuestionSchema.safeParse({
        kind: "SCENARIO",
        difficulty: 3,
        prompt:
          "A program touches an evicted page. Walk through what the OS does and why.",
        expectedReasoning:
          "Mentions trap to kernel, locating page on disk, frame allocation, page-in, PTE update, restart.",
        groundedInSource: false,
      }).success,
    ).toBe(true);
  });
  it("rejects missing rubric or bad kind", () => {
    expect(
      generatedQuestionSchema.safeParse({
        kind: "MCQ",
        difficulty: 3,
        prompt: "x",
        expectedReasoning: "y",
        groundedInSource: false,
      }).success,
    ).toBe(false);
    expect(
      generatedQuestionSchema.safeParse({
        kind: "SCENARIO",
        difficulty: 3,
        prompt: "x",
        groundedInSource: false,
      }).success,
    ).toBe(false);
  });
});

describe("richAnswerEvaluationSchema", () => {
  it("accepts a partial-credit evaluation", () => {
    const parsed = richAnswerEvaluationSchema.safeParse({
      classification: "PARTIALLY_CORRECT",
      correctnessScore: 0.55,
      confidence: 0.7,
      reasoningQuality: "partial",
      missingConcepts: ["frame allocation"],
      misconceptionCandidates: [
        {
          category: "page-fault-is-an-error",
          description: "Thinks a page fault is a program crash.",
          confidence: 0.6,
        },
      ],
      feedback:
        "Good start — you have the trigger right but not what the OS does next.",
      rationale: "Names the trap but omits the page-in path.",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects out-of-range scores and unknown classification", () => {
    expect(
      richAnswerEvaluationSchema.safeParse({
        classification: "MOSTLY",
        correctnessScore: 0.5,
        confidence: 0.5,
        reasoningQuality: "sound",
        feedback: "x",
        rationale: "y",
      }).success,
    ).toBe(false);
    expect(
      richAnswerEvaluationSchema.safeParse({
        classification: "CORRECT",
        correctnessScore: 1.4,
        confidence: 0.5,
        reasoningQuality: "sound",
        feedback: "x",
        rationale: "y",
      }).success,
    ).toBe(false);
  });
});

describe("teachingContentSchema", () => {
  it("validates title + body + grounding flag", () => {
    expect(
      teachingContentSchema.safeParse({
        title: "Page Faults",
        body: "When a process...",
        groundedInSource: true,
      }).success,
    ).toBe(true);
  });
});
