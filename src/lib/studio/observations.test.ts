import { describe, expect, it } from "vitest";

import type {
  ClientTeachingQuestion,
  TeachingAnswerRow,
} from "@/lib/db/repositories";
import type { StrategyMemory } from "@/lib/learner";

import { buildObservations } from "./observations";
import type { ConceptNode } from "./overview";

const EMPTY_MEMORY: StrategyMemory = {
  outcomes: [],
  preferredStrategy: null,
  evidenceCount: 0,
};

function q(id: string, kind: string): ClientTeachingQuestion {
  return {
    id,
    session_id: "s",
    lesson_id: "l",
    user_id: "u",
    concept_key: "k",
    concept_id: "c",
    question_kind: kind,
    question_format: "FREE_FORM",
    difficulty: 3,
    prompt: "…",
    source_grounded: false,
    citations: [],
    metadata: {},
    created_at: new Date().toISOString(),
  };
}
function a(qid: string, classification: string): TeachingAnswerRow {
  return {
    id: `a-${qid}`,
    question_id: qid,
    session_id: "s",
    user_id: "u",
    response_text: "…",
    classification,
    correctness_score: 0.5,
    evaluation: {},
    response_time_ms: 20000,
    created_at: new Date().toISOString(),
  };
}

describe("buildObservations", () => {
  it("says nothing without enough evidence", () => {
    expect(
      buildObservations({
        answers: [a("q1", "CORRECT")],
        questions: [q("q1", "CONCEPTUAL")],
        concepts: [],
        strategyMemory: EMPTY_MEMORY,
      }),
    ).toEqual([]);
  });

  it("detects recall stronger than application", () => {
    const questions = [
      q("c1", "CONCEPTUAL"),
      q("c2", "CONCEPTUAL"),
      q("c3", "CONCEPTUAL"),
      q("p1", "APPLICATION"),
      q("p2", "APPLICATION"),
      q("p3", "SCENARIO"),
    ];
    const answers = [
      a("c1", "CORRECT"),
      a("c2", "CORRECT"),
      a("c3", "CORRECT"),
      a("p1", "INCORRECT"),
      a("p2", "INCORRECT"),
      a("p3", "PARTIALLY_CORRECT"),
    ];
    const obs = buildObservations({
      answers,
      questions,
      concepts: [],
      strategyMemory: EMPTY_MEMORY,
    });
    expect(obs.map((o) => o.id)).toContain("recall-over-application");
  });

  it("reports a preferred strategy from strategy memory", () => {
    const obs = buildObservations({
      answers: [],
      questions: [],
      concepts: [],
      strategyMemory: {
        outcomes: [
          {
            strategy: "example-first",
            exposures: 4,
            improvements: 3,
            successRate: 0.75,
          },
        ],
        preferredStrategy: "example-first",
        evidenceCount: 4,
      },
    });
    expect(obs[0]).toMatchObject({ id: "preferred-strategy" });
    expect(obs[0].text).toMatch(/worked examples/);
  });

  it("caps at four observations", () => {
    const concepts: ConceptNode[] = [
      {
        conceptKey: "x",
        title: "X",
        lessonId: "l",
        lessonTitle: "L",
        masteryPoints: 20,
        band: "Not understood",
        bandId: "not-understood",
        confidence: 0,
        attempts: 3,
        misconceptionCount: 3,
        status: "TEACHING",
        assessed: true,
        lastSeenAt: null,
      },
    ];
    const obs = buildObservations({
      answers: [],
      questions: [],
      concepts,
      strategyMemory: EMPTY_MEMORY,
    });
    expect(obs.length).toBeLessThanOrEqual(4);
  });
});
