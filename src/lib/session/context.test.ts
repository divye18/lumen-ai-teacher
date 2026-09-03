import { describe, expect, it } from "vitest";

import type {
  ClientTeachingQuestion,
  ConceptMasteryRow,
  InteractionRow,
  LearningSessionRow,
  LessonConceptRow,
  LessonRow,
  MisconceptionRow,
  TeachingAnswerRow,
} from "@/lib/db/repositories";

import {
  buildEngineSignal,
  buildPolicyFacts,
  currentStrategy,
  triedStrategies,
  type SessionContextData,
} from "./context";

const USER = "00000000-0000-0000-0000-000000000001";
const SESSION = "5e550000-0000-0000-0000-000000000001";
const CONCEPT_ID = "c0000000-0000-0000-0000-000000000001";

function session(over: Partial<LearningSessionRow> = {}): LearningSessionRow {
  return {
    id: SESSION,
    user_id: USER,
    title: "Virtual Memory",
    topic: "Operating Systems",
    language: "en",
    goal: "Understand paging",
    status: "ACTIVE",
    current_concept_id: CONCEPT_ID,
    started_at: new Date(Date.now() - 10 * 60_000).toISOString(),
    ended_at: null,
    created_at: new Date(Date.now() - 10 * 60_000).toISOString(),
    updated_at: new Date().toISOString(),
    lesson_id: "1e550000-0000-0000-0000-000000000001",
    time_budget_minutes: 20,
    current_action: "ASK",
    plan_cursor: 0,
    mastery_snapshot: {},
    ...over,
  };
}

