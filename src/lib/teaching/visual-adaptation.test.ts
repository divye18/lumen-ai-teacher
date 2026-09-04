import { describe, expect, it } from "vitest";

import { resolveVisual } from "@/lib/visuals";
import { visualDirectiveSchema } from "@/types/visuals";

import {
  deriveVisualIntent,
  visualIntentLabel,
  visualModeLabel,
  type VisualIntentContext,
} from "./visual-adaptation";

function ctx(over: Partial<VisualIntentContext> = {}): VisualIntentContext {
  return {
    masteryPoints: 40,
    previousMasteryPoints: 40,
    repeatedMisconception: false,
    lastClassification: null,
    incorrectStreak: 0,
    attempts: 1,
    action: "EXPLAIN",
    questionKind: null,
    strategy: "conversational",
    conceptImportance: 3,
    ...over,
  };
}

describe("deriveVisualIntent", () => {
  it("reframes on a repeated misconception, and passes the misconception signal through", () => {
    const r = deriveVisualIntent(ctx({ repeatedMisconception: true }));
    expect(r.intent).toBe("reframe");
    expect(r.complexity).toBe("minimal");
    expect(r.signal).toBe("misconception");
    expect(r.rationale).toMatch(/different way/i);
  });

  it("simplifies after an incorrect answer", () => {
    const r = deriveVisualIntent(ctx({ lastClassification: "INCORRECT" }));
    expect(r.intent).toBe("concrete");
    expect(r.complexity).toBe("minimal");
    expect(r.signal).toBe("struggling");
    expect(r.rationale).toMatch(/concrete|stripped/i);
  });

  it("mentions load-bearing concepts when simplifying an important one", () => {
    const r = deriveVisualIntent(
      ctx({ lastClassification: "INCORRECT", conceptImportance: 5 }),
    );
    expect(r.rationale).toMatch(/underpins later material/i);
  });

  it("starts concrete for a fresh, low-mastery concept", () => {
    const r = deriveVisualIntent(ctx({ masteryPoints: 20, attempts: 1 }));
    expect(r.intent).toBe("concrete");
    expect(r.rationale).toMatch(/simpler picture/i);
  });

  it("brings the connections back once mastery recovers", () => {
    const r = deriveVisualIntent(
      ctx({ masteryPoints: 58, previousMasteryPoints: 44 }),
    );
    expect(r.intent).toBe("connect");
    expect(r.complexity).toBe("rich");
    expect(r.rationale).toMatch(/ready for more/i);
  });

  it("shows the system-level view for a strong learner", () => {
    const r = deriveVisualIntent(
      ctx({ masteryPoints: 80, previousMasteryPoints: 78 }),
    );
    expect(r.intent).toBe("systemView");
    expect(r.signal).toBe("strong");
    expect(r.rationale).toMatch(/system-level/i);
  });

  it("connects ideas when a developing learner is applying the concept", () => {
    const r = deriveVisualIntent(
      ctx({
        masteryPoints: 55,
        previousMasteryPoints: 55,
        questionKind: "APPLICATION",
      }),
    );
    expect(r.intent).toBe("connect");
    expect(r.rationale).toMatch(/applying it/i);
  });

  it("falls back to reinforce for steady progress", () => {
    const r = deriveVisualIntent(ctx({ masteryPoints: 42 }));
    expect(r.intent).toBe("reinforce");
    expect(r.complexity).toBe("standard");
    expect(r.signal).toBe("steady");
  });

  it("richens the representation under a visual-first strategy", () => {
    const standard = deriveVisualIntent(ctx({ strategy: "conversational" }));
    const visual = deriveVisualIntent(ctx({ strategy: "visual-first" }));
    expect(standard.complexity).toBe("standard");
    expect(visual.complexity).toBe("rich");
  });

  it("never leaks internal reasoning vocabulary", () => {
    const cases: Partial<VisualIntentContext>[] = [
      { repeatedMisconception: true },
      { lastClassification: "INCORRECT" },
      { masteryPoints: 20 },
      { masteryPoints: 58, previousMasteryPoints: 44 },
      { masteryPoints: 82 },
      { masteryPoints: 42 },
    ];
    for (const c of cases) {
      const r = deriveVisualIntent(ctx(c));
      expect(r.rationale).not.toMatch(
        /policy|reconcile|token|chain-of-thought|LLM|prompt|signal=/i,
      );
      expect(r.rationale.length).toBeLessThan(140);
    }
  });

  it("is deterministic", () => {
    const c = ctx({ masteryPoints: 58, previousMasteryPoints: 44 });
    expect(JSON.stringify(deriveVisualIntent(c))).toBe(
      JSON.stringify(deriveVisualIntent(c)),
    );
  });
});

describe("deriveVisualIntent → resolveVisual pipeline", () => {
  it("always feeds the resolver a signal that yields a schema-valid directive", () => {
    const cases: Partial<VisualIntentContext>[] = [
      { repeatedMisconception: true },
      { lastClassification: "INCORRECT" },
      { masteryPoints: 20, attempts: 1 },
      { masteryPoints: 58, previousMasteryPoints: 44 },
      { masteryPoints: 82 },
      { masteryPoints: 42 },
    ];
    for (const c of cases) {
      const intent = deriveVisualIntent(ctx(c));
      const r = resolveVisual({
        conceptKey: "some-uncatalogued-topic",
        title: "Some uncatalogued topic",
        summary: "It just is what it is.",
        action: "EXPLAIN",
        strategy: "conversational",
        learnerSignal: intent.signal,
      });
      expect(() => visualDirectiveSchema.parse(r.directive)).not.toThrow();
    }
  });

  it("simplifies a catalogued concept when the intent is to be concrete", () => {
    const struggling = deriveVisualIntent(
      ctx({ lastClassification: "INCORRECT" }),
    );
    const steady = deriveVisualIntent(ctx({ masteryPoints: 42 }));
    const input = {
      conceptKey: "memory-hierarchy",
      title: "Memory hierarchy",
      summary:
        "Registers, cache, RAM, disk — each layer trades size for speed.",
      action: "EXPLAIN",
      strategy: "conversational" as const,
    };
    const strugglingVisual = resolveVisual({
      ...input,
      learnerSignal: struggling.signal,
    });
    const steadyVisual = resolveVisual({
      ...input,
      learnerSignal: steady.signal,
    });
    // Struggling gets the simpler 2D representation; steady gets the standard one.
    expect(strugglingVisual.directive.mode).toBe("COMPARISON");
    expect(steadyVisual.directive.mode).toBe("THREE_D");
  });
});

describe("labels", () => {
  it("maps every intent to a short label", () => {
    for (const intent of [
      "concrete",
      "reframe",
      "reinforce",
      "connect",
      "systemView",
    ] as const) {
      expect(visualIntentLabel(intent).length).toBeGreaterThan(0);
    }
  });

  it("maps visual modes to readable names", () => {
    expect(visualModeLabel("THREE_D")).toBe("3D model");
    expect(visualModeLabel("COMPARISON")).toBe("Comparison");
    expect(visualModeLabel("DIAGRAM")).toBe("Step-by-step diagram");
    expect(visualModeLabel("SOMETHING_ELSE")).toBe("Visual");
  });
});
