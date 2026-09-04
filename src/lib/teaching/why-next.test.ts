import { describe, expect, it } from "vitest";

import { explainNextStep, type ExplainNextStepInput } from "./why-next";
import type { PolicyFacts } from "./policy";

function facts(over: Partial<PolicyFacts> = {}): ExplainNextStepInput["facts"] {
  return {
    masteryPoints: 40,
    previousMasteryPoints: 40,
    confidence: 0.5,
    lastClassification: null,
    correctStreak: 0,
    incorrectStreak: 0,
    repeatedMisconception: false,
    activeMisconceptionCount: 0,
    explanationsSinceQuestion: 0,
    ...over,
  };
}

function input(over: Partial<ExplainNextStepInput> = {}): ExplainNextStepInput {
  return {
    action: "ASK",
    difficultyDirection: "SAME",
    facts: facts(over.facts),
    conceptTitle: "Cache",
    ...over,
  };
}

describe("explainNextStep", () => {
  it("explains MOVE_FORWARD with the target concept and strong-mastery reason", () => {
    const e = explainNextStep(
      input({
        action: "MOVE_FORWARD",
        nextConceptTitle: "RAM",
        facts: facts({ masteryPoints: 78 }),
      }),
    );
    expect(e.headline).toContain("RAM");
    expect(e.reason).toMatch(/strong|ready to build/i);
  });

  it("explains a harder question after mastery recovered", () => {
    const e = explainNextStep(
      input({
        action: "INCREASE_DIFFICULTY",
        difficultyDirection: "HARDER",
        facts: facts({ masteryPoints: 64, previousMasteryPoints: 52 }),
      }),
    );
    expect(e.headline).toMatch(/challenge/i);
    expect(e.reason).toContain("64/100");
  });

  it("explains a recurring-misconception reteach with the recurrence count", () => {
    const e = explainNextStep(
      input({
        action: "RETEACH",
        facts: facts({ repeatedMisconception: true }),
        misconceptionDetectionCount: 2,
      }),
    );
    expect(e.reason).toMatch(/same misconception/i);
    expect(e.reason).toMatch(/twice/i);
  });

  it("stays on the concept after an uncertain answer", () => {
    const e = explainNextStep(
      input({
        action: "ASK",
        facts: facts({ lastClassification: "PARTIALLY_CORRECT" }),
      }),
    );
    expect(e.headline).toMatch(/staying with cache/i);
    expect(e.reason).toMatch(/uncertainty/i);
  });

  it("moves to application after a strong answer", () => {
    const e = explainNextStep(
      input({
        action: "ASK",
        nextActionKind: "teaching",
        facts: facts({ lastClassification: "CORRECT", correctStreak: 2 }),
      }),
    );
    expect(e.reason).toMatch(/apply/i);
  });

  it("leads with a weak prerequisite when the graph flags one", () => {
    const e = explainNextStep(
      input({
        action: "EXPLAIN",
        weakPrerequisiteTitle: "Memory hierarchy",
      }),
    );
    expect(e.headline).toContain("Memory hierarchy");
    expect(e.reason).toMatch(/builds directly on/i);
  });

  it("is deterministic", () => {
    const i = input({ action: "EXAMPLE", facts: facts({ masteryPoints: 20 }) });
    expect(JSON.stringify(explainNextStep(i))).toBe(
      JSON.stringify(explainNextStep(i)),
    );
  });

  it("never leaks internal policy vocabulary", () => {
    for (const action of [
      "ASK",
      "ASSESS",
      "RETEACH",
      "SIMPLIFY",
      "EXPLAIN",
      "MOVE_FORWARD",
      "RECAP",
      "INCREASE_DIFFICULTY",
    ] as const) {
      const e = explainNextStep(input({ action }));
      const text = `${e.headline} ${e.reason}`;
      expect(text).not.toMatch(
        /policy|reconcile|baseline|override|chain|token/i,
      );
      expect(e.headline.length).toBeLessThan(48);
      expect(e.reason.length).toBeLessThan(160);
    }
  });
});
