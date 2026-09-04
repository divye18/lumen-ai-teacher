import { describe, expect, it } from "vitest";

import {
  buildDiagnosticAssessmentInput,
  buildDiagnosticConceptsAndEdges,
  buildDiagnosticQuestionItemViews,
  buildMasteryUpsertInputs,
  buildStoredDiagnosticState,
  findMostImportantGap,
  markDiagnosticCompleted,
  needsDiagnostic,
  parseStoredDiagnosticState,
  resolveDiagnosticPhase,
  toDiagnosticQuestionSet,
  type DiagnosticGraphInput,
  type DiagnosticLessonConcept,
} from "./diagnostic-flow";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/lib/graph";
import {
  scoreDiagnosticQuestionSet,
  selectDiagnosticQuestionSet,
  type DiagnosticResult,
} from "@/lib/assessment/diagnostic";
import { seedMasteryFromDiagnostic } from "@/lib/assessment/diagnostic-mastery";
import type { StructuredAnswer } from "@/lib/assessment/structured/contracts";

const memoryHierarchy: DiagnosticLessonConcept = {
  conceptId: "concept-1",
  conceptKey: "memory-hierarchy",
  title: "Memory hierarchy",
  summary: "Storage layers trade size for speed: registers, cache, RAM, disk.",
};
const cacheVsRam: DiagnosticLessonConcept = {
  conceptId: "concept-2",
  conceptKey: "cache-vs-ram",
  title: "Cache vs RAM",
  summary: "Cache memory is small and fast; RAM is larger and slower.",
};

describe("needsDiagnostic", () => {
  // 1. New learner triggers diagnostic.
  it("returns true when no lesson concept has any mastery evidence", () => {
    expect(needsDiagnostic([memoryHierarchy, cacheVsRam], [])).toBe(true);
  });

  // 2. Returning learner with established mastery skips diagnostic.
  it("returns false when at least one lesson concept has been assessed", () => {
    const evidence = [{ conceptId: "concept-1", attemptCount: 3 }];
    expect(needsDiagnostic([memoryHierarchy, cacheVsRam], evidence)).toBe(
      false,
    );
  });

  it("does not trigger off mastery evidence for concepts outside this lesson", () => {
    // A simplistic global rule would see this evidence and skip; scoping to
    // the lesson's own concepts must still say "needs diagnostic".
    const evidenceForAnotherLesson = [
      { conceptId: "unrelated-concept", attemptCount: 10 },
    ];
    expect(
      needsDiagnostic([memoryHierarchy, cacheVsRam], evidenceForAnotherLesson),
    ).toBe(true);
  });

  it("ignores an attempt_count of 0 as evidence", () => {
    const evidence = [{ conceptId: "concept-1", attemptCount: 0 }];
    expect(needsDiagnostic([memoryHierarchy], evidence)).toBe(true);
  });
});

describe("buildDiagnosticConceptsAndEdges", () => {
  // 4. Diagnostic is scoped to lesson-relevant concepts.
  it("only includes this lesson's concepts, never the wider graph", () => {
    const { concepts } = buildDiagnosticConceptsAndEdges(
      [memoryHierarchy, cacheVsRam],
      undefined,
    );
    expect(concepts.map((c) => c.key).sort()).toEqual(
      ["cache-vs-ram", "memory-hierarchy"].sort(),
    );
  });

  it("drops graph edges whose endpoints are outside this lesson", () => {
    const graph: DiagnosticGraphInput = {
      nodes: [
        { id: "n1", conceptKey: "memory-hierarchy" },
        { id: "n2", conceptKey: "cache-vs-ram" },
        { id: "n3", conceptKey: "some-other-lesson-concept" },
      ],
      edges: [
        { source: "n1", target: "n2", type: "PREREQUISITE" },
        { source: "n1", target: "n3", type: "PREREQUISITE" },
      ],
    };
    const { edges } = buildDiagnosticConceptsAndEdges(
      [memoryHierarchy, cacheVsRam],
      graph,
    );
    expect(edges).toEqual([
      {
        sourceKey: "memory-hierarchy",
        targetKey: "cache-vs-ram",
        type: "PREREQUISITE",
      },
    ]);
  });

  it("returns no edges when no graph is supplied", () => {
    const { edges } = buildDiagnosticConceptsAndEdges([memoryHierarchy]);
    expect(edges).toEqual([]);
  });
});

