import { describe, expect, it } from "vitest";

import {
  buildDiagnosticSummaryView,
  resolveDiagnosticSummaryPhase,
} from "./diagnostic-summary";
import {
  buildStoredDiagnosticState,
  type StoredDiagnosticSummary,
} from "./diagnostic-flow";
import { selectDiagnosticQuestionSet } from "@/lib/assessment/diagnostic";

const strongConcept = {
  conceptKey: "memory-hierarchy",
  conceptTitle: "Memory hierarchy",
};
const developingConcept = {
  conceptKey: "cache-vs-ram",
  conceptTitle: "Cache vs RAM",
};
const weakConcept = {
  conceptKey: "locality",
  conceptTitle: "Locality of reference",
};
const prereqConcept = {
  conceptKey: "call-stack",
  conceptTitle: "The call stack",
};

const emptySummary: StoredDiagnosticSummary = {
  strong: [],
  developing: [],
  weak: [],
  weakLoadBearing: [],
  gap: null,
};

describe("buildDiagnosticSummaryView", () => {
  // 1. Strong concepts render with their titles.
  it("carries strong concept titles through unchanged", () => {
    const view = buildDiagnosticSummaryView({
      ...emptySummary,
      strong: [strongConcept],
    });
    expect(view.strong).toEqual([strongConcept]);
  });

  // 2. Developing concepts render with their titles.
  it("carries developing concept titles through unchanged", () => {
    const view = buildDiagnosticSummaryView({
      ...emptySummary,
      developing: [developingConcept],
    });
    expect(view.developing).toEqual([developingConcept]);
  });

  // 3. Weak concepts render with their titles.
  it("carries weak concept titles through unchanged", () => {
    const view = buildDiagnosticSummaryView({
      ...emptySummary,
      weak: [weakConcept],
    });
    expect(view.weak).toEqual([weakConcept]);
  });

  // 9. Does not invent facts: no gap in -> no gap out, no invented concept.
  it("produces mostImportantGap: null when no gap evidence was found", () => {
    const view = buildDiagnosticSummaryView({
      ...emptySummary,
      weak: [weakConcept],
    });
    expect(view.mostImportantGap).toBeNull();
  });

  // 9/10. The gap reason only names the concepts actually provided as evidence.
  it("builds a gap reason using only the given evidence, nothing invented", () => {
    const summary: StoredDiagnosticSummary = {
      ...emptySummary,
      weak: [weakConcept],
      weakLoadBearing: [weakConcept],
      gap: {
        conceptKey: weakConcept.conceptKey,
        conceptTitle: weakConcept.conceptTitle,
        prerequisiteConceptKey: prereqConcept.conceptKey,
        prerequisiteConceptTitle: prereqConcept.conceptTitle,
      },
    };
    const view = buildDiagnosticSummaryView(summary);
    expect(view.mostImportantGap).not.toBeNull();
    expect(view.mostImportantGap!.conceptKey).toBe(weakConcept.conceptKey);
    expect(view.mostImportantGap!.prerequisiteConceptKey).toBe(
      prereqConcept.conceptKey,
    );
    expect(view.mostImportantGap!.reason).toContain(prereqConcept.conceptTitle);
    expect(view.mostImportantGap!.reason).toContain(weakConcept.conceptTitle);
  });

  // 7. Adaptation note is deterministic.
  it("is deterministic for the same input", () => {
    const summary: StoredDiagnosticSummary = {
      ...emptySummary,
      strong: [strongConcept],
      weak: [weakConcept],
    };
    const a = buildDiagnosticSummaryView(summary);
    const b = buildDiagnosticSummaryView(summary);
    expect(a).toEqual(b);
  });

  it("prioritizes the gap in the adaptation note when one exists", () => {
    const summary: StoredDiagnosticSummary = {
      ...emptySummary,
      weak: [weakConcept],
      gap: {
        conceptKey: weakConcept.conceptKey,
        conceptTitle: weakConcept.conceptTitle,
        prerequisiteConceptKey: prereqConcept.conceptKey,
        prerequisiteConceptTitle: prereqConcept.conceptTitle,
      },
    };
    const view = buildDiagnosticSummaryView(summary);
    expect(view.adaptationNote).toContain(prereqConcept.conceptTitle);
    expect(view.adaptationNote).toContain(weakConcept.conceptTitle);
  });

  it("falls back to the weak list when there is no gap", () => {
    const view = buildDiagnosticSummaryView({
      ...emptySummary,
      weak: [weakConcept],
    });
    expect(view.adaptationNote).toContain(weakConcept.conceptTitle);
  });

  it("falls back to the developing list when nothing is weak", () => {
    const view = buildDiagnosticSummaryView({
      ...emptySummary,
      developing: [developingConcept],
    });
    expect(view.adaptationNote).toContain(developingConcept.conceptTitle);
  });

  it("gives a confident note when everything is strong", () => {
    const view = buildDiagnosticSummaryView({
      ...emptySummary,
      strong: [strongConcept],
    });
    expect(view.adaptationNote.length).toBeGreaterThan(0);
    expect(view.adaptationNote).not.toContain("undefined");
  });

  // 8. Empty/partial diagnostic data is handled safely.
  it("handles a fully empty summary without throwing and without inventing facts", () => {
    const view = buildDiagnosticSummaryView(emptySummary);
    expect(view.strong).toEqual([]);
    expect(view.developing).toEqual([]);
    expect(view.weak).toEqual([]);
    expect(view.mostImportantGap).toBeNull();
    expect(typeof view.adaptationNote).toBe("string");
    expect(view.adaptationNote.length).toBeGreaterThan(0);
  });

  it("avoids language claiming certainty the diagnostic didn't establish", () => {
    const view = buildDiagnosticSummaryView({
      ...emptySummary,
      weak: [weakConcept],
    });
    expect(view.adaptationNote.toLowerCase()).not.toContain(
      "you don't understand",
    );
  });
});

