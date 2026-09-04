import { describe, expect, it } from "vitest";

import { pickStructuredQuestion } from "./select";

const memoryHierarchy = {
  conceptKey: "memory-hierarchy",
  title: "Memory hierarchy",
  summary: "Storage layers trade size for speed: registers, cache, RAM, disk.",
  targetKind: "CONCEPTUAL" as const,
  difficulty: 2,
  masteryPoints: 0,
  struggling: false,
  usedPrompts: [],
};

describe("pickStructuredQuestion", () => {
  it("returns an authored bank question for a flagship concept", () => {
    const picked = pickStructuredQuestion(memoryHierarchy);
    expect(picked).not.toBeNull();
    expect(picked!.origin).toBe("bank");
    expect(picked!.question.format).toBeTypeOf("string");
  });

  it("prefers a misconception-targeting question when the learner is struggling", () => {
    const picked = pickStructuredQuestion({
      ...memoryHierarchy,
      targetKind: "SCENARIO",
      masteryPoints: 20,
      struggling: true,
    });
    expect(picked).not.toBeNull();
    const q = picked!.question;
    const hasMisc =
      q.format === "MCQ" && q.data.options.some((o) => o.misconception);
    expect(hasMisc).toBe(true);
  });

  it("does not repeat a prompt already used this session", () => {
    const first = pickStructuredQuestion(memoryHierarchy)!;
    const second = pickStructuredQuestion({
      ...memoryHierarchy,
      usedPrompts: [first.question.prompt],
    })!;
    expect(second.question.prompt).not.toBe(first.question.prompt);
  });

  it("falls back to the grounded template generator once the bank is exhausted", () => {
    // Exhaust the bank by marking every authored prompt used.
    const bankPrompts = [
      "Put these storage layers in order from the fastest the CPU can reach to the slowest.",
      "As you move down the memory hierarchy from registers toward disk, what happens to capacity and access time?",
      "Classify each description by which layer of the hierarchy it best fits.",
      "A CPU needs a value that is not in any cache level. Which statement best describes what happens next?",
    ];
    const picked = pickStructuredQuestion({
      ...memoryHierarchy,
      usedPrompts: bankPrompts,
      graph: {
        prerequisiteTitles: ["Binary Representation"],
        dependentTitles: [],
        otherConceptTitles: ["Cache vs RAM", "Locality", "Pipelining"],
      },
    });
    expect(picked?.origin).toBe("template");
  });

  it("returns null for a concept with no bank entry and no graph", () => {
    expect(
      pickStructuredQuestion({
        conceptKey: "quantum-entanglement",
        title: "Quantum entanglement",
        summary: "Spooky action at a distance.",
        targetKind: "CONCEPTUAL",
        difficulty: 3,
        masteryPoints: 0,
        struggling: false,
        usedPrompts: [],
      }),
    ).toBeNull();
  });

  it("is deterministic for the same inputs", () => {
    const a = pickStructuredQuestion(memoryHierarchy);
    const b = pickStructuredQuestion(memoryHierarchy);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