describe("stored diagnostic state round-trip", () => {
  it("builds, stores, and reconstructs a gradeable question set losslessly", () => {
    const set = selectDiagnosticQuestionSet(
      [memoryHierarchy, cacheVsRam].map((c) => ({
        key: c.conceptKey,
        title: c.title,
        summary: c.summary,
      })),
      [],
    );
    const stored = buildStoredDiagnosticState(
      "assessment-1",
      set,
      "2026-01-01T00:00:00.000Z",
    );
    // Round-trip through JSON, exactly as it would through jsonb.
    const rehydrated = parseStoredDiagnosticState(
      JSON.parse(JSON.stringify(stored)),
    );
    expect(rehydrated).not.toBeNull();
    const reconstructed = toDiagnosticQuestionSet(rehydrated!);
    expect(reconstructed.items.map((i) => i.question.prompt).sort()).toEqual(
      set.items.map((i) => i.question.prompt).sort(),
    );
  });

  it("parseStoredDiagnosticState rejects malformed/foreign data safely", () => {
    expect(parseStoredDiagnosticState(null)).toBeNull();
    expect(parseStoredDiagnosticState(undefined)).toBeNull();
    expect(parseStoredDiagnosticState({})).toBeNull();
    expect(parseStoredDiagnosticState({ foo: "bar" })).toBeNull();
    expect(parseStoredDiagnosticState("not an object")).toBeNull();
  });

  it("markDiagnosticCompleted stamps status/summary without losing the items", () => {
    const set = selectDiagnosticQuestionSet(
      [
        {
          key: memoryHierarchy.conceptKey,
          title: memoryHierarchy.title,
          summary: memoryHierarchy.summary,
        },
      ],
      [],
    );
    const stored = buildStoredDiagnosticState(
      "a1",
      set,
      "2026-01-01T00:00:00.000Z",
    );
    const item = set.items[0];
    if (item.question.format !== "MCQ") throw new Error("expected MCQ");
    const result = scoreDiagnosticQuestionSet(set, [
      {
        conceptKey: item.conceptKey,
        answer: { format: "MCQ", selectedId: item.question.data.correctId },
      },
    ]);
    expect(result.strongConceptKeys).toEqual(["memory-hierarchy"]);

    const completed = markDiagnosticCompleted(
      stored,
      result,
      null,
      "2026-01-01T00:05:00.000Z",
    );
    expect(completed.status).toBe("COMPLETED");
    expect(completed.summary).toEqual({
      strong: [
        { conceptKey: "memory-hierarchy", conceptTitle: "Memory hierarchy" },
      ],
      developing: [],
      weak: [],
      weakLoadBearing: [],
      gap: null,
    });
    expect(completed.items).toEqual(stored.items);
  });
});

