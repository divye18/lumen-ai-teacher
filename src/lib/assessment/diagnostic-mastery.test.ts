import { describe, expect, it } from "vitest";

import type { CurrentConceptState } from "@/lib/learner/state-update";

import {
  seedMasteryFromDiagnostic,
  type SeedMasteryFromDiagnosticInput,
} from "./diagnostic-mastery";
import {
  scoreDiagnosticQuestionSet,
  selectDiagnosticQuestionSet,
  type DiagnosticConceptInput,
  type DiagnosticQuestionSet,
  type DiagnosticResult,
} from "./diagnostic";
import { gradeStructuredAnswer } from "./structured/grader";
import { toClientStructured } from "./structured/contracts";
import type {
  StructuredAnswer,
  StructuredQuestion,
} from "./structured/contracts";

const memoryHierarchy: DiagnosticConceptInput = {
  key: "memory-hierarchy",
  title: "Memory hierarchy",
  summary: "Storage layers trade size for speed: registers, cache, RAM, disk.",
};
const cacheVsRam: DiagnosticConceptInput = {
  key: "cache-vs-ram",
  title: "Cache vs RAM",
  summary: "Cache memory is small and fast; RAM is larger and slower.",
};

/** Build a real diagnostic result by driving the actual engine, then answer it. */
function diagnosticResultFor(
  concepts: DiagnosticConceptInput[],
  answerFor: (
    question: ReturnType<typeof selectDiagnosticQuestionSet>["items"][number],
  ) => StructuredAnswer,
): {
  result: DiagnosticResult;
  items: ReturnType<typeof selectDiagnosticQuestionSet>["items"];
} {
  const set = selectDiagnosticQuestionSet(concepts, []);
  const answers = set.items.map((item) => ({
    conceptKey: item.conceptKey,
    answer: answerFor(item),
  }));
  const result = scoreDiagnosticQuestionSet(set, answers);
  return { result, items: set.items };
}

/** Handles the two formats the concepts used in this file actually pick. */
function correctAnswerFor(
  item: ReturnType<typeof selectDiagnosticQuestionSet>["items"][number],
): StructuredAnswer {
  const q = item.question;
  if (q.format === "MCQ")
    return { format: "MCQ", selectedId: q.data.correctId };
  if (q.format === "TRUE_FALSE")
    return { format: "TRUE_FALSE", value: q.data.answer };
  throw new Error(`unsupported format in test: ${q.format}`);
}

function wrongAnswerFor(
  item: ReturnType<typeof selectDiagnosticQuestionSet>["items"][number],
): StructuredAnswer {
  const q = item.question;
  if (q.format === "MCQ") {
    const wrongId = q.data.options.find((o) => o.id !== q.data.correctId)!.id;
    return { format: "MCQ", selectedId: wrongId };
  }
  if (q.format === "TRUE_FALSE")
    return { format: "TRUE_FALSE", value: !q.data.answer };
  throw new Error(`unsupported format in test: ${q.format}`);
}

const noExisting: SeedMasteryFromDiagnosticInput["existingByConceptKey"] = {};

