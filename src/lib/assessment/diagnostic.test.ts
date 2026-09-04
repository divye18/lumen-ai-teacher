import { describe, expect, it } from "vitest";

import {
  DIAGNOSTIC_MAX_QUESTIONS,
  DIAGNOSTIC_MIN_QUESTIONS,
  rankDiagnosticConcepts,
  scoreDiagnosticQuestionSet,
  selectDiagnosticQuestionSet,
  type DiagnosticConceptInput,
  type DiagnosticEdgeInput,
} from "./diagnostic";
import type { StructuredAnswer } from "./structured/contracts";

/**
 * Concepts chosen to match real entries in `ASSESSMENT_BANK` so selection can
 * be exercised against authored questions rather than the template fallback.
 */
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
const cacheHitsMisses: DiagnosticConceptInput = {
  key: "cache-hits-and-misses",
  title: "Cache hits and misses",
  summary: "A cache hit rate and miss rate determine average access time.",
};
const locality: DiagnosticConceptInput = {
  key: "locality",
  title: "Locality of reference",
  summary: "Temporal and spatial locality of reference in memory access.",
};
const callStack: DiagnosticConceptInput = {
  key: "call-stack",
  title: "The call stack",
  summary: "Stack frames track function calls; stack vs heap lifetime.",
};
const tcpCongestion: DiagnosticConceptInput = {
  key: "tcp-congestion",
  title: "TCP congestion control",
  summary: "Slow start and congestion avoidance adjust the congestion window.",
};
const virtualMemory: DiagnosticConceptInput = {
  key: "virtual-memory",
  title: "Virtual memory",
  summary: "Page faults and paging translate virtual to physical addresses.",
};
const noBankMatch: DiagnosticConceptInput = {
  key: "quantum-entanglement",
  title: "Quantum entanglement",
  summary: "Spooky action at a distance.",
};

const sevenConcepts = [
  memoryHierarchy,
  cacheVsRam,
  cacheHitsMisses,
  locality,
  callStack,
  tcpCongestion,
  virtualMemory,
];

describe("rankDiagnosticConcepts", () => {
  it("is deterministic for the same input", () => {
    const edges: DiagnosticEdgeInput[] = [
      {
        sourceKey: "memory-hierarchy",
        targetKey: "cache-vs-ram",
        type: "PREREQUISITE",
      },
    ];
    const a = rankDiagnosticConcepts(sevenConcepts, edges);
    const b = rankDiagnosticConcepts(sevenConcepts, edges);
    expect(a).toEqual(b);
  });

  it("marks a concept with dependents as load-bearing and prerequisite", () => {
    const edges: DiagnosticEdgeInput[] = [
      {
        sourceKey: "memory-hierarchy",
        targetKey: "cache-vs-ram",
        type: "PREREQUISITE",
      },
    ];
    const ranked = rankDiagnosticConcepts([memoryHierarchy, cacheVsRam], edges);
    const mh = ranked.find((c) => c.key === "memory-hierarchy")!;
    const cvr = ranked.find((c) => c.key === "cache-vs-ram")!;
    expect(mh.isLoadBearing).toBe(true);
    expect(mh.isPrerequisite).toBe(true);
    expect(cvr.isLoadBearing).toBe(false);
  });

  it("ranks the load-bearing concept above a disconnected one of otherwise equal standing", () => {
    const edges: DiagnosticEdgeInput[] = [
      {
        sourceKey: "memory-hierarchy",
        targetKey: "cache-vs-ram",
        type: "PREREQUISITE",
      },
      {
        sourceKey: "memory-hierarchy",
        targetKey: "cache-hits-and-misses",
        type: "PREREQUISITE",
      },
    ];
    const ranked = rankDiagnosticConcepts(
      [memoryHierarchy, cacheVsRam, cacheHitsMisses, locality],
      edges,
    );
    const mhIndex = ranked.findIndex((c) => c.key === "memory-hierarchy");
    const localityIndex = ranked.findIndex((c) => c.key === "locality");
    expect(mhIndex).toBeLessThan(localityIndex);
  });

  it("handles a graph with no edges (no prerequisite information)", () => {
    const ranked = rankDiagnosticConcepts(sevenConcepts, []);
    expect(ranked).toHaveLength(sevenConcepts.length);
    expect(ranked.every((c) => !c.isLoadBearing && !c.isPrerequisite)).toBe(
      true,
    );
  });

  it("ignores edges referencing unknown concept keys", () => {
    const edges: DiagnosticEdgeInput[] = [
      {
        sourceKey: "memory-hierarchy",
        targetKey: "not-a-real-concept",
        type: "PREREQUISITE",
      },
    ];
    expect(() =>
      rankDiagnosticConcepts([memoryHierarchy], edges),
    ).not.toThrow();
    const ranked = rankDiagnosticConcepts([memoryHierarchy], edges);
    expect(ranked[0].isLoadBearing).toBe(false);
  });
});