describe("findMostImportantGap", () => {
  function node(overrides: Partial<KnowledgeGraphNode>): KnowledgeGraphNode {
    return {
      id: overrides.conceptKey ?? "id",
      normalizedKey: overrides.conceptKey ?? "id",
      conceptKey: overrides.conceptKey ?? null,
      title: "Untitled",
      description: null,
      importance: 0.5,
      masteryPoints: 0,
      masteryBand: "Not understood",
      bandId: "not-understood",
      confidence: 0,
      attempts: 0,
      assessed: false,
      status: "PENDING",
      misconceptionCount: 0,
      misconceptions: [],
      sourcePages: [],
      sourceDocumentId: null,
      sourceDocumentTitle: null,
      lessonId: null,
      lessonTitle: null,
      depth: 0,
      layer: 0,
      row: 0,
      x: 0.5,
      y: 0.5,
      isCurrent: false,
      ...overrides,
    };
  }
  function edge(
    source: string,
    target: string,
    type: KnowledgeGraphEdge["type"] = "PREREQUISITE",
  ): KnowledgeGraphEdge {
    return {
      id: `${source}-${target}`,
      source,
      target,
      type,
      label: type,
      confidence: 1,
      ordering: true,
    };
  }

  const cacheVsRam = {
    conceptKey: "cache-vs-ram",
    title: "Cache vs RAM",
    apparentKnowledge: "WEAK" as const,
    isLoadBearing: true,
    isPrerequisite: false,
    grade: {} as never,
  };
  const memoryHierarchyResultConcept = {
    conceptKey: "memory-hierarchy",
    title: "Memory hierarchy",
    apparentKnowledge: "WEAK" as const,
    isLoadBearing: false,
    isPrerequisite: true,
    grade: {} as never,
  };

  function resultWith(
    weakLoadBearingConceptKeys: string[],
    concepts: { conceptKey: string; title: string }[],
  ): DiagnosticResult {
    return {
      concepts: concepts.map((c) => ({
        conceptKey: c.conceptKey,
        conceptTitle: c.title,
        apparentKnowledge: "WEAK",
        isLoadBearing: false,
        isPrerequisite: false,
        grade: {} as never,
      })),
      strongConceptKeys: [],
      developingConceptKeys: [],
      weakConceptKeys: concepts.map((c) => c.conceptKey),
      weakLoadBearingConceptKeys,
      unansweredConceptKeys: [],
    };
  }

  // 4/5. Weak load-bearing concept + real weak assessed prerequisite -> gap.
  it("returns a real gap when a weak load-bearing concept has an assessed, still-weak upstream prerequisite", () => {
    const graph = {
      nodes: [
        node({
          conceptKey: "memory-hierarchy",
          title: "Memory hierarchy",
          masteryPoints: 20,
          assessed: true,
        }),
        node({
          conceptKey: "cache-vs-ram",
          title: "Cache vs RAM",
          masteryPoints: 10,
          assessed: true,
        }),
      ],
      edges: [edge("memory-hierarchy", "cache-vs-ram")],
    };
    const result = resultWith(
      ["cache-vs-ram"],
      [cacheVsRam, memoryHierarchyResultConcept].map((c) => ({
        conceptKey: c.conceptKey,
        title: c.title,
      })),
    );
    const gap = findMostImportantGap(result, graph);
    expect(gap).toEqual({
      conceptKey: "cache-vs-ram",
      conceptTitle: "Cache vs RAM",
      prerequisiteConceptKey: "memory-hierarchy",
      prerequisiteConceptTitle: "Memory hierarchy",
    });
  });

  // 6/9. No graph edges at all -> no fabricated claim.
  it("returns null when the graph has no edges for the weak concepts", () => {
    const graph = {
      nodes: [
        node({
          conceptKey: "cache-vs-ram",
          title: "Cache vs RAM",
          masteryPoints: 10,
          assessed: true,
        }),
      ],
      edges: [],
    };
    const result = resultWith(
      ["cache-vs-ram"],
      [{ conceptKey: "cache-vs-ram", title: "Cache vs RAM" }],
    );
    expect(findMostImportantGap(result, graph)).toBeNull();
  });

  it("returns null when there are no weak load-bearing concepts", () => {
    const graph = { nodes: [], edges: [] };
    const result = resultWith([], []);
    expect(findMostImportantGap(result, graph)).toBeNull();
  });

  it("returns null when the upstream prerequisite exists but hasn't been assessed", () => {
    const graph = {
      nodes: [
        node({
          conceptKey: "memory-hierarchy",
          title: "Memory hierarchy",
          masteryPoints: 0,
          assessed: false,
        }),
        node({
          conceptKey: "cache-vs-ram",
          title: "Cache vs RAM",
          masteryPoints: 10,
          assessed: true,
        }),
      ],
      edges: [edge("memory-hierarchy", "cache-vs-ram")],
    };
    const result = resultWith(
      ["cache-vs-ram"],
      [{ conceptKey: "cache-vs-ram", title: "Cache vs RAM" }],
    );
    expect(findMostImportantGap(result, graph)).toBeNull();
  });

  it("skips a weak load-bearing concept with no gap and returns the next one that has one", () => {
    const graph = {
      nodes: [
        node({
          conceptKey: "no-prereq-concept",
          title: "No Prereq Concept",
          masteryPoints: 10,
          assessed: true,
        }),
        node({
          conceptKey: "memory-hierarchy",
          title: "Memory hierarchy",
          masteryPoints: 20,
          assessed: true,
        }),
        node({
          conceptKey: "cache-vs-ram",
          title: "Cache vs RAM",
          masteryPoints: 10,
          assessed: true,
        }),
      ],
      edges: [edge("memory-hierarchy", "cache-vs-ram")],
    };
    const result = resultWith(
      ["no-prereq-concept", "cache-vs-ram"],
      [
        { conceptKey: "no-prereq-concept", title: "No Prereq Concept" },
        { conceptKey: "cache-vs-ram", title: "Cache vs RAM" },
      ],
    );
    expect(findMostImportantGap(result, graph)).toEqual({
      conceptKey: "cache-vs-ram",
      conceptTitle: "Cache vs RAM",
      prerequisiteConceptKey: "memory-hierarchy",
      prerequisiteConceptTitle: "Memory hierarchy",
    });
  });
});

