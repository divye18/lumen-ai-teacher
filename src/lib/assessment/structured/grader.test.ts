import { describe, expect, it } from "vitest";

import { gradeStructuredAnswer } from "./grader";
import type { StructuredAnswer, StructuredQuestion } from "./contracts";
import { structuredQuestionSchema } from "./contracts";
import { MISCONCEPTIONS as M } from "./misconceptions";

const mcq: StructuredQuestion = {
  format: "MCQ",
  kind: "CONCEPTUAL",
  difficulty: 3,
  prompt: "Why is L1 cache checked before RAM?",
  data: {
    options: [
      { id: "a", text: "Smaller and built from faster circuitry" },
      {
        id: "b",
        text: "RAM is physically further away",
        misconception: M.CONFUSES_PROXIMITY_WITH_LATENCY,
      },
      { id: "c", text: "RAM can only be read once" },
    ],
    correctId: "a",
  },
};

describe("gradeStructuredAnswer — MCQ", () => {
  it("scores an exact correct choice as CORRECT / 1.0", () => {
    const r = gradeStructuredAnswer(mcq, { format: "MCQ", selectedId: "a" });
    expect(r.classification).toBe("CORRECT");
    expect(r.correctnessScore).toBe(1);
    expect(r.misconceptionCandidates).toEqual([]);
    expect(r.misconceptionInsight).toBeNull();
    expect(r.source).toBe("structured");
  });

  it("scores a wrong choice as INCORRECT / 0 and surfaces its misconception", () => {
    const r = gradeStructuredAnswer(mcq, { format: "MCQ", selectedId: "b" });
    expect(r.classification).toBe("INCORRECT");
    expect(r.correctnessScore).toBe(0);
    expect(r.misconceptionCandidates[0].category).toBe(
      M.CONFUSES_PROXIMITY_WITH_LATENCY.id,
    );
    expect(r.misconceptionInsight?.explanation).toContain("faster circuitry");
  });

  it("does not double the period when the correct option text already ends with one", () => {
    const q: StructuredQuestion = {
      ...mcq,
      data: {
        options: [
          { id: "a", text: "Capacity grows and access time grows (slower)." },
          { id: "b", text: "Bigger and faster." },
        ],
        correctId: "a",
      },
    };
    const r = gradeStructuredAnswer(q, { format: "MCQ", selectedId: "b" });
    expect(r.feedback).toContain("(slower).");
    expect(r.feedback).not.toContain("..");
  });

  it("a wrong choice without a misconception maps nothing", () => {
    const r = gradeStructuredAnswer(mcq, { format: "MCQ", selectedId: "c" });
    expect(r.classification).toBe("INCORRECT");
    expect(r.misconceptionCandidates).toEqual([]);
  });

  it("is deterministic", () => {
    const a = gradeStructuredAnswer(mcq, { format: "MCQ", selectedId: "b" });
    const b = gradeStructuredAnswer(mcq, { format: "MCQ", selectedId: "b" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

const multi: StructuredQuestion = {
  format: "MULTI_SELECT",
  kind: "SCENARIO",
  difficulty: 4,
  prompt: "Select every change that reduces AMAT.",
  data: {
    options: [
      { id: "a", text: "Lower miss rate" },
      { id: "b", text: "Lower miss penalty" },
      { id: "c", text: "More predictable access" },
      {
        id: "d",
        text: "Higher miss rate",
        misconception: M.THINKS_MISS_IS_CHEAP,
      },
      { id: "e", text: "Make every access a miss" },
    ],
    correctIds: ["a", "b", "c"],
  },
};

describe("gradeStructuredAnswer — MULTI_SELECT", () => {
  it("exact match is CORRECT", () => {
    const r = gradeStructuredAnswer(multi, {
      format: "MULTI_SELECT",
      selectedIds: ["c", "a", "b"],
    });
    expect(r.classification).toBe("CORRECT");
    expect(r.correctnessScore).toBe(1);
  });

  it("all-correct-but-one-missing is PARTIALLY_CORRECT", () => {
    const r = gradeStructuredAnswer(multi, {
      format: "MULTI_SELECT",
      selectedIds: ["a", "b"],
    });
    expect(r.classification).toBe("PARTIALLY_CORRECT");
    expect(r.correctnessScore).toBeGreaterThan(0);
    expect(r.correctnessScore).toBeLessThan(1);
  });

  it("an extra wrong pick with a misconception is surfaced and penalised", () => {
    const r = gradeStructuredAnswer(multi, {
      format: "MULTI_SELECT",
      selectedIds: ["a", "b", "c", "d"],
    });
    expect(r.misconceptionCandidates[0].category).toBe(
      M.THINKS_MISS_IS_CHEAP.id,
    );
    expect(r.correctnessScore).toBeLessThan(1);
  });

  it("an empty selection scores 0", () => {
    const r = gradeStructuredAnswer(multi, {
      format: "MULTI_SELECT",
      selectedIds: [],
    });
    expect(r.correctnessScore).toBe(0);
    expect(r.classification).toBe("INCORRECT");
  });
});

const tf: StructuredQuestion = {
  format: "TRUE_FALSE",
  kind: "CONCEPTUAL",
  difficulty: 2,
  prompt: "True or false?",
  data: {
    statement: "Cache permanently stores data.",
    answer: false,
    misconception: M.CONFUSES_CACHE_WITH_STORAGE,
  },
};

describe("gradeStructuredAnswer — TRUE_FALSE", () => {
  it("exact boolean match", () => {
    expect(
      gradeStructuredAnswer(tf, { format: "TRUE_FALSE", value: false })
        .classification,
    ).toBe("CORRECT");
  });
  it("wrong boolean surfaces the misconception", () => {
    const r = gradeStructuredAnswer(tf, { format: "TRUE_FALSE", value: true });
    expect(r.classification).toBe("INCORRECT");
    expect(r.misconceptionInsight?.label).toContain("permanent storage");
  });
});

const order: StructuredQuestion = {
  format: "ORDER_STEPS",
  kind: "APPLICATION",
  difficulty: 3,
  prompt: "Order the cache-miss steps.",
  data: {
    items: [
      { id: "s1", text: "ask cache" },
      { id: "s2", text: "miss" },
      { id: "s3", text: "fetch" },
      { id: "s4", text: "cache it" },
      { id: "s5", text: "deliver" },
    ],
    correctOrder: ["s1", "s2", "s3", "s4", "s5"],
  },
};

describe("gradeStructuredAnswer — ORDER_STEPS", () => {
  it("exact order is CORRECT", () => {
    const r = gradeStructuredAnswer(order, {
      format: "ORDER_STEPS",
      order: ["s1", "s2", "s3", "s4", "s5"],
    });
    expect(r.classification).toBe("CORRECT");
    expect(r.correctnessScore).toBe(1);
  });
  it("one adjacent swap is PARTIALLY_CORRECT with a high-ish score", () => {
    const r = gradeStructuredAnswer(order, {
      format: "ORDER_STEPS",
      order: ["s1", "s2", "s4", "s3", "s5"],
    });
    expect(r.classification).toBe("PARTIALLY_CORRECT");
    expect(r.correctnessScore).toBeGreaterThan(0.5);
  });
  it("fully reversed is INCORRECT", () => {
    const r = gradeStructuredAnswer(order, {
      format: "ORDER_STEPS",
      order: ["s5", "s4", "s3", "s2", "s1"],
    });
    expect(r.classification).toBe("INCORRECT");
  });
});

const classify: StructuredQuestion = {
  format: "CLASSIFY",
  kind: "CONCEPTUAL",
  difficulty: 3,
  prompt: "Sort each pattern.",
  data: {
    buckets: [
      { id: "t", text: "Temporal" },
      { id: "s", text: "Spatial" },
    ],
    items: [
      {
        id: "i1",
        text: "loop counter",
        correctBucketId: "t",
        misconception: M.CONFUSES_TEMPORAL_SPATIAL,
      },
      { id: "i2", text: "array walk", correctBucketId: "s" },
      { id: "i3", text: "hot function", correctBucketId: "t" },
      { id: "i4", text: "struct fields", correctBucketId: "s" },
    ],
  },
};

describe("gradeStructuredAnswer — CLASSIFY", () => {
  it("all correct is CORRECT", () => {
    const r = gradeStructuredAnswer(classify, {
      format: "CLASSIFY",
      assignments: { i1: "t", i2: "s", i3: "t", i4: "s" },
    });
    expect(r.classification).toBe("CORRECT");
  });
  it("half correct is PARTIALLY_CORRECT and names a misconception", () => {
    const r = gradeStructuredAnswer(classify, {
      format: "CLASSIFY",
      assignments: { i1: "s", i2: "t", i3: "t", i4: "s" },
    });
    expect(r.classification).toBe("PARTIALLY_CORRECT");
    expect(r.correctnessScore).toBeCloseTo(0.5);
    expect(r.misconceptionCandidates[0].category).toBe(
      M.CONFUSES_TEMPORAL_SPATIAL.id,
    );
  });
});

const match: StructuredQuestion = {
  format: "MATCH_RELATIONSHIP",
  kind: "APPLICATION",
  difficulty: 3,
  prompt: "Match properties to stack or heap.",
  data: {
    left: [
      { id: "auto", text: "freed automatically" },
      { id: "manual", text: "freed explicitly" },
      { id: "lifo", text: "one end only" },
    ],
    right: [
      { id: "stack", text: "Stack" },
      { id: "heap", text: "Heap" },
    ],
    correctPairs: [
      { leftId: "auto", rightId: "stack" },
      { leftId: "manual", rightId: "heap" },
      { leftId: "lifo", rightId: "stack" },
    ],
    misconceptionByLeft: { auto: M.CONFUSES_STACK_HEAP_LIFETIME },
  },
};

describe("gradeStructuredAnswer — MATCH_RELATIONSHIP", () => {
  it("all pairs correct is CORRECT", () => {
    const r = gradeStructuredAnswer(match, {
      format: "MATCH_RELATIONSHIP",
      pairs: [
        { leftId: "auto", rightId: "stack" },
        { leftId: "manual", rightId: "heap" },
        { leftId: "lifo", rightId: "stack" },
      ],
    });
    expect(r.classification).toBe("CORRECT");
  });
  it("a wrong pair with a mapped misconception is surfaced", () => {
    const r = gradeStructuredAnswer(match, {
      format: "MATCH_RELATIONSHIP",
      pairs: [
        { leftId: "auto", rightId: "heap" },
        { leftId: "manual", rightId: "heap" },
        { leftId: "lifo", rightId: "stack" },
      ],
    });
    expect(r.classification).toBe("PARTIALLY_CORRECT");
    expect(r.misconceptionCandidates[0].category).toBe(
      M.CONFUSES_STACK_HEAP_LIFETIME.id,
    );
  });
});

describe("gradeStructuredAnswer — invalid input", () => {
  it("rejects a format mismatch as INCORRECT, not a crash", () => {
    const r = gradeStructuredAnswer(mcq, {
      format: "TRUE_FALSE",
      value: true,
    } as StructuredAnswer);
    expect(r.classification).toBe("INCORRECT");
    expect(r.correctnessScore).toBe(0);
  });
});

describe("every bank-shaped question is schema-valid", () => {
  it("all fixture questions in this file pass structuredQuestionSchema", () => {
    for (const q of [mcq, multi, tf, order, classify, match]) {
      expect(structuredQuestionSchema.safeParse(q).success).toBe(true);
    }
  });
});
