import { describe, expect, it } from "vitest";

import type {
  ConceptMasteryRow,
  InteractionRow,
  LearnerProfileRow,
  LearningSessionRow,
  MisconceptionRow,
} from "@/lib/db/repositories";

import { assembleLearnerState, type LearnerStateBundle } from "./assemble";

const USER = "00000000-0000-0000-0000-000000000001";
const SESSION = "5e550000-0000-0000-0000-000000000001";
const CPU = "c0000000-0000-0000-0000-000000000001";
const HEAP = "c0000000-0000-0000-0000-000000000006";

function masteryRow(over: Partial<ConceptMasteryRow>): ConceptMasteryRow {
  return {
    id: crypto.randomUUID(),
    user_id: USER,
    concept_id: CPU,
    mastery_score: 0.5,
    confidence_score: 0.5,
    attempt_count: 2,
    correct_count: 1,
    incorrect_count: 1,
    misconception_count: 0,
    last_attempt_at: "2026-09-01T10:00:00.000Z",
    last_correct_at: "2026-09-01T10:00:00.000Z",
    preferred_strategy: null,
    status: "LEARNING",
    evidence_summary: null,
    created_at: "2026-09-01T09:00:00.000Z",
    updated_at: "2026-09-01T10:00:00.000Z",
    ...over,
  };
}

function interactionRow(over: Partial<InteractionRow>): InteractionRow {
  return {
    id: crypto.randomUUID(),
    session_id: SESSION,
    user_id: USER,
    concept_id: CPU,
    role: "STUDENT",
    interaction_type: "ANSWER",
    content: "an answer",
    metadata: {},
    created_at: "2026-09-01T10:00:00.000Z",
    ...over,
  };
}

const profile: LearnerProfileRow = {
  id: crypto.randomUUID(),
  user_id: USER,
  current_level: 2,
  learning_goal: "Understand memory",
  available_time_minutes: 30,
  preferred_language: "hi",
  preferred_learning_strategy: "analogy-first",
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
};

const session: LearningSessionRow = {
  id: SESSION,
  user_id: USER,
  title: "Intro",
  topic: "Computer Memory",
  language: "en",
  goal: "session goal",
  status: "ACTIVE",
  current_concept_id: HEAP,
  started_at: "2026-09-01T09:30:00.000Z",
  ended_at: null,
  created_at: "2026-09-01T09:30:00.000Z",
  updated_at: "2026-09-01T09:30:00.000Z",
  lesson_id: null,
  time_budget_minutes: null,
  current_action: null,
  plan_cursor: 0,
  mastery_snapshot: {},
};

const misconception: MisconceptionRow = {
  id: "d1530000-0000-0000-0000-000000000001",
  user_id: USER,
  concept_id: HEAP,
  session_id: SESSION,
  interaction_id: null,
  category: "memory-lifecycle",
  description: "heap frees itself",
  severity: "HIGH",
  confidence: 0.8,
  status: "ACTIVE",
  first_detected_at: "2026-09-01T10:00:00.000Z",
  last_detected_at: "2026-09-01T10:00:00.000Z",
  resolved_at: null,
  evidence: [],
  metadata: {},
};

function bundle(over: Partial<LearnerStateBundle> = {}): LearnerStateBundle {
  return {
    userId: USER,
    session,
    profile,
    mastery: [
      masteryRow({
        concept_id: CPU,
        attempt_count: 4,
        correct_count: 4,
        incorrect_count: 0,
      }),
      masteryRow({
        concept_id: HEAP,
        attempt_count: 3,
        correct_count: 1,
        incorrect_count: 2,
      }),
    ],
    misconceptions: [misconception],
    recentInteractions: [
      interactionRow({ concept_id: CPU, content: "  lots   of   space " }),
      interactionRow({ concept_id: null, content: "system note" }),
    ],
    ...over,
  };
}

describe("assembleLearnerState", () => {
  it("produces a state that matches the LearnerState contract", () => {
    const state = assembleLearnerState(bundle());
    expect(state.learnerId).toBe(USER);
    expect(state.sessionId).toBe(SESSION);
    expect(state.currentConceptSlug).toBe(HEAP);
    expect(state.currentLessonId).toBeUndefined();
  });

  it("keys concept mastery uniquely by concept and sums totals", () => {
    const state = assembleLearnerState(bundle());
    expect(Object.keys(state.conceptMastery).sort()).toEqual(
      [CPU, HEAP].sort(),
    );
    expect(state.totals).toEqual({ attempts: 7, correct: 5, incorrect: 2 });
  });

  it("attaches active misconception ids to the right concept", () => {
    const state = assembleLearnerState(bundle());
    expect(state.conceptMastery[HEAP].activeMisconceptionIds).toEqual([
      "d1530000-0000-0000-0000-000000000001",
    ]);
    expect(state.conceptMastery[CPU].activeMisconceptionIds).toEqual([]);
  });

  it("ignores resolved misconceptions", () => {
    const state = assembleLearnerState(
      bundle({
        misconceptions: [{ ...misconception, status: "RESOLVED" }],
      }),
    );
    expect(state.conceptMastery[HEAP].activeMisconceptionIds).toEqual([]);
  });

  it("uses the learner profile for language, goal and strategy", () => {
    const state = assembleLearnerState(bundle());
    expect(state.language).toBe("hi");
    expect(state.learningGoal).toBe("Understand memory");
    expect(state.preferredExplanationStrategy).toBe("analogy-first");
    expect(state.availableTimeMinutes).toBe(30);
  });

  it("falls back to a safe strategy when the stored value is invalid", () => {
    const state = assembleLearnerState(
      bundle({
        profile: { ...profile, preferred_learning_strategy: "telepathy" },
      }),
    );
    expect(state.preferredExplanationStrategy).toBe("conversational");
  });

  it("condenses interaction content into a one-line digest", () => {
    const state = assembleLearnerState(bundle());
    expect(state.recentInteractions[0].digest).toBe("lots of space");
    expect(state.recentInteractions[1].conceptSlug).toBe("");
  });

  it("works with no session, profile, mastery or interactions", () => {
    const state = assembleLearnerState({
      userId: USER,
      session: null,
      profile: null,
      mastery: [],
      misconceptions: [],
      recentInteractions: [],
    });
    expect(state.sessionId).toBe("");
    expect(state.language).toBe("en");
    expect(state.totals).toEqual({ attempts: 0, correct: 0, incorrect: 0 });
    expect(state.preferredExplanationStrategy).toBe("conversational");
    expect(typeof state.lastSeenAt).toBe("string");
  });
});