describe("resolveDiagnosticPhase", () => {
  // 3. Existing completed diagnostic is not repeated.
  // 11. Normal Teaching Room starts after diagnostic completion.
  it("returns pending: null when no diagnostic was ever started", () => {
    expect(resolveDiagnosticPhase(null)).toEqual({ pending: null });
  });

  it("returns pending: null once the diagnostic is COMPLETED", () => {
    const set = selectDiagnosticQuestionSet(
      [{ key: "memory-hierarchy", title: "Memory hierarchy", summary: "x" }],
      [],
    );
    const stored = buildStoredDiagnosticState(
      "a1",
      set,
      "2026-01-01T00:00:00.000Z",
    );
    const completed = { ...stored, status: "COMPLETED" as const };
    expect(resolveDiagnosticPhase(completed)).toEqual({ pending: null });
  });

  // 10. Reload/re-entry does not duplicate the diagnostic.
  it("replays the SAME stored question set on every call while IN_PROGRESS", () => {
    const set = selectDiagnosticQuestionSet(
      [
        { key: "memory-hierarchy", title: "Memory hierarchy", summary: "x" },
        { key: "cache-vs-ram", title: "Cache vs RAM", summary: "y" },
      ],
      [],
    );
    const stored = buildStoredDiagnosticState(
      "a1",
      set,
      "2026-01-01T00:00:00.000Z",
    );
    const first = resolveDiagnosticPhase(stored);
    const second = resolveDiagnosticPhase(stored);
    expect(first).toEqual(second);
    expect(first.pending?.assessmentId).toBe("a1");
    expect(first.pending?.items.length).toBe(set.items.length);
  });

  it("returns pending: null when the selected question set was empty", () => {
    const stored = buildStoredDiagnosticState(
      "a1",
      { items: [], requestedCount: 8, conceptsConsidered: 0 },
      "2026-01-01T00:00:00.000Z",
    );
    expect(resolveDiagnosticPhase(stored)).toEqual({ pending: null });
  });
});

describe("buildDiagnosticAssessmentInput", () => {
  // 5. Diagnostic results are persisted using assessment_type = DIAGNOSTIC.
  it("builds an assessments envelope with assessmentType DIAGNOSTIC", () => {
    const input = buildDiagnosticAssessmentInput("user-1", "session-1");
    expect(input).toEqual({
      userId: "user-1",
      sessionId: "session-1",
      title: "Diagnostic pre-assessment",
      assessmentType: "DIAGNOSTIC",
      status: "IN_PROGRESS",
    });
  });
});

