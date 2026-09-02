import { describe, expect, it } from "vitest";

import { parseTeachingDecision } from "./index";

const base = {
  action: "EXPLAIN",
  reason: "Learner has no prior exposure to the concept.",
  targetConcept: "algebra.linear-equations",
  difficulty: 2,
  language: "en",
  sourceReferences: [],
};

describe("parseTeachingDecision", () => {
  it("accepts a valid EXPLAIN decision", () => {
    const result = parseTeachingDecision(base);
    expect(result.ok).toBe(true);
  });

  it("rejects an out-of-range difficulty", () => {
    const result = parseTeachingDecision({ ...base, difficulty: 9 });
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown action", () => {
    const result = parseTeachingDecision({ ...base, action: "HYPNOTIZE" });
    expect(result.ok).toBe(false);
  });

  it("requires a question for ASK decisions", () => {
    const result = parseTeachingDecision({ ...base, action: "ASK" });
    expect(result.ok).toBe(false);
  });

  it("accepts an ASK decision that includes a question", () => {
    const result = parseTeachingDecision({
      ...base,
      action: "ASK",
      question: "What stays equal when you add the same value to both sides?",
    });
    expect(result.ok).toBe(true);
  });
});
