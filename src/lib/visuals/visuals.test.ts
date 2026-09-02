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
});
