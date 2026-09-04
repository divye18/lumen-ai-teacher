import { describe, expect, it } from "vitest";

import { resolveScene, isRenderableScene } from "./resolver";
import { SCENE_OBJECT_TYPES } from "./types";

function directive(over: Record<string, unknown> = {}) {
  return {
    scene: "memory_hierarchy",
    highlight: [],
    dim: [],
    labels: [],
    objects: [],
    ...over,
  } as Parameters<typeof resolveScene>[0];
}

describe("resolveScene", () => {
  it("resolves a known scene to a full SceneState", () => {
    const r = resolveScene(directive());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.id).toBe("memory_hierarchy");
      expect(r.value.objects.length).toBeGreaterThan(3);
      expect(r.value.steps.length).toBeGreaterThan(1);
      // every object type is on the renderer whitelist
      for (const o of r.value.objects) {
        expect(SCENE_OBJECT_TYPES).toContain(o.type);
      }
    }
  });

  it("rejects an unknown scene id", () => {
    const r = resolveScene(directive({ scene: "quantum_foam" }));
    expect(r.ok).toBe(false);
  });

  it("applies directive highlights and drops unknown keys", () => {
    const r = resolveScene(
      directive({ highlight: ["l1", "cpu", "not-a-real-key"] }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const hot = r.value.objects
        .filter((o) => o.highlighted)
        .map((o) => o.key);
      expect(hot.sort()).toEqual(["cpu", "l1"]);
    }
  });

  it("clamps an out-of-range step and uses that step's highlights", () => {
    const r = resolveScene(directive({ step: 999, highlight: [] }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.activeStep).toBe(r.value.steps.length - 1);
    }
  });

  it("ignores an unknown camera preset and falls back", () => {
    const r = resolveScene(
      directive({ camera: { preset: "javascript:alert(1)" } }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect([
        "front",
        "hero",
        "orbit-left",
        "orbit-right",
        "top",
        "close",
      ]).toContain(r.value.camera);
    }
  });

  it("overrides a label from the directive", () => {
    const r = resolveScene(
      directive({ labels: [{ target: "ram", text: "the slow one" }] }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.objects.find((o) => o.key === "ram")?.label).toBe(
        "the slow one",
      );
    }
  });

  it("is deterministic", () => {
    const a = JSON.stringify(resolveScene(directive({ step: 1 })));
    const b = JSON.stringify(resolveScene(directive({ step: 1 })));
    expect(a).toBe(b);
  });
});

describe("isRenderableScene", () => {
  it("is true only for a THREE_D directive naming a catalogue scene", () => {
    expect(
      isRenderableScene({ mode: "THREE_D", threeD: { scene: "call_stack" } }),
    ).toBe(true);
    expect(
      isRenderableScene({ mode: "THREE_D", threeD: { scene: "made_up" } }),
    ).toBe(false);
    expect(isRenderableScene({ mode: "TEXT", caption: "x" })).toBe(false);
    expect(isRenderableScene(null)).toBe(false);
  });
});
