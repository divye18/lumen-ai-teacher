import { z } from "zod";

/**
 * NCERT DATASET CONTRACTS (Milestone 17.3.a — pure layer only).
 *
 * Describes the INPUT a hand-authored NCERT dataset file must satisfy, and
 * the OUTPUT (`NcertImportPlan`) a later persistence milestone (17.3.c)
 * consumes to create `curriculum_nodes` rows. No Supabase, no repository
 * imports, no filesystem access, no database ids — see `dataset.ts` for the
 * pure transformation itself.
 */

const nonNegativeIntSchema = z.number().int().min(0);
const requiredTitleSchema = z.string().trim().min(1).max(300);

// ── Node types this milestone can produce ──────────────────────────────────
// Deliberately a local, standalone tuple (not imported from
// `src/lib/db/enums.ts`) so this pure module has zero dependency on the DB
// layer's module graph. The five values are intentionally a strict subset of
// `CURRICULUM_NODE_TYPES` (which also allows SECTION/DOCUMENT/OTHER) — kept
// in sync by convention, verified by the persistence milestone's tests.
export const NCERT_NODE_TYPES = [
  "CLASS",
  "SUBJECT",
  "CHAPTER",
  "TOPIC",
  "SUBTOPIC",
] as const;
export const ncertNodeTypeSchema = z.enum(NCERT_NODE_TYPES);
export type NcertNodeType = (typeof NCERT_NODE_TYPES)[number];

// ── Dataset input (the raw, hand-authored JSON shape) ──────────────────────

export const ncertSourceInputSchema = z.object({
  kind: z.literal("NCERT"),
  /** e.g. "11". Free text on purpose — NCERT classes are not always a bare
   * integer (e.g. some datasets may need "11-12" combined volumes later). */
  class: requiredTitleSchema,
  subject: requiredTitleSchema,
  textbookVersion: requiredTitleSchema,
});
export type NcertSourceInput = z.infer<typeof ncertSourceInputSchema>;

export const ncertSubtopicInputSchema = z.object({
  title: requiredTitleSchema,
  position: nonNegativeIntSchema,
});
export type NcertSubtopicInput = z.infer<typeof ncertSubtopicInputSchema>;

export const ncertTopicInputSchema = z.object({
  title: requiredTitleSchema,
  position: nonNegativeIntSchema,
  subtopics: z.array(ncertSubtopicInputSchema).default([]),
});
export type NcertTopicInput = z.infer<typeof ncertTopicInputSchema>;

export const ncertChapterInputSchema = z.object({
  title: requiredTitleSchema,
  position: nonNegativeIntSchema,
  topics: z.array(ncertTopicInputSchema).default([]),
});
export type NcertChapterInput = z.infer<typeof ncertChapterInputSchema>;

export const ncertDatasetInputSchema = z.object({
  datasetVersion: z.string().trim().min(1),
  source: ncertSourceInputSchema,
  chapters: z.array(ncertChapterInputSchema),
});
export type NcertDatasetInput = z.infer<typeof ncertDatasetInputSchema>;

// ── Import plan (the OUTPUT a later persistence milestone consumes) ────────

export interface NcertPlanNode {
  nodeType: NcertNodeType;
  /** Original, human-readable title — never altered. */
  title: string;
  /** Deterministic normalized form (see `dataset.ts`), used for identity only. */
  normalizedTitle: string;
  /** Position among this node's siblings, taken directly from the dataset
   * (CLASS/SUBJECT are always 0 — there is exactly one of each per plan). */
  position: number;
  /** `naturalKey` of this node's parent within THIS plan, or `null` for the
   * root (CLASS) node. Not a database id. */
  parentNaturalKey: string | null;
  /**
   * A deterministic identity path for this node, stable across repeated
   * builds of the same dataset (same input -> byte-identical key). It exists
   * only to link plan nodes to each other; persistence (17.3.c) does not
   * write it anywhere. The real database identity a later milestone resolves
   * against is `(curriculumSourceId, parentId, nodeType, normalizedTitle)` —
   * this key encodes the same `(parent, nodeType, normalizedTitle)` chain,
   * one level at a time, so persistence can walk the plan top-down and
   * resolve/create each real `parentId` before moving to its children.
   */
  naturalKey: string;
}

export interface NcertImportPlan {
  datasetVersion: string;
  source: NcertSourceInput;
  /** Flattened, deterministic pre-order traversal: CLASS, then SUBJECT, then
   * each chapter (in dataset order) and its topics/subtopics depth-first. */
  nodes: NcertPlanNode[];
}