const lesson: LessonRow = {
  id: "1e550000-0000-0000-0000-000000000001",
  user_id: USER,
  document_id: null,
  title: "Operating Systems",
  topic: "Operating Systems",
  objective: "Understand demand paging",
  language: "en",
  teaching_style: "analogy-first",
  estimated_minutes: 20,
  source_grounded: false,
  plan_source: "fallback",
  status: "ACTIVE",
  plan: {},
  citations: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function concept(over: Partial<LessonConceptRow> = {}): LessonConceptRow {
  return {
    id: "lc000000-0000-0000-0000-000000000001",
    lesson_id: lesson.id,
    concept_id: CONCEPT_ID,
    concept_key: "page-faults",
    title: "Page Faults",
    summary: "What the OS does on a non-resident page reference.",
    position: 0,
    difficulty: 3,
    importance: 5,
    is_prerequisite: false,
    status: "TEACHING",
    created_at: new Date().toISOString(),
    ...over,
  };
}

function masteryRow(over: Partial<ConceptMasteryRow> = {}): ConceptMasteryRow {
  return {
    id: "m0000000-0000-0000-0000-000000000001",
    user_id: USER,
    concept_id: CONCEPT_ID,
    mastery_score: 0.4,
    confidence_score: 0.45,
    attempt_count: 3,
    correct_count: 1,
    incorrect_count: 2,
    misconception_count: 1,
    last_attempt_at: new Date().toISOString(),
    last_correct_at: null,
    preferred_strategy: "formal",
    status: "LEARNING",
    evidence_summary: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...over,
  };
}

function answer(classification: string, minutesAgo: number): TeachingAnswerRow {
  return {
    id: `a000000-0000-0000-0000-00000000000${minutesAgo}`,
    question_id: `q000000-0000-0000-0000-00000000000${minutesAgo}`,
    session_id: SESSION,
    user_id: USER,
    response_text: "an answer",
    classification,
    correctness_score: classification === "CORRECT" ? 0.9 : 0.2,
    evaluation: { feedback: "fb", missingConcepts: ["frame allocation"] },
    response_time_ms: 8000,
    created_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  };
}

function question(minutesAgo: number): ClientTeachingQuestion {
  return {
    id: `q000000-0000-0000-0000-00000000000${minutesAgo}`,
    session_id: SESSION,
    lesson_id: lesson.id,
    user_id: USER,
    concept_key: "page-faults",
    concept_id: CONCEPT_ID,
    question_kind: "APPLICATION",
    difficulty: 3,
    prompt: "apply it",
    source_grounded: false,
    citations: [],
    metadata: {},
    created_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  };
}

function decisionInteraction(strategy: string): InteractionRow {
  return {
    id: `i000000-0000-0000-0000-0000000000${strategy.length}0`,
    session_id: SESSION,
    user_id: USER,
    concept_id: CONCEPT_ID,
    role: "SYSTEM",
    interaction_type: "OTHER",
    content: "decision",
    metadata: {
      kind: "teaching_decision",
      conceptKey: "page-faults",
      strategy,
    },
    created_at: new Date().toISOString(),
  };
}

function data(over: Partial<SessionContextData> = {}): SessionContextData {
  return {
    session: session(),
    lesson,
    lessonConcepts: [
      concept(),
      concept({
        id: "lc2",
        concept_key: "tlb",
        position: 1,
        status: "PENDING",
      }),
    ],
    currentConcept: concept(),
    masteryRow: masteryRow(),
    previousMasteryPoints: 40,
    misconceptions: [],
    recentAnswers: [answer("INCORRECT", 3), answer("INCORRECT", 2)],
    recentQuestions: [question(3), question(2)],
    sessionInteractions: [decisionInteraction("formal")],
    timeElapsedMinutes: 10,
    ...over,
  };
}

describe("buildPolicyFacts", () => {
  it("derives mastery points on the 0–100 scale and current concept metadata", () => {
    const f = buildPolicyFacts(data());
    expect(f.masteryPoints).toBe(40);
    expect(f.conceptImportance).toBe(5);
    expect(f.conceptDifficulty).toBe(3);
  });

  it("computes an incorrect streak and the last classification", () => {
    const f = buildPolicyFacts(data());
    expect(f.incorrectStreak).toBe(2);
    expect(f.correctStreak).toBe(0);
    expect(f.lastClassification).toBe("INCORRECT");
  });

  it("computes time remaining from budget minus elapsed", () => {
    const f = buildPolicyFacts(data());
    expect(f.timeRemainingMinutes).toBe(10);
  });

  it("counts concepts still remaining after the current one", () => {
    const f = buildPolicyFacts(data());
    expect(f.conceptsRemaining).toBe(1);
  });

  it("flags a repeated misconception when detections reach 2", () => {
    const misc: MisconceptionRow = {
      id: "mm1",
      user_id: USER,
      concept_id: CONCEPT_ID,
      session_id: SESSION,
      interaction_id: null,
      category: "page-fault-is-a-crash",
      description: "process dies",
      severity: "HIGH",
      confidence: 0.8,
      status: "ACTIVE",
      first_detected_at: new Date().toISOString(),
      last_detected_at: new Date().toISOString(),
      resolved_at: null,
      evidence: [],
      metadata: { detections: 2 },
    };
    const f = buildPolicyFacts(data({ misconceptions: [misc] }));
    expect(f.repeatedMisconception).toBe(true);
    expect(f.activeMisconceptionCount).toBe(1);
  });

  it("reads tried strategies from persisted decisions", () => {
    const d = data({
      sessionInteractions: [
        decisionInteraction("formal"),
        decisionInteraction("analogy-first"),
      ],
    });
    expect(triedStrategies(d).sort()).toEqual(["analogy-first", "formal"]);
  });
});

describe("currentStrategy", () => {
  it("prefers the concept's stored strategy, then the lesson style", () => {
    expect(currentStrategy(data())).toBe("formal");
    expect(
      currentStrategy(
        data({ masteryRow: masteryRow({ preferred_strategy: null }) }),
      ),
    ).toBe("analogy-first");
  });
});

describe("buildEngineSignal", () => {
  it("surfaces the last answer, its feedback, and missing concepts", () => {
    const s = buildEngineSignal(data());
    expect(s.lastClassification).toBe("INCORRECT");
    expect(s.lastFeedback).toBe("fb");
    expect(s.missingConcepts).toContain("frame allocation");
  });
});
