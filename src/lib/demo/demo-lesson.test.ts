import { describe, expect, it } from "vitest";

import { lessonPlanSchema } from "@/lib/teaching/contracts";
import { resolveVisual } from "@/lib/visuals";
import { resolveScene, isRenderableScene } from "@/lib/scene";

import { DEMO_LESSON_PLAN } from "./demo-lesson";

describe("demo lesson", () => {
  it("is a valid lesson plan", () => {
    expect(() => lessonPlanSchema.parse(DEMO_LESSON_PLAN)).not.toThrow();
  });

  it("every concept resolves to a real (non-text) catalogue visual", () => {
    for (const concept of DEMO_LESSON_PLAN.concepts) {
      const r = resolveVisual({
        conceptKey: concept.key,
        title: concept.title,
        summary: concept.summary,
        action: "EXPLAIN",
        strategy: "visual-first",
        learnerSignal: "steady",
      });
      expect(r.source).toBe("catalogue");
      expect(r.directive.mode).not.toBe("TEXT");
    }
  });

  it("its 3D visuals resolve to a renderable scene end-to-end", () => {
    for (const concept of DEMO_LESSON_PLAN.concepts) {
      const r = resolveVisual({
        conceptKey: concept.key,
        title: concept.title,
        summary: concept.summary,
        action: "EXPLAIN",
        strategy: "visual-first",
        learnerSignal: "steady",
      });
      if (r.directive.mode !== "THREE_D") continue;
      expect(isRenderableScene(r.directive)).toBe(true);
      expect(resolveScene(r.directive.threeD).ok).toBe(true);
    }
  });

  it("adapts: a struggling learner on concept 1 gets a simpler visual than a strong one", () => {
    const concept = DEMO_LESSON_PLAN.concepts[0];
    const common = {
      conceptKey: concept.key,
      title: concept.title,
      summary: concept.summary,
      action: "EXPLAIN",
      strategy: "conversational",
    } as const;
    const struggling = resolveVisual({
      ...common,
      learnerSignal: "struggling",
    });
    const strong = resolveVisual({ ...common, learnerSignal: "strong" });
    expect(struggling.directive.mode).not.toBe(strong.directive.mode);
  });
});
