import { describe, expect, it } from "vitest";

import type { StructuredQuestion } from "@/lib/assessment/structured/contracts";

import {
  classifyMisconceptionResponse,
  evaluateMisconceptionResolution,
  misconceptionCategoriesInQuestion,
  planMisconceptionResolution,
  selectVerificationTarget,
  type ResolvableMisconceptionState,
  type VerificationCandidate,
} from "./misconception-resolution";

function mcq(
  over: {
    correctId?: string;
    distractorMisconceptionId?: string | null;
  } = {},
): StructuredQuestion {
  const distractorId =
    over.distractorMisconceptionId === undefined
      ? "cache-is-ram"
      : over.distractorMisconceptionId;
  return {
    id: "q1",
    format: "MCQ",
    conceptKey: "cache",
    difficulty: 3,
    kind: "CONCEPTUAL",
    prompt: "…",
    data: {
      correctId: over.correctId ?? "a",
      options: [
        { id: "a", text: "correct option" },
        {
          id: "b",
          text: "distractor",
          ...(distractorId
            ? {
                misconception: {
                  id: distractorId,
                  label: "confuses cache and ram",
                  explanation: "…",
                },
              }
            : {}),
        },
      ],
    },
  } as unknown as StructuredQuestion;
}

function freeForm(): StructuredQuestion {
  return {
    id: "q1",
    format: "FREE_FORM",
    conceptKey: "cache",
    difficulty: 3,
    kind: "CONCEPTUAL",
    prompt: "…",
    data: {},
  } as unknown as StructuredQuestion;
}

function state(
  over: Partial<ResolvableMisconceptionState> = {},
): ResolvableMisconceptionState {
  return {
    id: "m1",
    category: "cache-is-ram",
    status: "ACTIVE",
    clearedChecks: 0,
    lastVerifiedQuestionId: null,
    ...over,
  };
}

describe("misconceptionCategoriesInQuestion", () => {
  it("collects and normalizes distractor misconception ids on an MCQ", () => {
    expect(misconceptionCategoriesInQuestion(mcq())).toEqual(["cache-is-ram"]);
  });

  it("returns an empty array when no distractor carries a misconception", () => {
    expect(
      misconceptionCategoriesInQuestion(
        mcq({ distractorMisconceptionId: null }),
      ),
    ).toEqual([]);
  });

  it("returns an empty array for ORDER_STEPS (no misconception mapping)", () => {
    const q = {
      id: "q1",
      format: "ORDER_STEPS",
      data: { steps: [] },
    } as unknown as StructuredQuestion;
    expect(misconceptionCategoriesInQuestion(q)).toEqual([]);
  });
});

describe("classifyMisconceptionResponse", () => {
  it("returns null for an incorrect answer regardless of format", () => {
    expect(
      classifyMisconceptionResponse({
        isStructured: true,
        classification: "INCORRECT",
        questionMisconceptionCategories: ["cache-is-ram"],
        targetCategory: "cache-is-ram",
      }),
    ).toBeNull();
  });

  it("structured + correct + question tested this exact trap -> avoided", () => {
    expect(
      classifyMisconceptionResponse({
        isStructured: true,
        classification: "CORRECT",
        questionMisconceptionCategories: ["cache-is-ram"],
        targetCategory: "cache-is-ram",
      }),
    ).toBe("avoided");
  });

  it("structured + correct + question did NOT test this trap -> null", () => {
    expect(
      classifyMisconceptionResponse({
        isStructured: true,
        classification: "CORRECT",
        questionMisconceptionCategories: ["some-other-misconception"],
        targetCategory: "cache-is-ram",
      }),
    ).toBeNull();
  });

  it("free-form + correct -> soft-improve, regardless of category overlap", () => {
    expect(
      classifyMisconceptionResponse({
        isStructured: false,
        classification: "CORRECT",
        questionMisconceptionCategories: [],
        targetCategory: "cache-is-ram",
      }),
    ).toBe("soft-improve");
  });
});

