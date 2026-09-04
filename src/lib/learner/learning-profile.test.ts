import { describe, expect, it } from "vitest";

import type {
  ClientTeachingQuestion,
  InteractionRow,
  MisconceptionRow,
  TeachingAnswerRow,
} from "@/lib/db/repositories";

import {
  deriveLearningProfile,
  type LearningProfileInput,
} from "./learning-profile";
import type { StrategyMemory } from "./strategy-memory";

const EMPTY_MEMORY: StrategyMemory = {
  outcomes: [],
  preferredStrategy: null,
  evidenceCount: 0,
};

let clock = 0;
function at(): string {
  clock += 1;
  return new Date(Date.UTC(2026, 0, 1, 0, 0, clock)).toISOString();
}

function q(
  id: string,
  over: Partial<ClientTeachingQuestion> = {},
): ClientTeachingQuestion {
  return {
    id,
    session_id: "s",
    lesson_id: "l",
    user_id: "u",
    concept_key: "cache",
    concept_id: "c",
    question_kind: "CONCEPTUAL",
    question_format: "FREE_FORM",
    difficulty: 3,
    prompt: "…",
    source_grounded: false,
    citations: [],
    metadata: {},
    created_at: at(),
    ...over,
  } as ClientTeachingQuestion;
}

function ans(
  qid: string,
  classification: string,
  over: Partial<TeachingAnswerRow> = {},
): TeachingAnswerRow {
  return {
    id: `a-${qid}-${clock}`,
    question_id: qid,
    session_id: "s",
    user_id: "u",
    response_text: "…",
    classification,
    correctness_score: classification === "CORRECT" ? 0.9 : 0.2,
    evaluation: {},
    response_time_ms: 20000,
    created_at: at(),
    ...over,
  } as TeachingAnswerRow;
}

function teach(action: string, conceptKey = "cache"): InteractionRow {
  return {
    id: `i-${clock}`,
    session_id: "s",
    user_id: "u",
    concept_id: "c",
    role: "TEACHER",
    interaction_type: "EXPLANATION",
    content: "…",
    metadata: { action, conceptKey },
    created_at: at(),
  } as InteractionRow;
}

function base(over: Partial<LearningProfileInput> = {}): LearningProfileInput {
  return {
    answers: [],
    questions: [],
    interactions: [],
    concepts: [],
    misconceptions: [],
    strategyMemory: EMPTY_MEMORY,
    nowISO: "2026-02-01T00:00:00.000Z",
    ...over,
  };
}

