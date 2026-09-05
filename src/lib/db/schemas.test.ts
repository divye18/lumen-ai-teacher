import { describe, expect, it } from "vitest";

import {
  completeAssessmentSchema,
  conceptMasteryUpsertSchema,
  createConceptRelationshipSchema,
  createCurriculumNodeSchema,
  createCurriculumSourceSchema,
  learnerProfileUpsertSchema,
  recordInteractionSchema,
  recordMisconceptionSchema,
  updateCurriculumNodeSchema,
  updateCurriculumSourceSchema,
} from "./schemas";
import { supportedLanguageSchema } from "./enums";
import { normalizeSyllabusTitle } from "@/lib/syllabus/structure";

const USER = "00000000-0000-0000-0000-000000000001";
const CONCEPT = "c0000000-0000-0000-0000-000000000001";
const SESSION = "5e550000-0000-0000-0000-000000000001";
const SOURCE = "50000000-0000-0000-0000-000000000001";
const PARENT_NODE = "10000000-0000-0000-0000-000000000001";

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

// Milestone 17.2 — curriculum foundation. The natural-key uniqueness itself
// (source + parent + type + normalized title) is a DB-level constraint,
// verified against a real database in curriculum.integration.test.ts; these
// cover the schema-validation boundary that's testable without one.
describe("curriculum source validation", () => {
  it("A. accepts a shared/global source (ownerUserId omitted)", () => {
    const r = createCurriculumSourceSchema.safeParse({
      kind: "NCERT",
      title: "NCERT",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.ownerUserId).toBeUndefined();
      expect(r.data.status).toBe("DRAFT");
    }
  });

  it("F. accepts an explicitly private source (nullable owner, set)", () => {
    const r = createCurriculumSourceSchema.safeParse({
      ownerUserId: USER,
      kind: "USER_UPLOAD",
      title: "My uploaded notes",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.ownerUserId).toBe(USER);
  });

  it("accepts every documented kind", () => {
    for (const kind of [
      "NCERT",
      "USER_UPLOAD",
      "CBSE",
      "ICSE",
      "UNIVERSITY",
      "OTHER",
    ]) {
      const r = createCurriculumSourceSchema.safeParse({ kind, title: "X" });
      expect(r.success).toBe(true);
    }
  });

  it("K. rejects an unrecognized kind", () => {
    const r = createCurriculumSourceSchema.safeParse({
      kind: "MADE_UP_BOARD",
      title: "X",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a blank title", () => {
    const r = createCurriculumSourceSchema.safeParse({
      kind: "NCERT",
      title: "",
    });
    expect(r.success).toBe(false);
  });

  it("I. accepts a free-text dataset version, and its absence", () => {
    const withVersion = createCurriculumSourceSchema.safeParse({
      kind: "NCERT",
      title: "NCERT",
      version: "2024-25",
    });
    expect(withVersion.success).toBe(true);
    if (withVersion.success) expect(withVersion.data.version).toBe("2024-25");

    const withoutVersion = createCurriculumSourceSchema.safeParse({
      kind: "NCERT",
      title: "NCERT",
    });
    expect(withoutVersion.success).toBe(true);
    if (withoutVersion.success)
      expect(withoutVersion.data.version).toBeUndefined();
  });

  it("I. a later version is just a new value — updating in place is supported", () => {
    const r = updateCurriculumSourceSchema.safeParse({
      id: SOURCE,
      version: "2025-26",
      status: "READY",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an unrecognized status", () => {
    const r = createCurriculumSourceSchema.safeParse({
      kind: "NCERT",
      title: "NCERT",
      status: "PUBLISHED",
    });
    expect(r.success).toBe(false);
  });
});

describe("curriculum node validation", () => {
  const baseNode = {
    curriculumSourceId: SOURCE,
    nodeType: "SUBJECT" as const,
    title: "Physics",
    normalizedTitle: "physics",
  };

  it("B. accepts a minimal valid node", () => {
    const r = createCurriculumNodeSchema.safeParse(baseNode);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.position).toBe(0);
      expect(r.data.status).toBe("ACTIVE");
    }
  });

  it("D. accepts an explicit parentId (child node)", () => {
    const r = createCurriculumNodeSchema.safeParse({
      ...baseNode,
      nodeType: "CHAPTER",
      title: "Current Electricity",
      normalizedTitle: "current electricity",
      parentId: PARENT_NODE,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.parentId).toBe(PARENT_NODE);
  });

  it("D. omitting parentId represents a root node", () => {
    const r = createCurriculumNodeSchema.safeParse(baseNode);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.parentId).toBeUndefined();
  });

  it("C. accepts every documented node type, supporting arbitrary depth via parentId rather than the type list", () => {
    for (const nodeType of [
      "CLASS",
      "SUBJECT",
      "CHAPTER",
      "TOPIC",
      "SUBTOPIC",
      "SECTION",
      "DOCUMENT",
      "OTHER",
    ]) {
      const r = createCurriculumNodeSchema.safeParse({ ...baseNode, nodeType });
      expect(r.success).toBe(true);
    }
  });

  it("K. rejects an unrecognized node type", () => {
    const r = createCurriculumNodeSchema.safeParse({
      ...baseNode,
      nodeType: "SEMESTER",
    });
    expect(r.success).toBe(false);
  });

  it("G. position must be a non-negative integer", () => {
    expect(
      createCurriculumNodeSchema.safeParse({ ...baseNode, position: 3 })
        .success,
    ).toBe(true);
    expect(
      createCurriculumNodeSchema.safeParse({ ...baseNode, position: -1 })
        .success,
    ).toBe(false);
    expect(
      createCurriculumNodeSchema.safeParse({ ...baseNode, position: 1.5 })
        .success,
    ).toBe(false);
  });

  it("never invents a page number: pageStart/pageEnd are nullable and non-negative when present", () => {
    const r = createCurriculumNodeSchema.safeParse({
      ...baseNode,
      pageStart: 12,
      pageEnd: 30,
    });
    expect(r.success).toBe(true);
    expect(
      createCurriculumNodeSchema.safeParse({ ...baseNode, pageStart: -1 })
        .success,
    ).toBe(false);
  });

  it("K. rejects a blank normalizedTitle", () => {
    const r = createCurriculumNodeSchema.safeParse({
      ...baseNode,
      normalizedTitle: "",
    });
    expect(r.success).toBe(false);
  });

  it("updateCurriculumNodeSchema allows a partial patch, e.g. archiving a node", () => {
    const r = updateCurriculumNodeSchema.safeParse({
      id: PARENT_NODE,
      status: "ARCHIVED",
    });
    expect(r.success).toBe(true);
  });
});

// H / J. Deterministic natural-key input: `normalizedTitle` is expected to be
// computed via the existing, already-tested `normalizeSyllabusTitle` (reused,
// not duplicated) so "Unit I" and "Unit 1" collide under the DB's natural-key
// uniqueness constraint exactly the same way they already collide for the
// PDF-derived structure builder.
describe("curriculum node natural-key input (normalizedTitle)", () => {
  it("H/J. the same normalization used for PDF-derived titles applies to curriculum node titles", () => {
    expect(normalizeSyllabusTitle("Unit I")).toBe(
      normalizeSyllabusTitle("Unit 1"),
    );
    expect(normalizeSyllabusTitle("  Physics  ")).toBe(
      normalizeSyllabusTitle("physics"),
    );
  });

  it("H/J. distinct titles normalize distinctly (no over-collapsing)", () => {
    expect(normalizeSyllabusTitle("Physics")).not.toBe(
      normalizeSyllabusTitle("Chemistry"),
    );
  });

  it("J. is deterministic — same input, same natural-key material every time", () => {
    const a = createCurriculumNodeSchema.safeParse({
      curriculumSourceId: SOURCE,
      nodeType: "SUBJECT",
      title: "Physics",
      normalizedTitle: normalizeSyllabusTitle("Physics"),
    });
    const b = createCurriculumNodeSchema.safeParse({
      curriculumSourceId: SOURCE,
      nodeType: "SUBJECT",
      title: "Physics",
      normalizedTitle: normalizeSyllabusTitle("Physics"),
    });
    expect(a.success && b.success).toBe(true);
    if (a.success && b.success) {
      expect(a.data.normalizedTitle).toBe(b.data.normalizedTitle);
    }
  });
});