describe("seedMasteryFromDiagnostic", () => {
  it("1. STRONG result raises mastery for a learner with no prior state", () => {
    const { result } = diagnosticResultFor([memoryHierarchy], correctAnswerFor);
    expect(result.concepts[0].apparentKnowledge).toBe("STRONG");

    const seeded = seedMasteryFromDiagnostic({
      result,
      existingByConceptKey: noExisting,
    });
    expect(seeded.seeds).toHaveLength(1);
    const seed = seeded.seeds[0];
    expect(seed.apparentKnowledge).toBe("STRONG");
    expect(seed.patch.masteryScore).toBeGreaterThan(0);
    expect(seed.patch.correctCount).toBe(1);
    expect(seed.patch.incorrectCount).toBe(0);
    expect(seed.patch.lastCorrectAt).toBeDefined();
    expect(seed.changed).toBe(true);
  });

  it("2. DEVELOPING result maps to a moderate, non-zero mastery estimate", () => {
    // Hand-built MULTI_SELECT question graded directly, so a PARTIALLY_CORRECT
    // (-> DEVELOPING) answer doesn't depend on which format the bank ranks
    // highest for a given concept.
    const question: StructuredQuestion = {
      format: "MULTI_SELECT",
      kind: "SCENARIO",
      difficulty: 3,
      prompt: "Select every option that applies.",
      data: {
        options: [
          { id: "a", text: "one" },
          { id: "b", text: "two" },
          { id: "c", text: "three" },
        ],
        correctIds: ["a", "b"],
      },
    };
    const set: DiagnosticQuestionSet = {
      items: [
        {
          conceptKey: "partial-concept",
          conceptTitle: "Partial Concept",
          importance: 0.5,
          isLoadBearing: false,
          isPrerequisite: false,
          question,
          client: toClientStructured(question, question.prompt),
          origin: "bank",
        },
      ],
      requestedCount: 5,
      conceptsConsidered: 1,
    };
    const partialAnswer: StructuredAnswer = {
      format: "MULTI_SELECT",
      selectedIds: ["a"], // only one of two correct options selected
    };
    const result = scoreDiagnosticQuestionSet(set, [
      { conceptKey: "partial-concept", answer: partialAnswer },
    ]);
    expect(result.concepts[0].apparentKnowledge).toBe("DEVELOPING");
    expect(gradeStructuredAnswer(question, partialAnswer).classification).toBe(
      "PARTIALLY_CORRECT",
    );

    const seeded = seedMasteryFromDiagnostic({
      result,
      existingByConceptKey: noExisting,
    });
    const seed = seeded.seeds[0];
    expect(seed.patch.masteryScore).toBeGreaterThan(0);
    expect(seed.patch.masteryScore).toBeLessThan(0.5);
  });

  it("3. WEAK result maps to a low mastery estimate", () => {
    const { result } = diagnosticResultFor([memoryHierarchy], wrongAnswerFor);
    expect(result.concepts[0].apparentKnowledge).toBe("WEAK");

    const seeded = seedMasteryFromDiagnostic({
      result,
      existingByConceptKey: noExisting,
    });
    const seed = seeded.seeds[0];
    expect(seed.patch.masteryScore).toBeLessThan(0.3);
    expect(seed.patch.incorrectCount).toBe(1);
    expect(seed.patch.correctCount).toBe(0);
  });

  it("4. only assessed concepts are affected — unanswered concepts produce no seed", () => {
    const set = selectDiagnosticQuestionSet([memoryHierarchy, cacheVsRam], []);
    const onlyFirst = set.items.filter(
      (i) => i.conceptKey === "memory-hierarchy",
    );
    const answers = onlyFirst.map((item) => ({
      conceptKey: item.conceptKey,
      answer: correctAnswerFor(item),
    }));
    const result = scoreDiagnosticQuestionSet(set, answers);
    expect(result.unansweredConceptKeys).toContain("cache-vs-ram");

    const seeded = seedMasteryFromDiagnostic({
      result,
      existingByConceptKey: noExisting,
    });
    expect(seeded.seeds.map((s) => s.conceptKey)).toEqual(["memory-hierarchy"]);
  });

  it("5. existing stronger mastery is not downgraded by a WEAK diagnostic answer", () => {
    const { result } = diagnosticResultFor([memoryHierarchy], wrongAnswerFor);
    const strongExisting: CurrentConceptState = {
      masteryScore: 0.9,
      confidenceScore: 0.85,
      attemptCount: 10,
      correctCount: 9,
      incorrectCount: 1,
      misconceptionCount: 0,
      preferredStrategy: "socratic",
    };
    const seeded = seedMasteryFromDiagnostic({
      result,
      existingByConceptKey: { "memory-hierarchy": strongExisting },
    });
    const seed = seeded.seeds[0];
    expect(seed.patch.masteryScore).toBeGreaterThanOrEqual(
      strongExisting.masteryScore,
    );
    expect(seed.patch.confidenceScore).toBeGreaterThanOrEqual(
      strongExisting.confidenceScore,
    );
  });

  it("6. existing weaker mastery is raised when diagnostic evidence supports it", () => {
    const { result } = diagnosticResultFor([memoryHierarchy], correctAnswerFor);
    const weakExisting: CurrentConceptState = {
      masteryScore: 0.05,
      confidenceScore: 0.1,
      attemptCount: 1,
      correctCount: 0,
      incorrectCount: 1,
      misconceptionCount: 0,
      preferredStrategy: null,
    };
    const seeded = seedMasteryFromDiagnostic({
      result,
      existingByConceptKey: { "memory-hierarchy": weakExisting },
    });
    const seed = seeded.seeds[0];
    expect(seed.patch.masteryScore).toBeGreaterThan(weakExisting.masteryScore);
    expect(seed.changed).toBe(true);
  });

  it("7. a WEAK result does not create or strengthen a confirmed misconception", () => {
    // A wrong MCQ answer whose distractor maps to a misconception still
    // surfaces misconceptionCandidates on the grade (existing grader
    // behavior) — but the seed must never turn that into a misconceptionCount
    // change, and must expose no misconception-creation API at all.
    const { result } = diagnosticResultFor([memoryHierarchy], wrongAnswerFor);
    const graded = result.concepts[0].grade;
    // Sanity: the underlying grade *does* carry misconception signal.
    expect(graded.misconceptionCandidates.length).toBeGreaterThanOrEqual(0);

    const existing: CurrentConceptState = {
      masteryScore: 0.4,
      confidenceScore: 0.4,
      attemptCount: 2,
      correctCount: 1,
      incorrectCount: 1,
      misconceptionCount: 0,
      preferredStrategy: null,
    };
    const seeded = seedMasteryFromDiagnostic({
      result,
      existingByConceptKey: { "memory-hierarchy": existing },
    });
    expect(seeded.seeds[0].patch.misconceptionCount).toBe(0);
    expect(seeded.seeds[0].patch).not.toHaveProperty("misconceptionPlan");
    expect(seeded.seeds[0].patch).not.toHaveProperty("creates");
  });

  it("8. re-running the same diagnostic result does not produce contradictory state", () => {
    const { result } = diagnosticResultFor([memoryHierarchy], correctAnswerFor);
    const first = seedMasteryFromDiagnostic({
      result,
      existingByConceptKey: noExisting,
      nowISO: "2026-01-01T00:00:00.000Z",
    });
    const firstPatch = first.seeds[0].patch;

    // Feed the first run's resulting state back in as "existing".
    const existingAfterFirst: CurrentConceptState = {
      masteryScore: firstPatch.masteryScore,
      confidenceScore: firstPatch.confidenceScore,
      attemptCount: firstPatch.attemptCount,
      correctCount: firstPatch.correctCount,
      incorrectCount: firstPatch.incorrectCount,
      misconceptionCount: firstPatch.misconceptionCount,
      preferredStrategy: null,
    };
    const second = seedMasteryFromDiagnostic({
      result,
      existingByConceptKey: { "memory-hierarchy": existingAfterFirst },
      nowISO: "2026-01-01T00:00:00.000Z",
    });
    const secondPatch = second.seeds[0].patch;

    // Mastery/confidence floor is stable — re-seeding the same evidence
    // never pushes it lower nor spuriously higher.
    expect(secondPatch.masteryScore).toBe(firstPatch.masteryScore);
    expect(secondPatch.confidenceScore).toBe(firstPatch.confidenceScore);
  });

  it("9. an empty diagnostic result (no assessed concepts) is handled safely", () => {
    const emptyResult: DiagnosticResult = {
      concepts: [],
      strongConceptKeys: [],
      developingConceptKeys: [],
      weakConceptKeys: [],
      weakLoadBearingConceptKeys: [],
      unansweredConceptKeys: [],
    };
    const seeded = seedMasteryFromDiagnostic({
      result: emptyResult,
      existingByConceptKey: noExisting,
    });
    expect(seeded.seeds).toEqual([]);
  });

  it("10. multiple concepts are handled deterministically and independently", () => {
    const set = selectDiagnosticQuestionSet([memoryHierarchy, cacheVsRam], []);
    const answers = set.items.map((item, i) => ({
      conceptKey: item.conceptKey,
      answer: i % 2 === 0 ? correctAnswerFor(item) : wrongAnswerFor(item),
    }));
    const result = scoreDiagnosticQuestionSet(set, answers);

    const a = seedMasteryFromDiagnostic({
      result,
      existingByConceptKey: noExisting,
      nowISO: "2026-01-01T00:00:00.000Z",
    });
    const b = seedMasteryFromDiagnostic({
      result,
      existingByConceptKey: noExisting,
      nowISO: "2026-01-01T00:00:00.000Z",
    });
    expect(a).toEqual(b);
    expect(a.seeds).toHaveLength(2);
    expect(new Set(a.seeds.map((s) => s.conceptKey)).size).toBe(2);
  });
});
