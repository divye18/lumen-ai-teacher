import { describe, expect, it } from "vitest";

import type { StructuredQuestion } from "@/lib/assessment/structured/contracts";

import {
  classifyMisconceptionResponse,
  evaluateMisconceptionResolution,
  misconceptionCategoriesInQuestion,
  planMisconceptionResolution,
  selectVerificationTarget,
  selectSpacedReviewTarget,
  selectQuestionTargetCategory,
  MISCONCEPTION_REVIEW_INTERVAL_MS,
  type ResolvableMisconceptionState,
  type VerificationCandidate,
  type SpacedReviewCandidate,
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

  it("a reactivated row with stale clearedChecks from a prior resolution cycle does not skip straight back to RESOLVED (10 relapse safety)", () => {
    // Simulates a relapse: the row was RESOLVED (clearedChecks: 2), strengthen()
    // reactivated it to ACTIVE, but its metadata still carries the old
    // clearedChecks/lastVerifiedQuestionId from before the first resolution.
    const outcome = evaluateMisconceptionResolution({
      misconception: state({
        status: "ACTIVE",
        clearedChecks: 2,
        lastVerifiedQuestionId: "stale-question-from-before",
      }),
      isStructured: true,
      classification: "CORRECT",
      questionMisconceptionCategories: misconceptionCategoriesInQuestion(
        mcq({ distractorMisconceptionId: "cache-is-ram" }),
      ),
      questionId: "q-new-1",
    });
    // ACTIVE always starts a fresh cycle at IMPROVING/clearedChecks:1 — never
    // jumps straight to RESOLVED off stale metadata.
    expect(outcome).toEqual({
      id: "m1",
      statusBefore: "ACTIVE",
      statusAfter: "IMPROVING",
      clearedChecks: 1,
      lastVerifiedQuestionId: "q-new-1",
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

describe("selectSpacedReviewTarget (10)", () => {
  const NOW = "2026-02-01T00:00:00.000Z";
  const nowMs = Date.parse(NOW);
  const DAY_MS = 86_400_000;

  function isoDaysBeforeNow(days: number): string {
    return new Date(nowMs - days * DAY_MS).toISOString();
  }

  function candidate(
    over: Partial<SpacedReviewCandidate> = {},
  ): SpacedReviewCandidate {
    return {
      id: "m1",
      category: "cache-is-ram",
      status: "RESOLVED",
      resolvedAtISO: isoDaysBeforeNow(8),
      severity: "MEDIUM",
      ...over,
    };
  }

  it("RESOLVED with resolved_at older than 7 days is eligible", () => {
    expect(
      selectSpacedReviewTarget(
        [candidate({ resolvedAtISO: isoDaysBeforeNow(10) })],
        NOW,
      ),
    ).toBe("cache-is-ram");
  });

  it("exactly 7 days old is eligible (>=, not >)", () => {
    expect(
      selectSpacedReviewTarget(
        [candidate({ resolvedAtISO: isoDaysBeforeNow(7) })],
        NOW,
      ),
    ).toBe("cache-is-ram");
    // Sanity: the boundary matches the named constant exactly.
    expect(MISCONCEPTION_REVIEW_INTERVAL_MS).toBe(7 * DAY_MS);
  });

  it("younger than 7 days is not eligible", () => {
    expect(
      selectSpacedReviewTarget(
        [candidate({ resolvedAtISO: isoDaysBeforeNow(6.9) })],
        NOW,
      ),
    ).toBeNull();
  });

  it("ACTIVE is excluded even if it has a resolvedAtISO value", () => {
    expect(
      selectSpacedReviewTarget(
        [candidate({ status: "ACTIVE", resolvedAtISO: isoDaysBeforeNow(30) })],
        NOW,
      ),
    ).toBeNull();
  });

  it("IMPROVING is excluded even if it has a resolvedAtISO value", () => {
    expect(
      selectSpacedReviewTarget(
        [
          candidate({
            status: "IMPROVING",
            resolvedAtISO: isoDaysBeforeNow(30),
          }),
        ],
        NOW,
      ),
    ).toBeNull();
  });

  it("RESOLVED with a missing resolved_at is excluded", () => {
    expect(
      selectSpacedReviewTarget([candidate({ resolvedAtISO: null })], NOW),
    ).toBeNull();
  });

  it("no candidates -> null", () => {
    expect(selectSpacedReviewTarget([], NOW)).toBeNull();
  });

  it("multiple due rows: the oldest resolved_at wins, deterministically", () => {
    const older = candidate({
      id: "m-older",
      category: "older-one",
      resolvedAtISO: isoDaysBeforeNow(30),
    });
    const newer = candidate({
      id: "m-newer",
      category: "newer-one",
      resolvedAtISO: isoDaysBeforeNow(8),
    });
    expect(selectSpacedReviewTarget([older, newer], NOW)).toBe("older-one");
    expect(selectSpacedReviewTarget([newer, older], NOW)).toBe("older-one");
  });

  it("severity breaks a tie on identical resolved_at", () => {
    const low = candidate({
      id: "m-low",
      category: "low-one",
      severity: "LOW",
    });
    const critical = candidate({
      id: "m-critical",
      category: "critical-one",
      severity: "CRITICAL",
    });
    expect(selectSpacedReviewTarget([low, critical], NOW)).toBe("critical-one");
  });

  it("input reordering never changes the result (multiple due rows)", () => {
    const a = candidate({
      id: "a",
      category: "cat-a",
      resolvedAtISO: isoDaysBeforeNow(9),
    });
    const b = candidate({
      id: "b",
      category: "cat-b",
      resolvedAtISO: isoDaysBeforeNow(20),
    });
    const c = candidate({
      id: "c",
      category: "cat-c",
      resolvedAtISO: isoDaysBeforeNow(15),
    });
    const first = selectSpacedReviewTarget([a, b, c], NOW);
    const second = selectSpacedReviewTarget([c, b, a], NOW);
    const third = selectSpacedReviewTarget([b, a, c], NOW);
    expect(first).toBe("cat-b");
    expect(first).toBe(second);
    expect(second).toBe(third);
  });

  it("is deterministic for identical input and time", () => {
    const input = [candidate({ resolvedAtISO: isoDaysBeforeNow(10) })];
    expect(selectSpacedReviewTarget(input, NOW)).toBe(
      selectSpacedReviewTarget(input, NOW),
    );
  });

  it("defaults to the real current time when nowISO is omitted", () => {
    // A misconception resolved far in the past is due under real "now" too.
    expect(
      selectSpacedReviewTarget([
        candidate({ resolvedAtISO: "2000-01-01T00:00:00.000Z" }),
      ]),
    ).toBe("cache-is-ram");
  });
});

describe("selectQuestionTargetCategory (10 priority merge)", () => {
  it("verification wins when both are present", () => {
    expect(
      selectQuestionTargetCategory({
        verifyMisconceptionCategory: "active-one",
        spacedReviewCategory: "resolved-one",
      }),
    ).toBe("active-one");
  });

  it("falls back to spaced review when no verification target exists", () => {
    expect(
      selectQuestionTargetCategory({
        verifyMisconceptionCategory: null,
        spacedReviewCategory: "resolved-one",
      }),
    ).toBe("resolved-one");
  });

  it("null when neither applies — falls through to ordinary selection", () => {
    expect(
      selectQuestionTargetCategory({
        verifyMisconceptionCategory: null,
        spacedReviewCategory: null,
      }),
    ).toBeNull();
  });
});
