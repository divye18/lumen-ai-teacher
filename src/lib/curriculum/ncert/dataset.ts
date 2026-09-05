import { err, ok, type Result } from "@/lib/result";
import { ValidationError } from "@/lib/errors";
import { normalizeSyllabusTitle } from "@/lib/syllabus/structure";

import {
  ncertDatasetInputSchema,
  type NcertChapterInput,
  type NcertDatasetInput,
  type NcertImportPlan,
  type NcertPlanNode,
  type NcertSourceInput,
  type NcertSubtopicInput,
  type NcertTopicInput,
} from "./contracts";

/**
 * DETERMINISTIC NCERT DATASET PARSER + IMPORT-PLAN BUILDER (Milestone 17.3.a).
 *
 * Turns a hand-authored NCERT dataset (see `contracts.ts`) into a flat,
 * ordered `NcertImportPlan` a later persistence milestone (17.3.c) can walk
 * to create `curriculum_nodes` rows for CLASS -> SUBJECT -> CHAPTER -> TOPIC
 * -> SUBTOPIC. Pure: same input always produces byte-identical output. No
 * Supabase, no repository imports, no network calls, no filesystem access,
 * no author-supplied or randomly generated ids.
 *
 * Title NORMALIZATION reuses `normalizeSyllabusTitle` from the existing
 * syllabus module (lowercasing, whitespace collapsing, roman-numeral
 * folding) — deliberately the only thing borrowed from that module. This
 * parser does not reuse its heading-detection/tree-building logic: NCERT
 * input already carries an explicit, authored hierarchy, so there is no
 * heading-classification problem to solve here.
 */

/** `class = "11"` -> `"Class 11"`. Deterministic, documented formatting —
 * the dataset's `class` field is trimmed and used verbatim after the
 * fixed "Class " prefix; no numeral parsing or reformatting is attempted. */
function classNodeTitle(sourceClass: string): string {
  return `Class ${sourceClass.trim()}`;
}

/** The SUBJECT node's title is the dataset's `subject` field verbatim
 * (trimmed) — no prefix, since "Subject Physics" reads worse than "Physics"
 * and the node's `nodeType` already disambiguates it. */
function subjectNodeTitle(sourceSubject: string): string {
  return sourceSubject.trim();
}

function naturalKeyOf(
  parentNaturalKey: string | null,
  nodeType: NcertPlanNode["nodeType"],
  normalizedTitle: string,
): string {
  const segment = `${nodeType}:${normalizedTitle}`;
  return parentNaturalKey ? `${parentNaturalKey}/${segment}` : segment;
}

function planNode(
  nodeType: NcertPlanNode["nodeType"],
  title: string,
  position: number,
  parentNaturalKey: string | null,
): NcertPlanNode {
  const normalizedTitle = normalizeSyllabusTitle(title);
  return {
    nodeType,
    title,
    normalizedTitle,
    position,
    parentNaturalKey,
    naturalKey: naturalKeyOf(parentNaturalKey, nodeType, normalizedTitle),
  };
}

function planSubtopic(
  subtopic: NcertSubtopicInput,
  parentNaturalKey: string,
): NcertPlanNode {
  return planNode(
    "SUBTOPIC",
    subtopic.title,
    subtopic.position,
    parentNaturalKey,
  );
}

function planTopic(
  topic: NcertTopicInput,
  parentNaturalKey: string,
): NcertPlanNode[] {
  const node = planNode("TOPIC", topic.title, topic.position, parentNaturalKey);
  const subtopics = topic.subtopics.map((subtopic) =>
    planSubtopic(subtopic, node.naturalKey),
  );
  return [node, ...subtopics];
}

function planChapter(
  chapter: NcertChapterInput,
  parentNaturalKey: string,
): NcertPlanNode[] {
  const node = planNode(
    "CHAPTER",
    chapter.title,
    chapter.position,
    parentNaturalKey,
  );
  const topics = chapter.topics.flatMap((topic) =>
    planTopic(topic, node.naturalKey),
  );
  return [node, ...topics];
}

/**
 * Build the flattened NCERT import plan from an already-validated dataset.
 * Pure — the same input always produces byte-identical output. Deterministic
 * pre-order: CLASS, SUBJECT, then each chapter (in dataset array order) and
 * its topics/subtopics depth-first. Input array order and each explicit
 * `position` value are preserved verbatim; nothing is ever re-sorted.
 */
export function buildNcertImportPlan(
  dataset: NcertDatasetInput,
): NcertImportPlan {
  const classNode = planNode(
    "CLASS",
    classNodeTitle(dataset.source.class),
    0,
    null,
  );
  const subjectNode = planNode(
    "SUBJECT",
    subjectNodeTitle(dataset.source.subject),
    0,
    classNode.naturalKey,
  );
  const chapterNodes = dataset.chapters.flatMap((chapter) =>
    planChapter(chapter, subjectNode.naturalKey),
  );

  return {
    datasetVersion: dataset.datasetVersion,
    source: dataset.source,
    nodes: [classNode, subjectNode, ...chapterNodes],
  };
}

/**
 * Validated entry point: parses raw input against the dataset contract and
 * builds the import plan. The core `buildNcertImportPlan` above stays a
 * plain, directly-testable pure function; this wrapper adds the project's
 * standard `Result`-based validation boundary around it.
 */
export function parseNcertDataset(rawInput: unknown): Result<NcertImportPlan> {
  const parsed = ncertDatasetInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return err(
      new ValidationError("invalid NCERT dataset input", parsed.error.issues),
    );
  }

  return ok(buildNcertImportPlan(parsed.data));
}

export type { NcertSourceInput };
