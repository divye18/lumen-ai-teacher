import { describe, expect, it } from "vitest";

import { visualDirectiveSchema } from "@/types/visuals";

import { resolveVisual, visualSignalFromState } from "./resolver";

const baseInput = {
  conceptKey: "memory-hierarchy",
  title: "Memory hierarchy",
  summary:
    "Storage is stacked in layers that trade size for speed: registers, cache, RAM, disk.",
  action: "EXPLAIN",
  strategy: "conversational",
  learnerSignal: "steady" as const,
};

describe("resolveVisual", () => {
  it("always returns a schema-valid directive", () => {
    for (const signal of [
      "struggling",
      "steady",
      "strong",
      "misconception",
    ] as const) {
      const r = resolveVisual({ ...baseInput, learnerSignal: signal });
      expect(() => visualDirectiveSchema.parse(r.directive)).not.toThrow();
    }
  });

  it("picks a catalogue entry for a known concept", () => {
    const r = resolveVisual(baseInput);
    expect(r.source).toBe("catalogue");
    expect(r.basis).toBe("memory-hierarchy");
    expect(r.directive.mode).toBe("THREE_D");
  });

  it("shows a simpler representation when the learner is struggling", () => {
    const steady = resolveVisual(baseInput);
    const struggling = resolveVisual({
      ...baseInput,
      learnerSignal: "struggling",
    });
    expect(steady.directive.mode).toBe("THREE_D");
    expect(struggling.directive.mode).toBe("COMPARISON"); // the `simple` variant
  });

  it("shows an alternate representation on a repeated misconception", () => {
    const r = resolveVisual({ ...baseInput, learnerSignal: "misconception" });
    expect(r.directive.mode).toBe("CONCEPT_MAP");
    expect(r.rationale).toMatch(/different way|mix-up/i);
  });

  it("uses the advanced variant for a strong learner", () => {
    const r = resolveVisual({ ...baseInput, learnerSignal: "strong" });
    expect(r.directive.mode).toBe("THREE_D");
    if (r.directive.mode === "THREE_D") {
      expect(r.directive.threeD.highlight.length).toBeGreaterThan(0);
    }
  });

  it("builds a COMPARISON heuristically for an uncatalogued 'X vs Y' concept", () => {
    const r = resolveVisual({
      conceptKey: "mutex-vs-semaphore",
      title: "Mutex vs Semaphore",
      summary:
        "A mutex is owned by one thread at a time. A semaphore is a counter that several threads can decrement.",
      action: "EXPLAIN",
      strategy: "conversational",
      learnerSignal: "steady",
    });
    expect(r.source).toBe("heuristic");
    expect(r.directive.mode).toBe("COMPARISON");
  });

  it("builds a process DIAGRAM heuristically for a 'how X works' concept", () => {
    const r = resolveVisual({
      conceptKey: "how-dns-works",
      title: "How DNS resolution works",
      summary:
        "The resolver asks the root server. The root points to the TLD server. The TLD points to the authoritative server. The authoritative server returns the record.",
      action: "EXPLAIN",
      strategy: "conversational",
      learnerSignal: "steady",
    });
    expect(r.directive.mode).toBe("DIAGRAM");
  });

  it("falls back to TEXT when nothing structured fits", () => {
    const r = resolveVisual({
      conceptKey: "vibes",
      title: "General vibes",
      summary: "It just is.",
      action: "EXPLAIN",
      strategy: "conversational",
      learnerSignal: "steady",
    });
    expect(r.source).toBe("text");
    expect(r.directive.mode).toBe("TEXT");
  });
});

describe("visualSignalFromState", () => {
  it("maps a repeated misconception first", () => {
    expect(
      visualSignalFromState({
        masteryPoints: 80,
        lastClassification: "CORRECT",
        repeatedMisconception: true,
        incorrectStreak: 0,
      }),
    ).toBe("misconception");
  });
  it("maps a recent wrong answer to struggling", () => {
    expect(
      visualSignalFromState({
        masteryPoints: 60,
        lastClassification: "INCORRECT",
        repeatedMisconception: false,
        incorrectStreak: 1,
      }),
    ).toBe("struggling");
  });
  it("maps high mastery to strong", () => {
    expect(
      visualSignalFromState({
        masteryPoints: 82,
        lastClassification: null,
        repeatedMisconception: false,
        incorrectStreak: 0,
      }),
    ).toBe("strong");
  });
});
