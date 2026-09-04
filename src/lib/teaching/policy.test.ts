import { describe, expect, it } from "vitest";

import type { EngineDecisionProposal } from "./contracts";
import {
  baselineDecision,
  nextQuestionKind,
  nextStrategy,
  reconcileDecision,
  type PolicyFacts,
} from "./policy";

function facts(over: Partial<PolicyFacts> = {}): PolicyFacts {
  return {
    masteryPoints: 50,
    previousMasteryPoints: 50,
    confidence: 0.5,
    attempts: 2,
    correctStreak: 0,
    incorrectStreak: 0,
    hintsRequested: 0,
    repeatedMisconception: false,
    activeMisconceptionCount: 0,
    conceptImportance: 3,
    conceptDifficulty: 3,
    timeRemainingMinutes: 20,
    lastClassification: null,
    lastCorrectnessScore: null,
    currentStrategy: "conversational",
    triedStrategies: [],
    lastQuestionKind: null,
    conceptsRemaining: 2,
    explanationsSinceQuestion: 0,
    currentConceptIsLoadBearing: false,
    weakUpstreamPrerequisite: null,
    ...over,
  };
}

function proposal(
  over: Partial<EngineDecisionProposal> = {},
): EngineDecisionProposal {
  return {
    action: "EXPLAIN",
    strategy: "conversational",
    difficultyDirection: "SAME",
    targetConceptKey: "page-faults",
    reason: "test",
    nextAction: null,
    ...over,
  };
}

describe("difficulty ladder", () => {
  it("advances definition → application → scenario → problem", () => {
    expect(nextQuestionKind(null, "SAME")).toBe("CONCEPTUAL");
    expect(nextQuestionKind("CONCEPTUAL", "HARDER")).toBe("APPLICATION");
    expect(nextQuestionKind("APPLICATION", "HARDER")).toBe("SCENARIO");
    expect(nextQuestionKind("SCENARIO", "HARDER")).toBe("PROBLEM_SOLVING");
    expect(nextQuestionKind("PROBLEM_SOLVING", "HARDER")).toBe(
      "PROBLEM_SOLVING",
    );
  });
  it("steps down on EASIER", () => {
    expect(nextQuestionKind("SCENARIO", "EASIER")).toBe("APPLICATION");
    expect(nextQuestionKind("CONCEPTUAL", "EASIER")).toBe("CONCEPTUAL");
  });
});

describe("strategy rotation", () => {
  it("picks an unused strategy", () => {
    expect(nextStrategy("formal", [])).not.toBe("formal");
    const next = nextStrategy("analogy-first", ["analogy-first", "formal"]);
    expect(["visual-first", "example-first", "socratic"]).toContain(next);
  });
  it("still rotates when everything was tried", () => {
    const all = [
      "formal",
      "analogy-first",
      "visual-first",
      "example-first",
      "socratic",
    ] as const;
    expect(all).toContain(nextStrategy("socratic", [...all]));
  });
});

describe("baselineDecision (deterministic policy)", () => {
  it("high mastery → raise difficulty, not repeat easy questions", () => {
    const d = baselineDecision(facts({ masteryPoints: 80 }));
    expect(["INCREASE_DIFFICULTY", "MOVE_FORWARD", "ASSESS"]).toContain(
      d.action,
    );
    expect(d.difficultyDirection).toBe("HARDER");
  });

  it("medium mastery → explain / ask", () => {
    const d = baselineDecision(
      facts({ masteryPoints: 55, lastClassification: null }),
    );
    expect(["ASK", "EXPLAIN"]).toContain(d.action);
  });

  it("incorrect answer → investigate rather than repeat the explanation", () => {
    const d = baselineDecision(
      facts({ lastClassification: "INCORRECT", masteryPoints: 40 }),
    );
    expect(["HINT", "SIMPLIFY", "EXPLAIN"]).toContain(d.action);
    expect(d.difficultyDirection).not.toBe("HARDER");
  });

  it("repeated misconception → RETEACH with a different strategy", () => {
    const d = baselineDecision(
      facts({ repeatedMisconception: true, currentStrategy: "formal" }),
    );
    expect(d.action).toBe("RETEACH");
    expect(d.strategy).not.toBe("formal");
    expect(d.adaptationNarrative.join(" ")).toMatch(/strateg/i);
  });

  it("repeated misconception but already retaught this turn → re-check, don't reteach again", () => {
    const d = baselineDecision(
      facts({
        repeatedMisconception: true,
        explanationsSinceQuestion: 1,
        masteryPoints: 20,
      }),
    );
    expect(d.action).toBe("ASK");
  });

  it("low time + adequate mastery → prioritise moving forward", () => {
    const d = baselineDecision(
      facts({ timeRemainingMinutes: 3, masteryPoints: 60 }),
    );
    expect(d.action).toBe("MOVE_FORWARD");
  });

  it("new concept, not yet explained → EXPLAIN", () => {
    const d = baselineDecision(
      facts({ masteryPoints: 0, attempts: 0, explanationsSinceQuestion: 0 }),
    );
    expect(d.action).toBe("EXPLAIN");
  });

  it("new concept already explained but never assessed → ASK (no explain loop)", () => {
    const d = baselineDecision(
      facts({ masteryPoints: 0, attempts: 0, explanationsSinceQuestion: 1 }),
    );
    expect(d.action).toBe("ASK");
  });

  it("graph-aware: a load-bearing concept is not hardened on 'developing' mastery", () => {
    const improved = {
      masteryPoints: 64,
      previousMasteryPoints: 52,
      attempts: 3,
      lastClassification: null,
      explanationsSinceQuestion: 0,
    } as const;
    // Without graph context, an improvement at this level → reassess harder.
    expect(baselineDecision(facts(improved)).action).toBe("ASSESS");
    // Load-bearing → hold difficulty and check once more instead.
    const d = baselineDecision(
      facts({ ...improved, currentConceptIsLoadBearing: true }),
    );
    expect(d.action).toBe("ASK");
    expect(d.difficultyDirection).not.toBe("HARDER");
    expect(d.adaptationNarrative.join(" ")).toMatch(/build|solid/i);
  });

  it("graph-aware: a weak upstream prerequisite is named in the narrative", () => {
    const d = baselineDecision(
      facts({
        masteryPoints: 40,
        attempts: 1,
        weakUpstreamPrerequisite: {
          title: "Virtual Memory",
          masteryPoints: 35,
        },
      }),
    );
    expect(d.adaptationNarrative.join(" ")).toMatch(/Virtual Memory/);
  });
});

