import { describe, expect, it } from "vitest";

import type {
  ClientTeachingQuestion,
  TeachingAnswerRow,
} from "@/lib/db/repositories";
import { applyMasteryUpdate } from "@/lib/teaching/mastery";

import {
  buildMasteryTrajectory,
  trajectoryFromResults,
} from "./mastery-trajectory";

const base = Date.parse("2026-09-06T10:00:00Z");
const at = (m: number) => new Date(base + m * 60_000).toISOString();

function question(id: string, over: Partial<ClientTeachingQuestion> = {}) {
  return {
    id,
    session_id: "s",
    lesson_id: "l",
    user_id: "u",
    concept_key: "cache",
    concept_id: "c",
    question_kind: "CONCEPTUAL",
    question_format: "MCQ",
    difficulty: 3,
    prompt: "q",
    source_grounded: false,
    citations: [],
    metadata: {},
    created_at: at(0),
    ...over,
  } as ClientTeachingQuestion;
}

function answer(
  id: string,
  qid: string,
  minute: number,
  over: Partial<TeachingAnswerRow> & { evaluation?: Record<string, unknown> },
): TeachingAnswerRow {
  return {
    id,
    question_id: qid,
    session_id: "s",
    user_id: "u",
    response_text: "{}",
    classification: "CORRECT",
    correctness_score: 1,
    evaluation: {},
    response_time_ms: 5000,
    created_at: at(minute),
    ...over,
  } as TeachingAnswerRow;
}

describe("buildMasteryTrajectory", () => {
  it("uses the persisted mastery delta when present", () => {
    const t = buildMasteryTrajectory({
      conceptKey: "cache",
      conceptTitle: "Cache",
      questions: [question("q1"), question("q2")],
      answers: [
        answer("a1", "q1", 1, {
          classification: "CORRECT",
          evaluation: {
            masteryDelta: { before: 0, after: 12, delta: 12, reason: "ok" },
          },
        }),
        answer("a2", "q2", 2, {
          classification: "INCORRECT",
          evaluation: {
            masteryDelta: { before: 12, after: 6, delta: -6, reason: "down" },
            misconceptionCandidates: [{ category: "x" }],
          },
        }),
      ],
    });
    expect(t.start).toBe(0);
    expect(t.current).toBe(6);
    expect(t.points).toHaveLength(2);
    expect(t.points[0].delta).toBe(12);
    expect(t.points[1].delta).toBe(-6);
    expect(t.points[1].misconceptionDetected).toBe(true);
  });

  it("replays the deterministic transition for a pre-Phase-5 answer", () => {
    const t = buildMasteryTrajectory({
      conceptKey: "cache",
      conceptTitle: "Cache",
      questions: [question("q1", { difficulty: 3 })],
      answers: [
        answer("a1", "q1", 1, {
          classification: "CORRECT",
          correctness_score: 0.95,
          evaluation: {}, // no embedded delta
        }),
      ],
    });
    const expected = applyMasteryUpdate({
      currentPoints: 0,
      classification: "CORRECT",
      correctnessScore: 0.95,
      difficulty: 3,
      priorAttempts: 0,
    });
    expect(t.points[0].masteryAfter).toBe(expected.nextPoints);
  });

  it("ignores answers for other concepts and never fabricates points", () => {
    const t = buildMasteryTrajectory({
      conceptKey: "cache",
      conceptTitle: "Cache",
      questions: [
        question("q1", { concept_key: "cache" }),
        question("q2", { concept_key: "locality" }),
      ],
      answers: [
        answer("a1", "q1", 1, {
          evaluation: {
            masteryDelta: { before: 0, after: 10, delta: 10, reason: "" },
          },
        }),
        answer("a2", "q2", 2, {
          evaluation: {
            masteryDelta: { before: 0, after: 40, delta: 40, reason: "" },
          },
        }),
      ],
    });
    expect(t.points).toHaveLength(1);
    expect(t.current).toBe(10);
  });

  it("is empty for a concept with no answers", () => {
    const t = buildMasteryTrajectory({
      conceptKey: "cache",
      conceptTitle: "Cache",
      questions: [],
      answers: [],
    });
    expect(t.points).toEqual([]);
  });
});

describe("trajectoryFromResults", () => {
  it("maps in-session results to points for one concept", () => {
    const t = trajectoryFromResults({
      conceptKey: "cache",
      conceptTitle: "Cache",
      entries: [
        {
          conceptKey: "cache",
          masteryBefore: 0,
          masteryAfter: 12,
          reason: "correct",
          classification: "CORRECT",
          misconceptionDetected: false,
          format: "MCQ",
          difficulty: 3,
          at: at(1),
        },
        {
          conceptKey: "locality",
          masteryBefore: 0,
          masteryAfter: 8,
          reason: "x",
          classification: "CORRECT",
          misconceptionDetected: false,
          format: "MCQ",
          difficulty: 3,
          at: at(2),
        },
      ],
    });
    expect(t.points).toHaveLength(1);
    expect(t.current).toBe(12);
  });
});
