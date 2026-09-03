import { describe, expect, it } from "vitest";

import { layoutGraph } from "./layout";

describe("layoutGraph", () => {
  it("places concepts in columns by prerequisite depth", () => {
    const l = layoutGraph([
      { key: "a", depth: 0, importance: 0.5 },
      { key: "b", depth: 1, importance: 0.5 },
      { key: "c", depth: 2, importance: 0.5 },
    ]);
    expect(l.layerCount).toBe(3);
    expect(l.positions.get("a")!.x).toBe(0);
    expect(l.positions.get("c")!.x).toBe(1);
    expect(l.positions.get("b")!.x).toBeCloseTo(0.5);
  });

  it("orders a layer by importance then key, deterministically", () => {
    const nodes = [
      { key: "low", depth: 0, importance: 0.1 },
      { key: "high", depth: 0, importance: 0.9 },
      { key: "mid", depth: 0, importance: 0.5 },
    ];
    const a = layoutGraph(nodes);
    const b = layoutGraph([...nodes].reverse());
    expect(a.positions.get("high")!.row).toBe(0);
    expect(a.positions.get("low")!.row).toBe(2);
    expect(b.positions.get("high")!.row).toBe(0);
  });

  it("handles an empty graph", () => {
    const l = layoutGraph([]);
    expect(l.layerCount).toBe(0);
    expect(l.positions.size).toBe(0);
  });
});