describe("reconcileDecision (guardrails over the AI proposal)", () => {
  it("stops an AI that re-explains an unassessed concept repeatedly", () => {
    const d = reconcileDecision(
      proposal({ action: "EXPLAIN" }),
      facts({ attempts: 0, explanationsSinceQuestion: 2, masteryPoints: 20 }),
    );
    expect(d.action).toBe("ASK");
    expect(d.source).toBe("ai+policy");
  });

  it("graph-aware: blocks MOVE_FORWARD past a load-bearing concept below high mastery", () => {
    const d = reconcileDecision(
      proposal({ action: "MOVE_FORWARD", nextAction: null }),
      facts({
        masteryPoints: 64,
        incorrectStreak: 0,
        lastClassification: "CORRECT",
        currentConceptIsLoadBearing: true,
      }),
    );
    expect(d.action).toBe("ASK");
    expect(d.overrides.join(" ")).toMatch(/supports later material/i);
  });

  it("keeps a sensible proposal unchanged (source = ai)", () => {
    const d = reconcileDecision(
      proposal({ action: "EXPLAIN" }),
      facts({ masteryPoints: 45 }),
    );
    expect(d.action).toBe("EXPLAIN");
    expect(d.source).toBe("ai");
    expect(d.overrides).toHaveLength(0);
  });

  it("overrides MOVE_FORWARD when the learner just failed", () => {
    const d = reconcileDecision(
      proposal({ action: "MOVE_FORWARD" }),
      facts({
        masteryPoints: 35,
        incorrectStreak: 1,
        lastClassification: "INCORRECT",
      }),
    );
    expect(d.action).not.toBe("MOVE_FORWARD");
    expect(d.source).toBe("ai+policy");
    expect(d.overrides.length).toBeGreaterThan(0);
  });

  it("forces RETEACH + strategy switch on a repeated misconception", () => {
    const d = reconcileDecision(
      proposal({ action: "EXPLAIN", strategy: "formal" }),
      facts({
        repeatedMisconception: true,
        currentStrategy: "formal",
        triedStrategies: ["formal"],
      }),
    );
    expect(d.action).toBe("RETEACH");
    expect(d.strategy).not.toBe("formal");
    expect(d.difficultyDirection).toBe("EASIER");
  });

  it("refuses to raise difficulty right after an incorrect answer", () => {
    const d = reconcileDecision(
      proposal({ action: "ASK", difficultyDirection: "HARDER" }),
      facts({ lastClassification: "INCORRECT" }),
    );
    expect(d.difficultyDirection).not.toBe("HARDER");
  });

  it("prioritises high-value concepts when time is low", () => {
    const d = reconcileDecision(
      proposal({ action: "EXPLAIN" }),
      facts({ timeRemainingMinutes: 2, masteryPoints: 65 }),
    );
    expect(d.action).toBe("MOVE_FORWARD");
    expect(d.overrides.join(" ")).toMatch(/time/i);
  });

  it("always emits a non-empty adaptation narrative and never chain-of-thought", () => {
    const d = reconcileDecision(proposal(), facts());
    expect(d.adaptationNarrative.length).toBeGreaterThan(0);
    expect(d.adaptationNarrative.join(" ")).not.toMatch(
      /step 1|let me think|reasoning:/i,
    );
  });
});
