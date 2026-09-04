import { describe, expect, it } from "vitest";

import type { DecisionView, InteractionResultView } from "@/lib/session/views";

import { buildSessionEvents } from "./session-events";

function decision(over: Partial<DecisionView> = {}): DecisionView {
  return {
    action: "EXPLAIN",
    strategy: "conversational",
    difficultyDirection: "SAME",
    targetConceptKey: "cache",
    reason: "…",
    nextAction: null,
    source: "policy",
    adaptationNarrative: [],
    overrides: [],
    whyThisNext: null,
    personalizationNote: null,
    ...over,
  };
}

function result(
  classification: string,
  over: Partial<InteractionResultView["learnerUpdate"]> = {},
): InteractionResultView {
  return {
    sessionId: "s",
    evaluation: {
      classification,
      correctnessScore: 0.5,
      confidence: 0.5,
      reasoningQuality: "partial",
      source: "structured",
      misconceptionInsight: null,
      misconception: null,
      breakdown: null,
      missingConcepts: [],
      feedback: "…",
    },
    learnerUpdate: {
      conceptKey: "cache",
      masteryBefore: 40,
      masteryAfter: 52,
      masteryBand: "Emerging",
      confidenceBefore: 0.4,
      confidenceAfter: 0.5,
      reason: "…",
      newMisconceptions: 0,
      reinforcedMisconceptions: 0,
      repeatedMisconception: false,
      ...over,
    },
    nextDecision: decision(),
    nextRepresentation: null,
    intelligence: null,
    learningEvent: null,
    liveStatus: null,
    progress: {
      conceptIndex: 0,
      conceptCount: 2,
      conceptsCompleted: 0,
      currentConceptKey: "cache",
      timeElapsedMinutes: 1,
      timeRemainingMinutes: 20,
    },
    sessionStatus: "ACTIVE",
  };
}

describe("buildSessionEvents", () => {
  const titles = { cache: "Cache vs RAM", locality: "Locality" };

  it("records a concept start once per concept", () => {
    const events = buildSessionEvents({
      decisions: [
        decision({ targetConceptKey: "cache" }),
        decision({ targetConceptKey: "cache", action: "ASK" }),
        decision({ targetConceptKey: "locality" }),
      ],
      results: [],
      conceptTitles: titles,
      startedAtMs: Date.now(),
    });
    const starts = events.filter((e) => e.kind === "concept");
    expect(starts.map((e) => e.label)).toEqual(["Cache vs RAM", "Locality"]);
  });

  it("attributes a correct answer to a real result", () => {
    const events = buildSessionEvents({
      decisions: [decision({ action: "ASK", targetConceptKey: "cache" })],
      results: [result("CORRECT")],
      conceptTitles: titles,
      startedAtMs: Date.now(),
    });
    expect(events.some((e) => e.kind === "correct")).toBe(true);
  });

  it("records a detected misconception from real learner-update data", () => {
    const events = buildSessionEvents({
      decisions: [decision({ action: "ASK", targetConceptKey: "cache" })],
      results: [result("INCORRECT", { newMisconceptions: 1 })],
      conceptTitles: titles,
      startedAtMs: Date.now(),
    });
    expect(events.some((e) => e.kind === "misconception")).toBe(true);
  });

  it("records a strategy switch only on RETEACH with a changed strategy", () => {
    const events = buildSessionEvents({
      decisions: [
        decision({ strategy: "conversational" }),
        decision({ action: "RETEACH", strategy: "analogy-first" }),
      ],
      results: [],
      conceptTitles: titles,
      startedAtMs: Date.now(),
    });
    expect(events.some((e) => e.kind === "strategy")).toBe(true);
    expect(events.some((e) => e.kind === "reteach")).toBe(true);
  });

  it("records a worked example and a difficulty increase as their own events", () => {
    const events = buildSessionEvents({
      decisions: [
        decision({ action: "EXAMPLE", targetConceptKey: "cache" }),
        decision({ action: "INCREASE_DIFFICULTY", targetConceptKey: "cache" }),
      ],
      results: [],
      conceptTitles: titles,
      startedAtMs: Date.now(),
    });
    expect(events.some((e) => e.kind === "example")).toBe(true);
    expect(events.some((e) => e.kind === "difficulty")).toBe(true);
  });

  it("fabricates nothing when there is no history", () => {
    expect(
      buildSessionEvents({
        decisions: [],
        results: [],
        conceptTitles: titles,
        startedAtMs: null,
      }),
    ).toEqual([]);
  });
});
