import { describe, expect, it } from "vitest";

import { normalizeGraph, normalizeConceptTitle } from "./normalize";

describe("normalizeConceptTitle", () => {
  it("produces a stable slug", () => {
    expect(normalizeConceptTitle("Virtual Memory & Page Faults")).toBe(
      "virtual-memory-page-faults",
    );
    expect(normalizeConceptTitle("  TLB   ")).toBe("tlb");
  });
});

describe("normalizeGraph", () => {
  it("merges concepts that share a normalized key", () => {
    const g = normalizeGraph({
      concepts: [
        { key: "a", title: "Page Faults", description: "short", importance: 3 },
        {
          key: "b",
          title: "page  faults",
          description: "a much longer description of page faults",
          importance: 5,
          sourcePages: [4, 4, 2],
        },
      ],
      edges: [],
    });
    expect(g.concepts).toHaveLength(1);
    const node = g.concepts[0];
    expect(node.normalizedKey).toBe("page-faults");
    expect(node.importance).toBe(5); // max
    expect(node.description).toMatch(/longer description/); // longest
    expect(node.sourcePages).toEqual([2, 4]); // unique + sorted
    expect(node.aliases.sort()).toEqual(["a", "b"]);
    expect(g.keyMap.get("a")).toBe("page-faults");
    expect(g.keyMap.get("b")).toBe("page-faults");
  });

  it("drops self-edges and re-points edges at normalized keys", () => {
    const g = normalizeGraph({
      concepts: [
        { key: "vm", title: "Virtual Memory", description: "d", importance: 3 },
        { key: "pf", title: "Page Faults", description: "d", importance: 3 },
      ],
      edges: [
        {
          sourceKey: "vm",
          targetKey: "pf",
          type: "PREREQUISITE",
          confidence: 0.9,
        },
        { sourceKey: "vm", targetKey: "vm", type: "RELATED", confidence: 1 },
      ],
    });
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0]).toMatchObject({
      sourceKey: "virtual-memory",
      targetKey: "page-faults",
      type: "PREREQUISITE",
    });
  });

  it("canonicalises symmetric edges so a pair is stored once", () => {
    const g = normalizeGraph({
      concepts: [
        { key: "a", title: "Alpha", description: "d", importance: 3 },
        { key: "b", title: "Beta", description: "d", importance: 3 },
      ],
      edges: [
        { sourceKey: "a", targetKey: "b", type: "RELATED", confidence: 0.4 },
        { sourceKey: "b", targetKey: "a", type: "RELATED", confidence: 0.8 },
      ],
    });
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0].confidence).toBe(0.8); // highest wins
    expect(g.edges[0].sourceKey < g.edges[0].targetKey).toBe(true);
  });

  it("keeps directed duplicates distinct but dedupes exact ones", () => {
    const g = normalizeGraph({
      concepts: [
        { key: "a", title: "Alpha", description: "d", importance: 3 },
        { key: "b", title: "Beta", description: "d", importance: 3 },
      ],
      edges: [
        {
          sourceKey: "a",
          targetKey: "b",
          type: "PREREQUISITE",
          confidence: 0.3,
        },
        {
          sourceKey: "a",
          targetKey: "b",
          type: "PREREQUISITE",
          confidence: 0.9,
        },
        {
          sourceKey: "b",
          targetKey: "a",
          type: "PREREQUISITE",
          confidence: 0.5,
        },
      ],
    });
    expect(g.edges).toHaveLength(2);
    const ab = g.edges.find(
      (e) => e.sourceKey === "alpha" && e.targetKey === "beta",
    );
    expect(ab?.confidence).toBe(0.9);
  });
});
