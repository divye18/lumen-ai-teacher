import { describe, expect, it } from "vitest";

import { computeImportance } from "./importance";
import { normalizeGraph } from "./normalize";
import { validateGraph } from "./validate";

function chain() {
  const normalized = normalizeGraph({
    concepts: [
      { key: "found", title: "Foundation", description: "d", importance: 3 },
      { key: "mid", title: "Middle", description: "d", importance: 3 },
      { key: "adv", title: "Advanced", description: "d", importance: 3 },
      { key: "aside", title: "Aside", description: "d", importance: 1 },
    ],
    edges: [
      {
        sourceKey: "found",
        targetKey: "mid",
        type: "PREREQUISITE",
        confidence: 1,
      },
      {
        sourceKey: "mid",
        targetKey: "adv",
        type: "PREREQUISITE",
        confidence: 1,
      },
    ],
  });
  return validateGraph(normalized);
}

describe("computeImportance", () => {
  it("ranks a foundational concept above the leaf it leads to", () => {
    const v = chain();
    const scores = computeImportance(v);
    expect(scores.get("foundation")!).toBeGreaterThan(scores.get("advanced")!);
  });

  it("ranks a connected concept above an isolated one", () => {
    const v = chain();
    const scores = computeImportance(v);
    expect(scores.get("middle")!).toBeGreaterThan(scores.get("aside")!);
  });

  it("stays within 0..1 and is deterministic", () => {
    const a = computeImportance(chain());
    const b = computeImportance(chain());
    for (const [k, v] of a) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(b.get(k)).toBe(v);
    }
  });

  it("respects explicit emphasis", () => {
    const base = normalizeGraph({
      concepts: [
        { key: "a", title: "A", description: "d", importance: 1 },
        { key: "b", title: "B", description: "d", importance: 5 },
      ],
      edges: [],
    });
    const scores = computeImportance(validateGraph(base));
    expect(scores.get("b")!).toBeGreaterThan(scores.get("a")!);
  });
});