describe("deriveLearningProfile", () => {
  it("returns no signals for a learner with no history (no unsupported claims)", () => {
    const p = deriveLearningProfile(base());
    expect(p.signals).toEqual([]);
    expect(p.sampleSize).toBe(0);
    expect(p.strongestConceptFamily).toBeNull();
  });

  it("is deterministic across repeated execution", () => {
    const input = base({
      questions: [q("q1", { question_kind: "CONCEPTUAL" })],
      answers: [ans("q1", "CORRECT")],
    });
    expect(JSON.stringify(deriveLearningProfile(input))).toBe(
      JSON.stringify(deriveLearningProfile(input)),
    );
  });

  it("detects recall ahead of application from question-kind outcomes", () => {
    const questions = [
      q("d1", { question_kind: "CONCEPTUAL" }),
      q("d2", { question_kind: "CONCEPTUAL" }),
      q("d3", { question_kind: "CONCEPTUAL" }),
      q("a1", { question_kind: "APPLICATION" }),
      q("a2", { question_kind: "SCENARIO" }),
      q("a3", { question_kind: "APPLICATION" }),
    ];
    const answers = [
      ans("d1", "CORRECT"),
      ans("d2", "CORRECT"),
      ans("d3", "CORRECT"),
      ans("a1", "INCORRECT"),
      ans("a2", "INCORRECT"),
      ans("a3", "INCORRECT"),
    ];
    const p = deriveLearningProfile(base({ questions, answers }));
    const s = p.signals.find((x) => x.kind === "recall-ahead-of-application");
    expect(s).toBeTruthy();
    expect(s!.evidence.evidenceCount).toBe(6);
    expect(s!.evidence.confidence).toBeGreaterThan(0.5);
  });

  it("detects a format-specific weakness (weak vs strong format)", () => {
    const questions = [
      q("m1", { question_format: "MCQ" }),
      q("m2", { question_format: "MCQ" }),
      q("m3", { question_format: "MCQ" }),
      q("o1", { question_format: "ORDER_STEPS" }),
      q("o2", { question_format: "ORDER_STEPS" }),
      q("o3", { question_format: "ORDER_STEPS" }),
    ];
    const answers = [
      ans("m1", "CORRECT"),
      ans("m2", "CORRECT"),
      ans("m3", "CORRECT"),
      ans("o1", "INCORRECT"),
      ans("o2", "INCORRECT"),
      ans("o3", "INCORRECT"),
    ];
    const p = deriveLearningProfile(base({ questions, answers }));
    const s = p.signals.find((x) => x.kind === "format-specific-weakness");
    expect(s).toBeTruthy();
    expect(s!.detail.weakFormat).toBe("ORDER_STEPS");
    expect(s!.detail.strongFormat).toBe("MCQ");
  });

  it("detects example-recovery from strategy memory outcomes", () => {
    const strategyMemory: StrategyMemory = {
      outcomes: [
        {
          strategy: "example-first",
          exposures: 4,
          improvements: 4,
          successRate: 1,
        },
        {
          strategy: "formal",
          exposures: 4,
          improvements: 1,
          successRate: 0.25,
        },
      ],
      preferredStrategy: "example-first",
      evidenceCount: 8,
    };
    const p = deriveLearningProfile(
      base({
        strategyMemory,
        questions: [q("q1"), q("q2"), q("q3"), q("q4")],
        answers: [
          ans("q1", "CORRECT"),
          ans("q2", "CORRECT"),
          ans("q3", "INCORRECT"),
          ans("q4", "CORRECT"),
        ],
      }),
    );
    const s = p.signals.find((x) => x.kind === "example-recovery");
    expect(s).toBeTruthy();
    expect(s!.detail.strategy).toBe("example-first");
  });

  it("detects simplification recovery: wrong -> reteach -> right, twice", () => {
    clock = 0;
    const q1 = q("q1", { concept_key: "cache" });
    const a1 = ans("q1", "INCORRECT");
    const r1 = teach("RETEACH", "cache");
    const q2 = q("q2", { concept_key: "cache" });
    const a2 = ans("q2", "CORRECT");
    const q3 = q("q3", { concept_key: "cache" });
    const a3 = ans("q3", "INCORRECT");
    const r2 = teach("SIMPLIFY", "cache");
    const q4 = q("q4", { concept_key: "cache" });
    const a4 = ans("q4", "CORRECT");
    const p = deriveLearningProfile(
      base({
        questions: [q1, q2, q3, q4],
        answers: [a1, a2, a3, a4],
        interactions: [r1, r2],
      }),
    );
    const s = p.signals.find((x) => x.kind === "simplification-recovery");
    expect(s).toBeTruthy();
    expect(s!.detail.recoveries).toBeGreaterThanOrEqual(2);
  });

  it("flags a recurring misconception (>= 2 detections)", () => {
    const misconceptions = [
      {
        id: "mc1",
        category: "confuses-cache-and-ram",
        description: "…",
        confidence: 0.7,
        status: "ACTIVE",
        severity: "MEDIUM",
        evidence: [{ quote: "x" }, { quote: "y" }],
        metadata: { detections: 3 },
        last_detected_at: "2026-01-10T00:00:00.000Z",
      },
    ] as unknown as MisconceptionRow[];
    const p = deriveLearningProfile(
      base({
        misconceptions,
        questions: [q("q1"), q("q2"), q("q3"), q("q4")],
        answers: [
          ans("q1", "CORRECT"),
          ans("q2", "CORRECT"),
          ans("q3", "CORRECT"),
          ans("q4", "CORRECT"),
        ],
      }),
    );
    expect(
      p.signals.find((x) => x.kind === "recurring-misconception"),
    ).toBeTruthy();
  });

  it("names strongest / weakest concept families with >= 2 assessed concepts", () => {
    const p = deriveLearningProfile(
      base({
        concepts: [
          {
            conceptKey: "cache",
            title: "Cache",
            masteryPoints: 82,
            attempts: 4,
            misconceptionCount: 0,
          },
          {
            conceptKey: "virtual-memory",
            title: "Virtual Memory",
            masteryPoints: 31,
            attempts: 3,
            misconceptionCount: 1,
          },
        ],
      }),
    );
    expect(p.strongestConceptFamily).toBe("Cache");
    expect(p.weakestConceptFamily).toBe("Virtual Memory");
  });

  it("does not emit contradictory recall/application signals at once", () => {
    const questions = [
      q("d1", { question_kind: "CONCEPTUAL" }),
      q("d2", { question_kind: "CONCEPTUAL" }),
      q("d3", { question_kind: "CONCEPTUAL" }),
      q("a1", { question_kind: "APPLICATION" }),
      q("a2", { question_kind: "APPLICATION" }),
      q("a3", { question_kind: "APPLICATION" }),
    ];
    const answers = [
      ans("d1", "CORRECT"),
      ans("d2", "INCORRECT"),
      ans("d3", "CORRECT"),
      ans("a1", "CORRECT"),
      ans("a2", "INCORRECT"),
      ans("a3", "CORRECT"),
    ];
    const p = deriveLearningProfile(base({ questions, answers }));
    const kinds = p.signals.map((s) => s.kind);
    expect(
      kinds.includes("recall-ahead-of-application") &&
        kinds.includes("application-ahead-of-recall"),
    ).toBe(false);
  });
});