describe("planMisconceptionResolution — state machine", () => {
  it("ACTIVE + avoided -> IMPROVING (1st verified check)", () => {
    const t = planMisconceptionResolution({
      currentStatus: "ACTIVE",
      clearedChecks: 0,
      lastVerifiedQuestionId: null,
      signal: "avoided",
      questionId: "q1",
    });
    expect(t).toEqual({
      status: "IMPROVING",
      clearedChecks: 1,
      lastVerifiedQuestionId: "q1",
    });
  });

  it("IMPROVING + avoided on a DIFFERENT question -> RESOLVED", () => {
    const t = planMisconceptionResolution({
      currentStatus: "IMPROVING",
      clearedChecks: 1,
      lastVerifiedQuestionId: "q1",
      signal: "avoided",
      questionId: "q2",
    });
    expect(t).toEqual({
      status: "RESOLVED",
      clearedChecks: 2,
      lastVerifiedQuestionId: "q2",
    });
  });

  it("anti-gaming: IMPROVING + avoided on the SAME question instance -> no-op", () => {
    const t = planMisconceptionResolution({
      currentStatus: "IMPROVING",
      clearedChecks: 1,
      lastVerifiedQuestionId: "q1",
      signal: "avoided",
      questionId: "q1",
    });
    expect(t).toBeNull();
  });

  it("ACTIVE + soft-improve -> IMPROVING (starts progress)", () => {
    const t = planMisconceptionResolution({
      currentStatus: "ACTIVE",
      clearedChecks: 0,
      lastVerifiedQuestionId: null,
      signal: "soft-improve",
      questionId: "q1",
    });
    expect(t?.status).toBe("IMPROVING");
  });

  it("IMPROVING + soft-improve -> no-op (conversational evidence cannot finish resolution)", () => {
    const t = planMisconceptionResolution({
      currentStatus: "IMPROVING",
      clearedChecks: 1,
      lastVerifiedQuestionId: "q1",
      signal: "soft-improve",
      questionId: "q2",
    });
    expect(t).toBeNull();
  });

  it("RESOLVED + avoided -> no-op (relapse handled by strengthen(), not here)", () => {
    const t = planMisconceptionResolution({
      currentStatus: "RESOLVED",
      clearedChecks: 2,
      lastVerifiedQuestionId: "q2",
      signal: "avoided",
      questionId: "q3",
    });
    expect(t).toBeNull();
  });

  it("null signal -> no-op regardless of status", () => {
    expect(
      planMisconceptionResolution({
        currentStatus: "ACTIVE",
        clearedChecks: 0,
        lastVerifiedQuestionId: null,
        signal: null,
        questionId: "q1",
      }),
    ).toBeNull();
  });
});

describe("evaluateMisconceptionResolution — end-to-end composition", () => {
  it("structured correct answer avoiding the tracked trap moves ACTIVE -> IMPROVING", () => {
    const outcome = evaluateMisconceptionResolution({
      misconception: state({ status: "ACTIVE" }),
      isStructured: true,
      classification: "CORRECT",
      questionMisconceptionCategories: misconceptionCategoriesInQuestion(
        mcq({ distractorMisconceptionId: "cache-is-ram" }),
      ),
      questionId: "q1",
    });
    expect(outcome).toEqual({
      id: "m1",
      statusBefore: "ACTIVE",
      statusAfter: "IMPROVING",
      clearedChecks: 1,
      lastVerifiedQuestionId: "q1",
    });
  });

  it("a second distinct verified check resolves a fully IMPROVING misconception", () => {
    const outcome = evaluateMisconceptionResolution({
      misconception: state({
        status: "IMPROVING",
        clearedChecks: 1,
        lastVerifiedQuestionId: "q1",
      }),
      isStructured: true,
      classification: "CORRECT",
      questionMisconceptionCategories: misconceptionCategoriesInQuestion(
        mcq({ distractorMisconceptionId: "cache-is-ram" }),
      ),
      questionId: "q2",
    });
    expect(outcome?.statusAfter).toBe("RESOLVED");
  });

  it("conversational (free-form) evidence alone never resolves — caps at IMPROVING", () => {
    const fromActive = evaluateMisconceptionResolution({
      misconception: state({ status: "ACTIVE" }),
      isStructured: false,
      classification: "CORRECT",
      questionMisconceptionCategories:
        misconceptionCategoriesInQuestion(freeForm()),
      questionId: "q1",
    });
    expect(fromActive?.statusAfter).toBe("IMPROVING");

    const fromImproving = evaluateMisconceptionResolution({
      misconception: state({
        status: "IMPROVING",
        clearedChecks: 1,
        lastVerifiedQuestionId: "q1",
      }),
      isStructured: false,
      classification: "CORRECT",
      questionMisconceptionCategories:
        misconceptionCategoriesInQuestion(freeForm()),
      questionId: "q2",
    });
    expect(fromImproving).toBeNull();
  });

  it("a structured correct answer that did not test this trap leaves the misconception untouched", () => {
    const outcome = evaluateMisconceptionResolution({
      misconception: state({ status: "ACTIVE" }),
      isStructured: true,
      classification: "CORRECT",
      questionMisconceptionCategories: misconceptionCategoriesInQuestion(
        mcq({ distractorMisconceptionId: "some-other-misconception" }),
      ),
      questionId: "q1",
    });
    expect(outcome).toBeNull();
  });

  it("category matching is case/spacing-insensitive (normalizeCategory)", () => {
    const outcome = evaluateMisconceptionResolution({
      misconception: state({ status: "ACTIVE", category: "Cache Is RAM" }),
      isStructured: true,
      classification: "CORRECT",
      questionMisconceptionCategories: misconceptionCategoriesInQuestion(
        mcq({ distractorMisconceptionId: "cache-is-ram" }),
      ),
      questionId: "q1",
    });
    expect(outcome?.statusAfter).toBe("IMPROVING");
  });

  it("is deterministic — identical inputs produce identical outcomes", () => {
    const input = {
      misconception: state({ status: "ACTIVE" }),
      isStructured: true,
      classification: "CORRECT",
      questionMisconceptionCategories: ["cache-is-ram"],
      questionId: "q1",
    };
    const a = evaluateMisconceptionResolution(input);
    const b = evaluateMisconceptionResolution(input);
    expect(a).toEqual(b);
  });
});

