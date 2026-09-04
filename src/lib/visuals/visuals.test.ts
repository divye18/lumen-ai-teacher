import { describe, expect, it } from "vitest";

import { coerceVisualDirective, validateVisualDirective } from "./index";

describe("validateVisualDirective", () => {
  it("accepts a well-formed TEXT directive", () => {
    const result = validateVisualDirective({ mode: "TEXT", caption: "Hello" });
    expect(result.ok).toBe(true);
  });

  it("accepts a THREE_D directive with known-shape fields", () => {
    const result = validateVisualDirective({
      mode: "THREE_D",
      threeD: {
        scene: "solar-system",
        highlight: ["earth"],
        objects: [{ key: "earth", type: "planet" }],
      },
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a directive with an unknown mode", () => {
    const result = validateVisualDirective({ mode: "EXECUTE_JS" });
    expect(result.ok).toBe(false);
  });

  it("rejects scene identifiers that look like URLs or paths", () => {
    const result = validateVisualDirective({
      mode: "THREE_D",
      threeD: { scene: "https://evil.example/pwn" },
    });
    expect(result.ok).toBe(false);
  });

  it("degrades to a TEXT fallback instead of throwing", () => {
    const directive = coerceVisualDirective({ mode: "nonsense" }, "fallback");
    expect(directive).toEqual({ mode: "TEXT", caption: "fallback" });
  });

  it("accepts the Phase-4 modes with well-formed data", () => {
    expect(
      validateVisualDirective({
        mode: "COMPARISON",
        comparison: {
          title: "Cache vs RAM",
          left: { title: "Cache", points: ["fast", "small"] },
          right: { title: "RAM", points: ["slow", "big"] },
          rows: [],
        },
      }).ok,
    ).toBe(true);
    expect(
      validateVisualDirective({
        mode: "FORMULA",
        formula: { expression: "AMAT = HitTime + MissRate x MissPenalty" },
      }).ok,
    ).toBe(true);
    expect(
      validateVisualDirective({
        mode: "TIMELINE",
        timeline: { events: [{ label: "start" }, { label: "end" }] },
      }).ok,
    ).toBe(true);
    expect(
      validateVisualDirective({
        mode: "CONCEPT_MAP",
        conceptMap: { root: "Cache", branches: [{ label: "L1" }] },
      }).ok,
    ).toBe(true);
  });

  it("rejects a directive carrying HTML / script in a structured field", () => {
    expect(
      validateVisualDirective({
        mode: "DIAGRAM",
        diagram: {
          nodes: [{ key: "<script>alert(1)</script>", text: "x" }],
          edges: [],
        },
      }).ok,
    ).toBe(false);
  });

  it("rejects a THREE_D object whose type is a path", () => {
    expect(
      validateVisualDirective({
        mode: "THREE_D",
        threeD: {
          scene: "memory_hierarchy",
          objects: [{ key: "x", type: "../../etc/passwd" }],
        },
      }).ok,
    ).toBe(false);
  });
});
