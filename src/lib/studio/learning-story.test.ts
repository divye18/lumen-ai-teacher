import { describe, expect, it } from "vitest";

import type {
  ClientTeachingQuestion,
  InteractionRow,
  TeachingAnswerRow,
} from "@/lib/db/repositories";

import { buildLearningStory } from "./learning-story";
import type { ConceptOutcome } from "./session-report";

const T0 = Date.parse("2026-09-01T10:00:00.000Z");
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();

function q(
  over: Partial<ClientTeachingQuestion> & { id: string },
): ClientTeachingQuestion {
  return {
    id: over.id,
    session_id: "s",
    lesson_id: "l",
    user_id: "u",
    concept_key: over.concept_key ?? "cache",
    concept_id: "c",
    question_kind: over.question_kind ?? "CONCEPTUAL",
    question_format: over.question_format ?? "FREE_FORM",
    difficulty: over.difficulty ?? 2,
    prompt: "…",
    source_grounded: false,
    citations: [],
    metadata: {},
    created_at: over.created_at ?? at(0),
  } as ClientTeachingQuestion;
}

function a(
  questionId: string,
  classification: string,
  min: number,
): TeachingAnswerRow {
  return {
    id: `a-${questionId}`,
    question_id: questionId,
    session_id: "s",
    user_id: "u",
    response_text: "…",
    classification,
    correctness_score: classification === "CORRECT" ? 1 : 0,
    evaluation: {},
    response_time_ms: 10_000,
    created_at: at(min),
  } as TeachingAnswerRow;
}

function teach(
  action: string,
  conceptKey: string,
  min: number,
): InteractionRow {
  return {
    id: `i-${action}-${min}`,
    session_id: "s",
    user_id: "u",
    concept_id: "c",
    role: "SYSTEM",
    interaction_type: "OTHER",
    content: "…",
    metadata: { kind: "teaching_decision", action, conceptKey },
    created_at: at(min),
  } as InteractionRow;
}

const outcomes: ConceptOutcome[] = [
  {
    key: "cache",
    title: "Cache",
    masteryBefore: 20,
    masteryAfter: 72,
    delta: 52,
    band: "proficient",
  },
];

describe("buildLearningStory", () => {
  it("returns nothing without answers", () => {
    expect(
      buildLearningStory({
        outcomes,
        answers: [],
        questions: [],
        interactions: [],
        repeatedMisconception: false,
      }),
    ).toEqual([]);
  });

  it("opens with the strongest concept", () => {
    const story = buildLearningStory({
      outcomes,
      answers: [a("q1", "CORRECT", 1)],
      questions: [q({ id: "q1" })],
      interactions: [],
      repeatedMisconception: false,
    });
    expect(story[0]).toMatch(/understanding of Cache is strong/i);
  });

  it("notes solid recall but weak transfer", () => {
    const questions = [
      q({ id: "c1", question_kind: "CONCEPTUAL" }),
      q({ id: "c2", question_kind: "CONCEPTUAL" }),
      q({ id: "ap1", question_kind: "APPLICATION" }),
      q({ id: "ap2", question_kind: "APPLICATION" }),
    ];
    const answers = [
      a("c1", "CORRECT", 1),
      a("c2", "CORRECT", 2),
      a("ap1", "INCORRECT", 3),
      a("ap2", "INCORRECT", 4),
    ];
    const story = buildLearningStory({
      outcomes,
      answers,
      questions,
      interactions: [],
      repeatedMisconception: false,
    });
    expect(story.join(" ")).toMatch(/solid on the idea but less sure/i);
  });

  it("credits a representation change that landed", () => {
    const questions = [
      q({ id: "q1", concept_key: "cache", created_at: at(0) }),
      q({ id: "q2", concept_key: "cache", created_at: at(5) }),
    ];
    const answers = [a("q1", "INCORRECT", 1), a("q2", "CORRECT", 6)];
    const story = buildLearningStory({
      outcomes,
      answers,
      questions,
      interactions: [teach("EXAMPLE", "cache", 4)],
      repeatedMisconception: false,
    });
    expect(story.join(" ")).toMatch(
      /worked example for Cache led to a correct/i,
    );
  });

  it("notes a difficulty increase after recovery", () => {
    const questions = [
      q({ id: "q1", difficulty: 2, created_at: at(0) }),
      q({ id: "q2", difficulty: 4, created_at: at(5) }),
    ];
    const answers = [a("q1", "INCORRECT", 1), a("q2", "CORRECT", 6)];
    const story = buildLearningStory({
      outcomes,
      answers,
      questions,
      interactions: [],
      repeatedMisconception: false,
    });
    expect(story.join(" ")).toMatch(/raised the difficulty/i);
  });

  it("mentions a repeated misconception", () => {
    const story = buildLearningStory({
      outcomes,
      answers: [a("q1", "INCORRECT", 1)],
      questions: [q({ id: "q1" })],
      interactions: [],
      repeatedMisconception: true,
    });
    expect(story.join(" ")).toMatch(/same misconception came back/i);
  });

  it("never invents claims and stays short", () => {
    const story = buildLearningStory({
      outcomes,
      answers: [a("q1", "CORRECT", 1)],
      questions: [q({ id: "q1" })],
      interactions: [],
      repeatedMisconception: false,
    });
    expect(story.length).toBeLessThanOrEqual(5);
    expect(story.join(" ")).not.toMatch(/policy|token|chain-of-thought/i);
  });
});