describe("selectVerificationTarget (9.2)", () => {
  function candidate(
    over: Partial<VerificationCandidate> = {},
  ): VerificationCandidate {
    return {
      id: "m1",
      category: "cache-is-ram",
      status: "ACTIVE",
      severity: "MEDIUM",
      ...over,
    };
  }

  it("an ACTIVE misconception is a valid verification target", () => {
    expect(selectVerificationTarget([candidate({ status: "ACTIVE" })])).toBe(
      "cache-is-ram",
    );
  });

  it("an IMPROVING misconception is a valid verification target", () => {
    expect(selectVerificationTarget([candidate({ status: "IMPROVING" })])).toBe(
      "cache-is-ram",
    );
  });

  it("a RESOLVED misconception is never targeted", () => {
    expect(
      selectVerificationTarget([candidate({ status: "RESOLVED" })]),
    ).toBeNull();
  });

  it("returns null with no misconceptions", () => {
    expect(selectVerificationTarget([])).toBeNull();
  });

  it("IMPROVING outranks ACTIVE regardless of list order", () => {
    const active = candidate({
      id: "m-active",
      category: "active-one",
      status: "ACTIVE",
      severity: "CRITICAL",
    });
    const improving = candidate({
      id: "m-improving",
      category: "improving-one",
      status: "IMPROVING",
      severity: "LOW",
    });
    expect(selectVerificationTarget([active, improving])).toBe("improving-one");
    expect(selectVerificationTarget([improving, active])).toBe("improving-one");
  });

  it("higher severity wins among same-status candidates", () => {
    const low = candidate({
      id: "m-low",
      category: "low-one",
      status: "ACTIVE",
      severity: "LOW",
    });
    const critical = candidate({
      id: "m-critical",
      category: "critical-one",
      status: "ACTIVE",
      severity: "CRITICAL",
    });
    expect(selectVerificationTarget([low, critical])).toBe("critical-one");
  });

  it("is deterministic for the same multi-candidate input regardless of order", () => {
    const a = candidate({ id: "a", category: "cat-a", status: "ACTIVE" });
    const b = candidate({ id: "b", category: "cat-b", status: "ACTIVE" });
    const c = candidate({ id: "c", category: "cat-c", status: "IMPROVING" });
    const first = selectVerificationTarget([a, b, c]);
    const second = selectVerificationTarget([c, b, a]);
    const third = selectVerificationTarget([b, a, c]);
    expect(first).toBe(second);
    expect(second).toBe(third);
  });
});
