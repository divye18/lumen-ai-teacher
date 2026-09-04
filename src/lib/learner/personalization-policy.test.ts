import { describe, expect, it } from "vitest";

import type {
  LearningProfile,
  LearningSignal,
  LearningSignalKind,
} from "./learning-profile";
import {
  BASELINE_ADJUSTMENTS,
  MIN_SAMPLE_TO_PERSONALIZE,
  personalizeTeaching,
} from "./personalization-policy";

function signal(
  kind: LearningSignalKind,
  detail: LearningSignal["detail"] = {},
  confidence = 0.8,
): LearningSignal {
  return {
    kind,
    detail,
    summary: "…",
    evidence: {
      evidenceCount: 6,
      confidence,
      lastObservedAt: null,
      supportingInteractions: [],
    },
  };
}

function profile(signals: LearningSignal[], sampleSize = 12): LearningProfile {
  return {
    signals,
    sampleSize,
    computedAt: "2026-02-01T00:00:00.000Z",
    strongestConceptFamily: null,
    weakestConceptFamily: null,
  };
}

describe("personalizeTeaching", () => {
  it("returns the baseline when evidence is below the sample threshold", () => {
    const adj = personalizeTeaching(
      profile([signal("example-recovery")], MIN_SAMPLE_TO_PERSONALIZE - 1),
    );
    expect(adj).toEqual(BASELINE_ADJUSTMENTS);
  });

  it("returns the baseline when no signal clears the confidence bar", () => {
    const adj = personalizeTeaching(
      profile([signal("example-recovery", {}, 0.3)]),
    );
    expect(adj).toEqual(BASELINE_ADJUSTMENTS);
  });

  it("maps example-recovery to an example-first opener + concrete visual bias", () => {
    const adj = personalizeTeaching(
      profile([signal("example-recovery", { strategy: "example-first" })]),
    );
    expect(adj.preferConcreteExample).toBe(true);
    expect(adj.visualBias).toBe("concrete");
    expect(adj.preferredRemediation).toBe("example-first");
    expect(adj.note).toMatch(/example/i);
    expect(adj.basedOn).toContain("example-recovery");
  });

  it("maps a format weakness to a concrete target format", () => {
    const adj = personalizeTeaching(
      profile([
        signal("format-specific-weakness", { weakFormat: "ORDER_STEPS" }),
      ]),
    );
    expect(adj.targetFormatWeakness).toBe("ORDER_STEPS");
  });

  it("ignores an unknown weak-format value", () => {
    const adj = personalizeTeaching(
      profile([signal("format-specific-weakness", { weakFormat: "NONSENSE" })]),
    );
    expect(adj.targetFormatWeakness).toBeNull();
  });

  it("shifts toward application when recall is ahead", () => {
    const adj = personalizeTeaching(
      profile([signal("recall-ahead-of-application")]),
    );
    expect(adj.shiftTowardApplication).toBe(true);
  });

  it("is deterministic", () => {
    const p = profile([
      signal("example-recovery", { strategy: "analogy-first" }),
      signal("format-specific-weakness", { weakFormat: "CLASSIFY" }),
    ]);
    expect(JSON.stringify(personalizeTeaching(p))).toBe(
      JSON.stringify(personalizeTeaching(p)),
    );
  });

  it("picks a single note by priority when several signals are active", () => {
    const adj = personalizeTeaching(
      profile([
        signal("learning-momentum", { direction: "improving" }),
        signal("example-recovery", { strategy: "example-first" }),
      ]),
    );
    // example-recovery outranks learning-momentum for the surfaced sentence
    expect(adj.note).toMatch(/example/i);
  });

  describe("recurring-misconception note (9.3 progress-aware wording)", () => {
    it("ACTIVE (improving: false) keeps the existing note", () => {
      const adj = personalizeTeaching(
        profile([signal("recurring-misconception", { improving: false })]),
      );
      expect(adj.note).toBe(
        "Still targeting a mix-up that has come back more than once.",
      );
    });

    it("IMPROVING (improving: true) surfaces the progress-aware note", () => {
      const adj = personalizeTeaching(
        profile([signal("recurring-misconception", { improving: true })]),
      );
      expect(adj.note).toBe(
        "One more check on a mix-up you're already starting to clear.",
      );
      expect(adj.note).not.toBe(
        "Still targeting a mix-up that has come back more than once.",
      );
    });

    it("missing/undefined detail.improving falls back to the ACTIVE note (safe default)", () => {
      const adj = personalizeTeaching(
        profile([signal("recurring-misconception", {})]),
      );
      expect(adj.note).toBe(
        "Still targeting a mix-up that has come back more than once.",
      );
    });

    it("never leaks the raw status string into the note", () => {
      const adj = personalizeTeaching(
        profile([signal("recurring-misconception", { improving: true })]),
      );
      expect(adj.note).not.toMatch(/\bACTIVE\b|\bIMPROVING\b|\bRESOLVED\b/);
    });

    it("is deterministic", () => {
      const p = profile([
        signal("recurring-misconception", { improving: true }),
      ]);
      expect(JSON.stringify(personalizeTeaching(p))).toBe(
        JSON.stringify(personalizeTeaching(p)),
      );
    });
  });
});
