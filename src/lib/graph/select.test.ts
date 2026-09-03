import { describe, expect, it } from "vitest";

import { buildGraphTeachingSignal, loadBearingExplanation } from "./select";

const CONCEPTS = [
  {
    normalizedKey: "vm",
    title: "Virtual Memory",
    masteryPoints: 40,
    assessed: true,
    importance: 0.8,
  },
  {
    normalizedKey: "pf",
    title: "Page Faults",
    masteryPoints: 55,
    assessed: true,
    importance: 0.7,
  },
  {
    normalizedKey: "thrash",
    title: "Thrashing",
    masteryPoints: 0,
    assessed: false,
    importance: 0.6,
  },
];

const EDGES = [
  { sourceKey: "vm", targetKey: "pf", type: "PREREQUISITE" as const },
  { sourceKey: "pf", targetKey: "thrash", type: "PREREQUISITE" as const },
];

describe("buildGraphTeachingSignal", () => {
  it("flags the current concept as load-bearing when something important depends on it", () => {
    const signal = buildGraphTeachingSignal({
      concepts: CONCEPTS,
      edges: EDGES,
      currentNormalizedKey: "pf",
    });
    expect(signal.currentConceptIsLoadBearing).toBe(true);
    expect(signal.dependentCount).toBe(1);
  });

  it("surfaces a weak upstream prerequisite", () => {
    const signal = buildGraphTeachingSignal({
      concepts: CONCEPTS,
      edges: EDGES,
      currentNormalizedKey: "pf",
    });
    expect(signal.weakUpstreamPrerequisite).toEqual({
      title: "Virtual Memory",
      masteryPoints: 40,
    });
  });

  it("returns an inert signal for a leaf concept", () => {
    const signal = buildGraphTeachingSignal({
      concepts: CONCEPTS,
      edges: EDGES,
      currentNormalizedKey: "thrash",
    });
    expect(signal.currentConceptIsLoadBearing).toBe(false);
    expect(signal.dependentCount).toBe(0);
  });

  it("returns an inert signal when there is no current concept", () => {
    const signal = buildGraphTeachingSignal({
      concepts: CONCEPTS,
      edges: EDGES,
      currentNormalizedKey: null,
    });
    expect(signal).toEqual({
      currentConceptIsLoadBearing: false,
      dependentCount: 0,
      weakUpstreamPrerequisite: null,
    });
  });
});

describe("loadBearingExplanation", () => {
  it("names the weak prerequisite when there is one", () => {
    const text = loadBearingExplanation(
      {
        currentConceptIsLoadBearing: true,
        dependentCount: 1,
        weakUpstreamPrerequisite: {
          title: "Virtual Memory",
          masteryPoints: 40,
        },
      },
      "Page Faults",
    );
    expect(text).toMatch(/Virtual Memory/);
    expect(text).toMatch(/Page Faults/);
  });

  it("is null when nothing notable is going on", () => {
    expect(
      loadBearingExplanation(
        {
          currentConceptIsLoadBearing: false,
          dependentCount: 0,
          weakUpstreamPrerequisite: null,
        },
        "X",
      ),
    ).toBeNull();
  });
});