describe("buildMasteryUpsertInputs", () => {
  function correctAnswerFor(
    item: ReturnType<typeof selectDiagnosticQuestionSet>["items"][number],
  ): StructuredAnswer {
    if (item.question.format !== "MCQ") throw new Error("expected MCQ");
    return { format: "MCQ", selectedId: item.question.data.correctId };
  }

  // 6. Diagnostic mastery patches are persisted through the existing mastery store.
  it("shapes seeds into the exact ConceptMasteryUpsertInput MasteryStore.upsert expects", () => {
    const set = selectDiagnosticQuestionSet(
      [{ key: "memory-hierarchy", title: "Memory hierarchy", summary: "x" }],
      [],
    );
    const answers = set.items.map((item) => ({
      conceptKey: item.conceptKey,
      answer: correctAnswerFor(item),
    }));
    const result = scoreDiagnosticQuestionSet(set, answers);
    const seeded = seedMasteryFromDiagnostic({ result });

    const conceptIdByKey = new Map([["memory-hierarchy", "concept-1"]]);
    const inputs = buildMasteryUpsertInputs(
      "user-1",
      conceptIdByKey,
      seeded.seeds,
    );

    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({
      userId: "user-1",
      conceptId: "concept-1",
      masteryScore: seeded.seeds[0].patch.masteryScore,
      confidenceScore: seeded.seeds[0].patch.confidenceScore,
      attemptCount: 1,
      correctCount: 1,
      incorrectCount: 0,
      misconceptionCount: 0,
      status: seeded.seeds[0].patch.status,
    });
    // No preferredStrategy field — a diagnostic probe isn't taught with a strategy.
    expect(inputs[0]).not.toHaveProperty("preferredStrategy");
  });

  // 4/7. Only lesson-relevant, resolvable concepts are affected; existing
  // stronger mastery is not silently lost by the mapping step itself
  // (seedMasteryFromDiagnostic already enforces the floor — see 11.2 tests).
  it("skips a seed whose concept id cannot be resolved", () => {
    const set = selectDiagnosticQuestionSet(
      [{ key: "memory-hierarchy", title: "Memory hierarchy", summary: "x" }],
      [],
    );
    const answers = set.items.map((item) => ({
      conceptKey: item.conceptKey,
      answer: correctAnswerFor(item),
    }));
    const result = scoreDiagnosticQuestionSet(set, answers);
    const seeded = seedMasteryFromDiagnostic({ result });

    const inputs = buildMasteryUpsertInputs(
      "user-1",
      new Map(), // no concept ids resolvable
      seeded.seeds,
    );
    expect(inputs).toEqual([]);
  });

  // 8. Diagnostic answers do not increment ordinary teaching-interaction
  // metrics incorrectly — the mapping only ever carries fields already
  // computed by seedMasteryFromDiagnostic (which never calls
  // applyInteractionOutcome / planMisconceptionUpdates); attemptCount here
  // reflects exactly one diagnostic probe, not an ordinary interaction.
  it("attemptCount reflects exactly one diagnostic probe for a first-time concept", () => {
    const set = selectDiagnosticQuestionSet(
      [{ key: "memory-hierarchy", title: "Memory hierarchy", summary: "x" }],
      [],
    );
    const answers = set.items.map((item) => ({
      conceptKey: item.conceptKey,
      answer: correctAnswerFor(item),
    }));
    const result = scoreDiagnosticQuestionSet(set, answers);
    const seeded = seedMasteryFromDiagnostic({ result });
    const inputs = buildMasteryUpsertInputs(
      "user-1",
      new Map([["memory-hierarchy", "concept-1"]]),
      seeded.seeds,
    );
    expect(inputs[0].attemptCount).toBe(1);
  });

  // 9. WEAK diagnostic results do not create confirmed misconceptions.
  it("never carries a misconception-creation field for a WEAK result", () => {
    const set = selectDiagnosticQuestionSet(
      [{ key: "memory-hierarchy", title: "Memory hierarchy", summary: "x" }],
      [],
    );
    const item = set.items[0];
    if (item.question.format !== "MCQ") throw new Error("expected MCQ");
    const mcqData = item.question.data;
    const wrongId = mcqData.options.find((o) => o.id !== mcqData.correctId)!.id;
    const result = scoreDiagnosticQuestionSet(set, [
      {
        conceptKey: item.conceptKey,
        answer: { format: "MCQ", selectedId: wrongId },
      },
    ]);
    expect(result.concepts[0].apparentKnowledge).toBe("WEAK");
    const seeded = seedMasteryFromDiagnostic({ result });
    const inputs = buildMasteryUpsertInputs(
      "user-1",
      new Map([["memory-hierarchy", "concept-1"]]),
      seeded.seeds,
    );
    expect(inputs[0].misconceptionCount).toBe(0);
    expect(Object.keys(inputs[0])).not.toContain("misconceptionPlan");
  });
});

describe("buildDiagnosticQuestionItemViews", () => {
  it("produces one client-safe item per question, no answer key", () => {
    const set = selectDiagnosticQuestionSet(
      [
        { key: "memory-hierarchy", title: "Memory hierarchy", summary: "x" },
        { key: "cache-vs-ram", title: "Cache vs RAM", summary: "y" },
      ],
      [],
    );
    const views = buildDiagnosticQuestionItemViews(set);
    expect(views).toHaveLength(set.items.length);
    for (const v of views) {
      expect(v.structured.prompt).toBeTruthy();
      expect(
        (v.structured as unknown as { data?: unknown }).data,
      ).toBeUndefined();
    }
  });
});
