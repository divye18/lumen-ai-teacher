import { describe, expect, it } from "vitest";

import { tallyFromInteractions } from "./answer-tally";
import type { InteractionRow } from "@/lib/db/repositories";

function interaction(over: Partial<InteractionRow>): InteractionRow {
  return {
    id: over.id ?? "i1",
    session_id: "s1",
    user_id: "u1",
    concept_id: over.concept_id ?? "c1",
    role: over.role ?? "STUDENT",
    interaction_type: over.interaction_type ?? "ANSWER",
    content: over.content ?? "",
    metadata: over.metadata ?? {},
    created_at: "2026-01-01T00:00:00.000Z",
  } as InteractionRow;
}

describe("tallyFromInteractions", () => {
  it("counts a STUDENT/ANSWER interaction as one question answered", () => {
    const tally = tallyFromInteractions([
      interaction({ id: "a1", role: "STUDENT", interaction_type: "ANSWER" }),
    ]);
    expect(tally.questionsAnswered).toBe(1);
  });

  it("classifies from TEACHER/FEEDBACK metadata.classification", () => {
    const tally = tallyFromInteractions([
      interaction({ id: "a1", role: "STUDENT", interaction_type: "ANSWER" }),
      interaction({
        id: "f1",
        role: "TEACHER",
        interaction_type: "FEEDBACK",
        metadata: { classification: "CORRECT" },
      }),
    ]);
    expect(tally.correct).toBe(1);
    expect(tally.partial).toBe(0);
    expect(tally.incorrect).toBe(0);
  });

  it("counts partial and incorrect classifications separately", () => {
    const tally = tallyFromInteractions([
      interaction({
        id: "f1",
        role: "TEACHER",
        interaction_type: "FEEDBACK",
        metadata: { classification: "PARTIALLY_CORRECT" },
      }),
      interaction({
        id: "f2",
        role: "TEACHER",
        interaction_type: "FEEDBACK",
        metadata: { classification: "INCORRECT" },
      }),
    ]);
    expect(tally.partial).toBe(1);
    expect(tally.incorrect).toBe(1);
    expect(tally.correct).toBe(0);
  });

  it("does not count UNCERTAIN or missing classification in any bucket", () => {
    const tally = tallyFromInteractions([
      interaction({
        id: "f1",
        role: "TEACHER",
        interaction_type: "FEEDBACK",
        metadata: { classification: "UNCERTAIN" },
      }),
      interaction({
        id: "f2",
        role: "TEACHER",
        interaction_type: "FEEDBACK",
        metadata: {},
      }),
    ]);
    expect(tally.correct + tally.partial + tally.incorrect).toBe(0);
  });

  it("ignores unrelated interaction types/roles", () => {
    const tally = tallyFromInteractions([
      interaction({ id: "d1", role: "SYSTEM", interaction_type: "OTHER" }),
      interaction({
        id: "e1",
        role: "TEACHER",
        interaction_type: "EXPLANATION",
      }),
    ]);
    expect(tally.questionsAnswered).toBe(0);
    expect(tally.correct + tally.partial + tally.incorrect).toBe(0);
  });

  it("collects distinct answered concept ids from STUDENT/ANSWER interactions only", () => {
    const tally = tallyFromInteractions([
      interaction({
        id: "a1",
        concept_id: "c1",
        role: "STUDENT",
        interaction_type: "ANSWER",
      }),
      interaction({
        id: "a2",
        concept_id: "c1",
        role: "STUDENT",
        interaction_type: "ANSWER",
      }),
      interaction({
        id: "a3",
        concept_id: "c2",
        role: "STUDENT",
        interaction_type: "ANSWER",
      }),
      interaction({
        id: "f1",
        concept_id: "c3",
        role: "TEACHER",
        interaction_type: "FEEDBACK",
      }),
    ]);
    expect([...tally.answeredConceptIds].sort()).toEqual(["c1", "c2"]);
  });

  it("handles an empty interaction list safely", () => {
    const tally = tallyFromInteractions([]);
    expect(tally).toEqual({
      questionsAnswered: 0,
      correct: 0,
      partial: 0,
      incorrect: 0,
      answeredConceptIds: new Set(),
    });
  });

  it("is deterministic for the same input", () => {
    const input = [
      interaction({ id: "a1", role: "STUDENT", interaction_type: "ANSWER" }),
      interaction({
        id: "f1",
        role: "TEACHER",
        interaction_type: "FEEDBACK",
        metadata: { classification: "CORRECT" },
      }),
    ];
    const a = tallyFromInteractions(input);
    const b = tallyFromInteractions(input);
    expect(a.questionsAnswered).toBe(b.questionsAnswered);
    expect(a.correct).toBe(b.correct);
  });

  // 14. Not double-counted: a STUDENT/ANSWER interaction never itself
  // carries a classification, so it can never land in correct/partial/
  // incorrect — only TEACHER/FEEDBACK rows can, and each interaction is
  // visited exactly once.
  it("never lets a STUDENT/ANSWER interaction contribute to the classification breakdown", () => {
    const tally = tallyFromInteractions([
      interaction({
        id: "a1",
        role: "STUDENT",
        interaction_type: "ANSWER",
        metadata: { classification: "CORRECT" }, // hypothetical stray field
      }),
    ]);
    expect(tally.correct).toBe(0);
    expect(tally.questionsAnswered).toBe(1);
  });
});
