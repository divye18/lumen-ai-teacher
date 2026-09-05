import "server-only";

import { err, ok, type Result } from "@/lib/result";
import { LumenError } from "@/lib/errors";
import type {
  CurriculumNodeRow,
  CurriculumSourceRow,
  CurriculumStore,
} from "@/lib/db/repositories";

/**
 * NCERT CURRICULUM BROWSER (Milestone 18.1) — server-only.
 *
 * A thin, read-only composition over the existing `CurriculumStore` (added
 * in 17.2/17.3.c). Resolves the NCERT source and walks its
 * CLASS -> SUBJECT -> CHAPTER -> TOPIC hierarchy by URL slug, without ever
 * hardcoding a source id, class name, subject name, or topic title — every
 * value rendered by the Curriculum Explorer routes comes from these
 * functions, which come from the database.
 *
 * No new repository method was needed: `listSourcesForUser` (global-or-mine
 * sources) and `listChildren` (this store's existing parent -> children
 * lookup, already ordered by `position`) are exactly what each level of the
 * browser requires.
 *
 * SLUGS are derived from `normalized_title` (already computed and stored by
 * the NCERT importer — see `curriculum-nodes.normalized_title`), with
 * spaces folded to hyphens. Resolving a slug back to a node is a plain
 * linear scan of that level's (small) children list — no separate lookup
 * table, no new database query shape.
 */

/** `"units and measurement"` -> `"units-and-measurement"`. Applied to an
 * already-normalized title (see `normalizeSyllabusTitle` at write time) —
 * this function only needs to make that string URL-safe, not renormalize it. */
export function nodeSlug(
  node: Pick<CurriculumNodeRow, "normalized_title">,
): string {
  return node.normalized_title
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function findActiveChildBySlug(
  children: CurriculumNodeRow[],
  slug: string,
): CurriculumNodeRow | null {
  return (
    children.find((c) => c.status === "ACTIVE" && nodeSlug(c) === slug) ?? null
  );
}

/** Resolve the one global NCERT source visible to this user. Does not
 * hardcode a source id, version, or metadata value — any source of
 * `kind: "NCERT"` that RLS allows this user to see is eligible, so this
 * keeps working unchanged if the source is ever re-imported under a new id. */
export async function resolveNcertSource(
  store: CurriculumStore,
  userId: string,
): Promise<Result<CurriculumSourceRow>> {
  const sources = await store.listSourcesForUser(userId);
  if (!sources.ok) return sources;

  const ncert = sources.value.find(
    (s) => s.kind === "NCERT" && s.status !== "ARCHIVED",
  );
  if (!ncert) {
    return err(
      new LumenError(
        "NOT_FOUND",
        "No NCERT curriculum source is available yet.",
        { recoverable: true },
      ),
    );
  }
  return ok(ncert);
}

export interface NcertClassLevel {
  source: CurriculumSourceRow;
  classes: CurriculumNodeRow[];
}

export interface NcertSubjectLevel {
  source: CurriculumSourceRow;
  classNode: CurriculumNodeRow;
  subjects: CurriculumNodeRow[];
}

export interface NcertChapterLevel {
  source: CurriculumSourceRow;
  classNode: CurriculumNodeRow;
  subjectNode: CurriculumNodeRow;
  chapters: CurriculumNodeRow[];
}

export interface NcertTopicLevel {
  source: CurriculumSourceRow;
  classNode: CurriculumNodeRow;
  subjectNode: CurriculumNodeRow;
  chapterNode: CurriculumNodeRow;
  topics: CurriculumNodeRow[];
}

function activeOfType(
  nodes: CurriculumNodeRow[],
  nodeType: CurriculumNodeRow["node_type"],
): CurriculumNodeRow[] {
  return nodes.filter((n) => n.status === "ACTIVE" && n.node_type === nodeType);
}

export async function getNcertClassLevel(
  store: CurriculumStore,
  userId: string,
): Promise<Result<NcertClassLevel>> {
  const source = await resolveNcertSource(store, userId);
  if (!source.ok) return source;

  const children = await store.listChildren(source.value.id, null);
  if (!children.ok) return children;

  return ok({
    source: source.value,
    classes: activeOfType(children.value, "CLASS"),
  });
}

/**
 * Resolve the SUBJECT level under a CLASS identified by its URL slug.
 * `ok(null)` (not an error) means the slug matched no active CLASS node —
 * the caller should render a 404, not silently fall back to unrelated data.
 */
export async function getNcertSubjectLevel(
  store: CurriculumStore,
  userId: string,
  classSlug: string,
): Promise<Result<NcertSubjectLevel | null>> {
  const level = await getNcertClassLevel(store, userId);
  if (!level.ok) return level;

  const classNode = findActiveChildBySlug(level.value.classes, classSlug);
  if (!classNode) return ok(null);

  const children = await store.listChildren(
    level.value.source.id,
    classNode.id,
  );
  if (!children.ok) return children;

  return ok({
    source: level.value.source,
    classNode,
    subjects: activeOfType(children.value, "SUBJECT"),
  });
}

export async function getNcertChapterLevel(
  store: CurriculumStore,
  userId: string,
  classSlug: string,
  subjectSlug: string,
): Promise<Result<NcertChapterLevel | null>> {
  const level = await getNcertSubjectLevel(store, userId, classSlug);
  if (!level.ok) return level;
  if (!level.value) return ok(null);

  const subjectNode = findActiveChildBySlug(level.value.subjects, subjectSlug);
  if (!subjectNode) return ok(null);

  const children = await store.listChildren(
    level.value.source.id,
    subjectNode.id,
  );
  if (!children.ok) return children;

  return ok({
    source: level.value.source,
    classNode: level.value.classNode,
    subjectNode,
    chapters: activeOfType(children.value, "CHAPTER"),
  });
}

export async function getNcertTopicLevel(
  store: CurriculumStore,
  userId: string,
  classSlug: string,
  subjectSlug: string,
  chapterSlug: string,
): Promise<Result<NcertTopicLevel | null>> {
  const level = await getNcertChapterLevel(
    store,
    userId,
    classSlug,
    subjectSlug,
  );
  if (!level.ok) return level;
  if (!level.value) return ok(null);

  const chapterNode = findActiveChildBySlug(level.value.chapters, chapterSlug);
  if (!chapterNode) return ok(null);

  const children = await store.listChildren(
    level.value.source.id,
    chapterNode.id,
  );
  if (!children.ok) return children;

  return ok({
    source: level.value.source,
    classNode: level.value.classNode,
    subjectNode: level.value.subjectNode,
    chapterNode,
    topics: activeOfType(children.value, "TOPIC"),
  });
}
