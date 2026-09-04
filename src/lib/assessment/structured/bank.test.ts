import { describe, expect, it } from "vitest";

import { ASSESSMENT_BANK } from "./bank";
import {
  structuredQuestionSchema,
  toClientStructured,
  misconceptionRefSchema,
} from "./contracts";
import { MISCONCEPTIONS } from "./misconceptions";

const allQuestions = ASSESSMENT_BANK.flatMap((e) =>
  e.questions.map((q) => ({ entry: e.id, q })),
);

describe("assessment bank", () => {
  it("every question passes the structured schema", () => {
    for (const { entry, q } of allQuestions) {
      const parsed = structuredQuestionSchema.safeParse(q);
      expect(parsed.success, `${entry}: "${q.prompt}"`).toBe(true);
    }
  });

  it("covers the flagship concepts across formats and difficulty", () => {
    const ids = ASSESSMENT_BANK.map((e) => e.id);
    for (const need of [
      "memory-hierarchy",
      "cache-vs-ram",
      "cache-hits-and-misses",
      "locality",
      "call-stack",
      "tcp-congestion",
      "virtual-memory",
    ]) {
      expect(ids).toContain(need);
    }
    // at least 3 distinct formats used across the bank
    const formats = new Set(allQuestions.map(({ q }) => q.format));
    expect(formats.size).toBeGreaterThanOrEqual(4);
  });

  it("every entry has at least one misconception-targeting question", () => {
    for (const entry of ASSESSMENT_BANK) {
      const hasMisc = entry.questions.some((q) => {
        switch (q.format) {
          case "MCQ":
          case "MULTI_SELECT":
            return q.data.options.some((o) => o.misconception);
          case "TRUE_FALSE":
            return Boolean(q.data.misconception);
          case "CLASSIFY":
            return q.data.items.some((i) => i.misconception);
          case "MATCH_RELATIONSHIP":
            return Boolean(q.data.misconceptionByLeft);
          default:
            return false;
        }
      });
      expect(hasMisc, `${entry.id} has no misconception distractor`).toBe(true);
    }
  });

  it("every referenced misconception is a well-formed taxonomy entry", () => {
    const knownIds = new Set(Object.values(MISCONCEPTIONS).map((m) => m.id));
    for (const { q } of allQuestions) {
      const refs = collectMisconceptions(q);
      for (const ref of refs) {
        expect(misconceptionRefSchema.safeParse(ref).success).toBe(true);
        expect(knownIds.has(ref.id)).toBe(true);
        // never a bare taxonomy id in the learner-facing text
        expect(ref.label).not.toMatch(/[A-Z_]{6,}/);
        expect(ref.explanation.length).toBeGreaterThan(20);
      }
    }
  });

  it("the client projection never leaks the answer key or misconceptions", () => {
    for (const { q } of allQuestions) {
      const client = toClientStructured(q, "seed-123");
      const json = JSON.stringify(client);
      // no misconception explanation text
      for (const ref of collectMisconceptions(q)) {
        expect(json).not.toContain(ref.explanation);
        expect(json).not.toContain(ref.id);
      }
      // no correctId / correctOrder / correctBucketId / correctPairs
      expect(json).not.toMatch(
        /correctId|correctOrder|correctBucketId|correctPairs/,
      );
    }
  });

  it("toClientStructured is deterministic for a given seed", () => {
    for (const { q } of allQuestions) {
      const a = JSON.stringify(toClientStructured(q, "abc"));
      const b = JSON.stringify(toClientStructured(q, "abc"));
      expect(a).toBe(b);
    }
  });
});

function collectMisconceptions(q: (typeof allQuestions)[number]["q"]) {
  const out: { id: string; label: string; explanation: string }[] = [];
  switch (q.format) {
    case "MCQ":
    case "MULTI_SELECT":
      for (const o of q.data.options)
        if (o.misconception) out.push(o.misconception);
      break;
    case "TRUE_FALSE":
      if (q.data.misconception) out.push(q.data.misconception);
      break;
    case "CLASSIFY":
      for (const i of q.data.items)
        if (i.misconception) out.push(i.misconception);
      break;
    case "MATCH_RELATIONSHIP":
      if (q.data.misconceptionByLeft)
        out.push(...Object.values(q.data.misconceptionByLeft));
      break;
  }
  return out;
}