describe("selectDiagnosticQuestionSet", () => {
  it("is deterministic for the same input", () => {
    const a = selectDiagnosticQuestionSet(sevenConcepts, []);
    const b = selectDiagnosticQuestionSet(sevenConcepts, []);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("targets the default max of 8 questions when enough concepts qualify", () => {
    const set = selectDiagnosticQuestionSet(sevenConcepts, []);
    expect(set.requestedCount).toBe(DIAGNOSTIC_MAX_QUESTIONS);
    expect(set.items.length).toBeLessThanOrEqual(DIAGNOSTIC_MAX_QUESTIONS);
    expect(set.items.length).toBe(sevenConcepts.length); // only 7 available
  });

  it("clamps a requested target count into [MIN, MAX]", () => {
    const tooLow = selectDiagnosticQuestionSet(sevenConcepts, [], {
      targetCount: 1,
    });
    expect(tooLow.requestedCount).toBe(DIAGNOSTIC_MIN_QUESTIONS);

    const tooHigh = selectDiagnosticQuestionSet(sevenConcepts, [], {
      targetCount: 100,
    });
    expect(tooHigh.requestedCount).toBe(DIAGNOSTIC_MAX_QUESTIONS);
  });

  it("samples across distinct concepts rather than repeating one concept", () => {
    const set = selectDiagnosticQuestionSet(sevenConcepts, []);
    const keys = set.items.map((i) => i.conceptKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("prevents duplicate prompts across the selected set", () => {
    const set = selectDiagnosticQuestionSet(sevenConcepts, []);
    const prompts = set.items.map((i) => i.question.prompt);
    expect(new Set(prompts).size).toBe(prompts.length);
  });

  it("prioritizes a load-bearing/prerequisite concept into the set first", () => {
    const edges: DiagnosticEdgeInput[] = [
      {
        sourceKey: "memory-hierarchy",
        targetKey: "cache-vs-ram",
        type: "PREREQUISITE",
      },
      {
        sourceKey: "memory-hierarchy",
        targetKey: "locality",
        type: "PREREQUISITE",
      },
    ];
    const set = selectDiagnosticQuestionSet(
      [memoryHierarchy, cacheVsRam, locality, tcpCongestion],
      edges,
      { targetCount: 5 },
    );
    const mhItem = set.items.find((i) => i.conceptKey === "memory-hierarchy");
    expect(mhItem).toBeDefined();
    expect(mhItem!.isLoadBearing).toBe(true);
    // Load-bearing concept should be selected ahead of a disconnected one.
    const mhIndex = set.items.findIndex(
      (i) => i.conceptKey === "memory-hierarchy",
    );
    const tcpIndex = set.items.findIndex(
      (i) => i.conceptKey === "tcp-congestion",
    );
    expect(mhIndex).toBeLessThan(tcpIndex);
  });

  it("returns fewer than the requested count when fewer suitable concepts exist", () => {
    const set = selectDiagnosticQuestionSet(
      [memoryHierarchy, noBankMatch],
      [],
      {
        targetCount: 8,
      },
    );
    // noBankMatch has no bank entry and no graph info to ground a template.
    expect(set.items.length).toBe(1);
    expect(set.items[0].conceptKey).toBe("memory-hierarchy");
  });

  it("returns an empty set (not an invented question) when nothing is suitable", () => {
    const set = selectDiagnosticQuestionSet([noBankMatch], []);
    expect(set.items).toHaveLength(0);
    expect(set.conceptsConsidered).toBe(1);
  });

  it("still selects a question via the grounded template fallback when graph structure exists", () => {
    const edges: DiagnosticEdgeInput[] = [
      {
        sourceKey: "memory-hierarchy",
        targetKey: "quantum-entanglement",
        type: "PREREQUISITE",
      },
    ];
    // Template distractors are drawn from other concept titles — needs >= 2.
    const set = selectDiagnosticQuestionSet(
      [memoryHierarchy, noBankMatch, locality, callStack],
      edges,
    );
    const templated = set.items.find(
      (i) => i.conceptKey === "quantum-entanglement",
    );
    expect(templated?.origin).toBe("template");
  });

  it("every item carries a client-safe projection without the answer key", () => {
    const set = selectDiagnosticQuestionSet(sevenConcepts, []);
    for (const item of set.items) {
      expect(item.client.prompt).toBe(item.question.prompt);
      expect(
        (item.client as unknown as { data?: unknown }).data,
      ).toBeUndefined();
    }
  });
});

describe("scoreDiagnosticQuestionSet", () => {
  it("classifies a correct MCQ answer as STRONG", () => {
    const set = selectDiagnosticQuestionSet([memoryHierarchy], []);
    const item = set.items[0];
    expect(item.question.format).toBe("MCQ");
    const correctAnswer: StructuredAnswer =
      item.question.format === "MCQ"
        ? { format: "MCQ", selectedId: item.question.data.correctId }
        : { format: "TRUE_FALSE", value: true };

    const result = scoreDiagnosticQuestionSet(set, [
      { conceptKey: item.conceptKey, answer: correctAnswer },
    ]);
    expect(result.concepts).toHaveLength(1);
    expect(result.concepts[0].apparentKnowledge).toBe("STRONG");
    expect(result.strongConceptKeys).toEqual([item.conceptKey]);
    expect(result.weakConceptKeys).toEqual([]);
  });

  it("classifies a wrong MCQ answer as WEAK", () => {
    const set = selectDiagnosticQuestionSet([memoryHierarchy], []);
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
    expect(result.weakConceptKeys).toEqual([item.conceptKey]);
  });

  it("surfaces weak load-bearing concepts separately", () => {
    const edges: DiagnosticEdgeInput[] = [
      {
        sourceKey: "memory-hierarchy",
        targetKey: "cache-vs-ram",
        type: "PREREQUISITE",
      },
    ];
    const set = selectDiagnosticQuestionSet(
      [memoryHierarchy, cacheVsRam],
      edges,
    );
    const mhItem = set.items.find((i) => i.conceptKey === "memory-hierarchy")!;
    if (mhItem.question.format !== "MCQ") throw new Error("expected MCQ");
    const mcqData = mhItem.question.data;
    const wrongId = mcqData.options.find((o) => o.id !== mcqData.correctId)!.id;

    const result = scoreDiagnosticQuestionSet(set, [
      {
        conceptKey: mhItem.conceptKey,
        answer: { format: "MCQ", selectedId: wrongId },
      },
    ]);
    expect(result.weakLoadBearingConceptKeys).toContain("memory-hierarchy");
  });

  it("lists concepts with no submitted answer as unanswered, not scored", () => {
    const set = selectDiagnosticQuestionSet([memoryHierarchy, cacheVsRam], []);
    const result = scoreDiagnosticQuestionSet(set, []);
    expect(result.concepts).toHaveLength(0);
    expect(result.unansweredConceptKeys.sort()).toEqual(
      ["memory-hierarchy", "cache-vs-ram"].sort(),
    );
  });

  it("is deterministic for the same answers", () => {
    const set = selectDiagnosticQuestionSet([memoryHierarchy], []);
    const item = set.items[0];
    if (item.question.format !== "MCQ") throw new Error("expected MCQ");
    const answers = [
      {
        conceptKey: item.conceptKey,
        answer: {
          format: "MCQ" as const,
          selectedId: item.question.data.correctId,
        },
      },
    ];
    const a = scoreDiagnosticQuestionSet(set, answers);
    const b = scoreDiagnosticQuestionSet(set, answers);
    expect(a).toEqual(b);
  });
});
