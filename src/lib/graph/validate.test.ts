import { describe, expect, it } from "vitest";

import { normalizeGraph } from "./normalize";
import { validateGraph } from "./validate";

function graph(
  concepts: string[],
  edges: [string, string, "PREREQUISITE" | "RELATED" | "DEPENDS_ON", number][],
) {
  return normalizeGraph({
    concepts: concepts.map((t) => ({
      key: t,
      title: t,
      description: "d",
      importance: 3,
    })),
    edges: edges.map(([s, t, type, confidence]) => ({
      sourceKey: s,
      targetKey: t,
      type,
      confidence,
    })),
  });
}

describe("validateGraph", () => {
  it("rejects a dangling edge without corrupting the graph", () => {
    const normalized = graph(["a", "b"], [["a", "b", "PREREQUISITE", 0.9]]);
    // Inject an edge to a concept that isn't there.
    normalized.edges.push({
      sourceKey: "a",
      targetKey: "ghost",
      type: "PREREQUISITE",
      confidence: 0.5,
    });
    const v = validateGraph(normalized);
    expect(v.edges).toHaveLength(1);
    expect(v.rejected).toHaveLength(1);
    expect(v.rejected[0].reason).toBe("dangling");
  });

  it("breaks a prerequisite cycle by dropping the weakest edge", () => {
    const v = validateGraph(
      graph(
        ["a", "b", "c"],
        [
          ["a", "b", "PREREQUISITE", 0.9],
          ["b", "c", "PREREQUISITE", 0.8],
          ["c", "a", "PREREQUISITE", 0.2], // weakest — should be dropped
        ],
      ),
    );
    expect(v.rejected.some((r) => r.reason === "cycle")).toBe(true);
    expect(v.edges).toHaveLength(2);
    // No remaining cycle → depths are well-defined and monotone.
    expect(v.depthByKey.get("a")).toBe(0);
    expect(v.depthByKey.get("b")).toBe(1);
    expect(v.depthByKey.get("c")).toBe(2);
  });

  it("computes longest-path prerequisite depth", () => {
    const v = validateGraph(
      graph(
        ["a", "b", "c", "d"],
        [
          ["a", "b", "PREREQUISITE", 1],
          ["a", "c", "PREREQUISITE", 1],
          ["b", "d", "PREREQUISITE", 1],
          ["c", "d", "PREREQUISITE", 1],
        ],
      ),
    );
    expect(v.depthByKey.get("a")).toBe(0);
    expect(v.depthByKey.get("d")).toBe(2);
  });

  it("does not treat RELATED edges as ordering", () => {
    const v = validateGraph(
      graph(
        ["a", "b"],
        [
          ["a", "b", "RELATED", 0.5],
          ["b", "a", "RELATED", 0.5],
        ],
      ),
    );
    expect(v.rejected).toHaveLength(0);
    expect(v.depthByKey.get("a")).toBe(0);
    expect(v.depthByKey.get("b")).toBe(0);
  });

  it("is deterministic across runs", () => {
    const build = () =>
      validateGraph(
        graph(
          ["x", "y", "z"],
          [
            ["x", "y", "PREREQUISITE", 0.5],
            ["y", "z", "PREREQUISITE", 0.5],
            ["z", "x", "PREREQUISITE", 0.5],
          ],
        ),
      );
    expect(JSON.stringify(build().edges)).toBe(JSON.stringify(build().edges));
  });
});