describe("resolveDiagnosticSummaryPhase", () => {
  const set = selectDiagnosticQuestionSet(
    [{ key: "memory-hierarchy", title: "Memory hierarchy", summary: "x" }],
    [],
  );
  const inProgress = buildStoredDiagnosticState(
    "a1",
    set,
    "2026-01-01T00:00:00.000Z",
  );
  const completed = {
    ...inProgress,
    status: "COMPLETED" as const,
    summary: { ...emptySummary, strong: [strongConcept] },
  };

  // 12. Returning learners are not given a diagnostic summary.
  it("returns null when no diagnostic was ever started", () => {
    expect(resolveDiagnosticSummaryPhase(null, null)).toBeNull();
  });

  it("returns null while the diagnostic is still pending (not completed)", () => {
    expect(resolveDiagnosticSummaryPhase(inProgress, "DIAGNOSTIC")).toBeNull();
  });

  // 11. Refresh/resume: still shown while un-acknowledged (current_action holds).
  it("returns the summary view when completed and not yet acknowledged", () => {
    const view = resolveDiagnosticSummaryPhase(completed, "DIAGNOSTIC_SUMMARY");
    expect(view).not.toBeNull();
    expect(view!.strong).toEqual([strongConcept]);
  });

  it("is stable across repeated calls with the same stored state (reload-safe)", () => {
    const first = resolveDiagnosticSummaryPhase(
      completed,
      "DIAGNOSTIC_SUMMARY",
    );
    const second = resolveDiagnosticSummaryPhase(
      completed,
      "DIAGNOSTIC_SUMMARY",
    );
    expect(first).toEqual(second);
  });

  // 11/12. Once acknowledged (current_action cleared), never reappears.
  it("returns null once acknowledged, even though the completed state is still stored", () => {
    expect(resolveDiagnosticSummaryPhase(completed, null)).toBeNull();
  });
});
