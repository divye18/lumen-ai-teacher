import { describe, expect, it } from "vitest";

import {
  completeAssessmentSchema,
  conceptMasteryUpsertSchema,
  createConceptRelationshipSchema,
  learnerProfileUpsertSchema,
  recordInteractionSchema,
  recordMisconceptionSchema,
} from "./schemas";
import { supportedLanguageSchema } from "./enums";

const USER = "00000000-0000-0000-0000-000000000001";
const CONCEPT = "c0000000-0000-0000-0000-000000000001";
const SESSION = "5e550000-0000-0000-0000-000000000001";

describe("supported language validation", () => {
  it.each(["en", "hi", "hinglish"])("accepts %s", (lang) => {
    expect(supportedLanguageSchema.safeParse(lang).success).toBe(true);
  });

  it.each(["fr", "en-US", "", "EN"])("rejects %s", (lang) => {
    expect(supportedLanguageSchema.safeParse(lang).success).toBe(false);
  });
});

describe("complete assessment — compare-and-swap guard", () => {
  const ASSESSMENT = "a0000000-0000-0000-0000-000000000001";

  it("accepts a completion with no CAS guard (unconditional update)", () => {
    const r = completeAssessmentSchema.safeParse({
      id: ASSESSMENT,
      status: "COMPLETED",
    });
    expect(r.success).toBe(true);
  });

  it("accepts a completion guarded by expectedCurrentStatus", () => {
    const r = completeAssessmentSchema.safeParse({
      id: ASSESSMENT,
      status: "COMPLETED",
      score: 3,
      maxScore: 8,
      expectedCurrentStatus: "IN_PROGRESS",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.expectedCurrentStatus).toBe("IN_PROGRESS");
  });

  it("rejects a nonsense expectedCurrentStatus value", () => {
    const r = completeAssessmentSchema.safeParse({
      id: ASSESSMENT,
      status: "COMPLETED",
      expectedCurrentStatus: "NOT_A_REAL_STATUS",
    });
    expect(r.success).toBe(false);
  });
});

describe("concept mastery bounds", () => {
  const base = { userId: USER, conceptId: CONCEPT };

  it("accepts scores within 0..1", () => {
    const r = conceptMasteryUpsertSchema.safeParse({
      ...base,
      masteryScore: 0.75,
      confidenceScore: 0,
    });
    expect(r.success).toBe(true);
  });

  it.each([1.5, -0.1, 2, Number.NaN])(
    "rejects mastery score %s",
    (masteryScore) => {
      const r = conceptMasteryUpsertSchema.safeParse({ ...base, masteryScore });
      expect(r.success).toBe(false);
    },
  );

  it("rejects a confidence score above 1", () => {
    const r = conceptMasteryUpsertSchema.safeParse({
      ...base,
      confidenceScore: 1.01,
    });
    expect(r.success).toBe(false);
  });

  it("rejects negative counters", () => {
    const r = conceptMasteryUpsertSchema.safeParse({
      ...base,
      attemptCount: -1,
    });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown mastery status", () => {
    const r = conceptMasteryUpsertSchema.safeParse({
      ...base,
      status: "GENIUS",
    });
    expect(r.success).toBe(false);
  });
});

describe("misconception confidence bounds", () => {
  const base = {
    userId: USER,
    conceptId: CONCEPT,
    category: "memory-model",
    description: "thinks heap frees itself",
  };

  it("defaults confidence to 0.5", () => {
    const r = recordMisconceptionSchema.parse(base);
    expect(r.confidence).toBe(0.5);
  });

  it.each([1.2, -0.01])("rejects confidence %s", (confidence) => {
    const r = recordMisconceptionSchema.safeParse({ ...base, confidence });
    expect(r.success).toBe(false);
  });
});

describe("repository input validation", () => {
  it("requires UUIDs for interaction references", () => {
    const r = recordInteractionSchema.safeParse({
      sessionId: "not-a-uuid",
      userId: USER,
      role: "STUDENT",
      interactionType: "ANSWER",
      content: "hello",
    });
    expect(r.success).toBe(false);
  });

  it("accepts a valid interaction and defaults content", () => {
    const r = recordInteractionSchema.parse({
      sessionId: SESSION,
      userId: USER,
      role: "TEACHER",
      interactionType: "EXPLANATION",
    });
    expect(r.content).toBe("");
  });

  it("rejects an unknown interaction type", () => {
    const r = recordInteractionSchema.safeParse({
      sessionId: SESSION,
      userId: USER,
      role: "TEACHER",
      interactionType: "SINGING",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a self-referential concept relationship", () => {
    const r = createConceptRelationshipSchema.safeParse({
      sourceConceptId: CONCEPT,
      targetConceptId: CONCEPT,
      relationshipType: "RELATED",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an out-of-range learner level", () => {
    const r = learnerProfileUpsertSchema.safeParse({
      userId: USER,
      currentLevel: 7,
    });
    expect(r.success).toBe(false);
  });

  it("rejects an unsupported preferred language", () => {
    const r = learnerProfileUpsertSchema.safeParse({
      userId: USER,
      preferredLanguage: "de",
    });
    expect(r.success).toBe(false);
  });
});
