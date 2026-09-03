import { describe, expect, it, vi } from "vitest";

import { ok } from "@/lib/result";
import type { LLMProvider } from "@/lib/ai/types";

import { extractedGraphSchema } from "./contracts";
import { computeGraph } from "./build";
import { extractConcepts, graphFromPlan } from "./extraction";

const PLAN = [
  {
    key: "virtual-memory",
    title: "Virtual Memory",
    summary: "An abstraction over physical RAM.",
    importance: 5,
    prerequisiteKeys: [],
  },
  {
    key: "page-faults",
    title: "Page Faults",
    summary: "Servicing a reference to a non-resident page.",
    importance: 4,
    prerequisiteKeys: ["virtual-memory"],
  },
];

function fakeLLM(json: unknown): LLMProvider {
  return {
    id: "fake",
    generate: vi.fn(async () =>
      ok({
        text: JSON.stringify(json),
        model: "fake",
        finishReason: "stop" as const,
      }),
    ),
  };
}

describe("graphFromPlan", () => {
  it("produces a schema-valid graph with prerequisite edges", () => {
    const g = graphFromPlan(PLAN);
    expect(() => extractedGraphSchema.parse(g)).not.toThrow();
    expect(g.relationships).toContainEqual(
      expect.objectContaining({
        sourceKey: "virtual-memory",
        targetKey: "page-faults",
        type: "PREREQUISITE",
      }),
    );
  });

  it("chains consecutive concepts that declare no prerequisite", () => {
    const g = graphFromPlan([
      {
        key: "a",
        title: "A",
        summary: "s",
        importance: 3,
        prerequisiteKeys: [],
      },
      {
        key: "b",
        title: "B",
        summary: "s",
        importance: 3,
        prerequisiteKeys: [],
      },
    ]);
    expect(g.relationships).toHaveLength(1);
    expect(g.relationships[0]).toMatchObject({
      sourceKey: "a",
      targetKey: "b",
    });
  });
});

describe("extractConcepts", () => {
  it("falls back to the plan when there is no LLM", async () => {
    const res = await extractConcepts({
      llm: null,
      subject: "Operating Systems",
      planConcepts: PLAN,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.source).toBe("plan");
      expect(res.value.graph.concepts).toHaveLength(2);
    }
  });

  it("falls back to the plan when the model output is malformed", async () => {
    const res = await extractConcepts({
      llm: fakeLLM({ nonsense: true }),
      subject: "Operating Systems",
      planConcepts: PLAN,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.source).toBe("plan");
  });

  it("uses a valid model extraction", async () => {
    const res = await extractConcepts({
      llm: fakeLLM({
        concepts: [
          {
            key: "tlb",
            title: "Translation Lookaside Buffer",
            description: "A cache for page-table entries.",
            importance: 4,
            sourcePages: [12],
            prerequisiteKeys: [],
            relatedKeys: [],
          },
          {
            key: "page-table",
            title: "Page Table",
            description: "Maps virtual pages to frames.",
            importance: 5,
            sourcePages: [10],
            prerequisiteKeys: [],
            relatedKeys: ["tlb"],
          },
        ],
        relationships: [
          {
            sourceKey: "page-table",
            targetKey: "tlb",
            type: "RELATED",
            confidence: 0.7,
          },
        ],
      }),
      subject: "Paging",
      sources: [{ text: "the TLB caches translations", page: 12 }],
      planConcepts: PLAN,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.source).toBe("ai+source");
      const { validated } = computeGraph(res.value.graph);
      expect(validated.concepts.map((c) => c.normalizedKey).sort()).toEqual([
        "page-table",
        "translation-lookaside-buffer",
      ]);
    }
  });
});
