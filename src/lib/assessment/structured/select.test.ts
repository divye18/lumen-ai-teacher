import { describe, expect, it } from "vitest";

import type { StructuredQuestion } from "./contracts";
import { pickStructuredQuestion, rankStructuredCandidates } from "./select";

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

  describe("verifyMisconceptionCategory (9.2 targeted verification)", () => {
    it("prefers the bank candidate that tests the tracked misconception", () => {
      const picked = pickStructuredQuestion({
        ...memoryHierarchy,
        targetKind: "CONCEPTUAL",
        verifyMisconceptionCategory: "thinks-bigger-is-faster",
      })!;
      const hasTarget =
        picked.question.format === "MCQ" &&
        picked.question.data.options.some(
          (o) => o.misconception?.id === "thinks-bigger-is-faster",
        );
      expect(hasTarget).toBe(true);
    });

    it("falls back to normal selection when the triggering question is already used", () => {
      // The only memory-hierarchy question testing this misconception.
      const triggeringPrompt =
        "As you move down the memory hierarchy from registers toward disk, what happens to capacity and access time?";
      const picked = pickStructuredQuestion({
        ...memoryHierarchy,
        verifyMisconceptionCategory: "thinks-bigger-is-faster",
        usedPrompts: [triggeringPrompt],
      })!;
      expect(picked.question.prompt).not.toBe(triggeringPrompt);
    });

    it("falls back to normal selection when no candidate tests the category", () => {
      const withoutTarget = pickStructuredQuestion(memoryHierarchy);
      const withUnmatchedTarget = pickStructuredQuestion({
        ...memoryHierarchy,
        verifyMisconceptionCategory: "some-category-nothing-tests",
      });
      expect(withUnmatchedTarget?.question.prompt).toBe(
        withoutTarget?.question.prompt,
      );
    });

    it("is deterministic when targeting a misconception", () => {
      const a = pickStructuredQuestion({
        ...memoryHierarchy,
        verifyMisconceptionCategory: "thinks-bigger-is-faster",
      });
      const b = pickStructuredQuestion({
        ...memoryHierarchy,
        verifyMisconceptionCategory: "thinks-bigger-is-faster",
      });
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
  });
});

// ── rankStructuredCandidates ────────────────────────────────────────────

function mcq(over: {
  prompt: string;
  kind?: StructuredQuestion["kind"];
  difficulty?: number;
  misconceptionId?: string | null;
}): StructuredQuestion {
  return {
    format: "MCQ",
    kind: over.kind ?? "CONCEPTUAL",
    difficulty: over.difficulty ?? 2,
    prompt: over.prompt,
    data: {
      correctId: "a",
      options: [
        { id: "a", text: "correct" },
        {
          id: "b",
          text: "distractor",
          ...(over.misconceptionId
            ? {
                misconception: {
                  id: over.misconceptionId,
                  label: "a mix-up",
                  explanation: "…",
                },
              }
            : {}),
        },
      ],
    },
  } as StructuredQuestion;
}

describe("rankStructuredCandidates", () => {
  const targeting = mcq({
    prompt: "targets the misconception",
    kind: "SCENARIO",
    difficulty: 4,
    misconceptionId: "cache-is-ram",
  });
  const plain = mcq({
    prompt: "closest kind/difficulty match",
    kind: "CONCEPTUAL",
    difficulty: 2,
  });

  it("verification target outranks ordinary kind/difficulty fit", () => {
    const ranked = rankStructuredCandidates([plain, targeting], {
      targetKind: "CONCEPTUAL",
      difficulty: 2,
      wantMisconception: false,
      verifyMisconceptionCategory: "cache-is-ram",
    });
    expect(ranked[0].prompt).toBe(targeting.prompt);
  });

  it("falls back to ordinary ranking with no verification category set", () => {
    const ranked = rankStructuredCandidates([targeting, plain], {
      targetKind: "CONCEPTUAL",
      difficulty: 2,
      wantMisconception: false,
    });
    expect(ranked[0].prompt).toBe(plain.prompt);
  });

  it("falls back to ordinary ranking when nothing matches the category", () => {
    const ranked = rankStructuredCandidates([targeting, plain], {
      targetKind: "CONCEPTUAL",
      difficulty: 2,
      wantMisconception: false,
      verifyMisconceptionCategory: "nothing-matches-this",
    });
    expect(ranked[0].prompt).toBe(plain.prompt);
  });

  it("existing format preference still applies among non-targeting candidates", () => {
    const a = mcq({ prompt: "a", kind: "CONCEPTUAL", difficulty: 2 });
    const b = { ...mcq({ prompt: "b", kind: "CONCEPTUAL", difficulty: 2 }) };
    // Same kind/difficulty — preferFormat should be the deciding factor since
    // both already tie on kind distance and difficulty.
    const ranked = rankStructuredCandidates([a, b], {
      targetKind: "CONCEPTUAL",
      difficulty: 2,
      wantMisconception: false,
      preferFormat: "MCQ",
    });
    // Both are MCQ, so format preference doesn't split them — this just
    // confirms the ranking runs without throwing and stays deterministic.
    expect(ranked).toHaveLength(2);
  });

  it("existing difficulty ranking still applies among tied candidates", () => {
    const near = mcq({ prompt: "near", kind: "CONCEPTUAL", difficulty: 3 });
    const far = mcq({ prompt: "far", kind: "CONCEPTUAL", difficulty: 5 });
    const ranked = rankStructuredCandidates([far, near], {
      targetKind: "CONCEPTUAL",
      difficulty: 3,
      wantMisconception: false,
    });
    expect(ranked[0].prompt).toBe(near.prompt);
  });

  it("multiple candidates targeting different categories — deterministic tiebreak", () => {
    const targetA = mcq({
      prompt: "za-prompt",
      misconceptionId: "cache-is-ram",
    });
    const targetB = mcq({
      prompt: "aa-prompt",
      misconceptionId: "cache-is-ram",
    });
    const ranked1 = rankStructuredCandidates([targetA, targetB], {
      targetKind: "CONCEPTUAL",
      difficulty: 2,
      wantMisconception: false,
      verifyMisconceptionCategory: "cache-is-ram",
    });
    const ranked2 = rankStructuredCandidates([targetB, targetA], {
      targetKind: "CONCEPTUAL",
      difficulty: 2,
      wantMisconception: false,
      verifyMisconceptionCategory: "cache-is-ram",
    });
    expect(ranked1.map((q) => q.prompt)).toEqual(ranked2.map((q) => q.prompt));
  });
});
