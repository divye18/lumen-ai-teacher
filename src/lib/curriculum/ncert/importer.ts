import type { CurriculumStore } from "@/lib/db/repositories";
import type { Tables } from "@/lib/db/types";
import { ok, type Result } from "@/lib/result";

import type { NcertImportPlan, NcertPlanNode } from "./contracts";

/**
 * NCERT PERSISTENCE IMPORTER (Milestone 17.3.c).
 *
 * Walks an already-validated, already-built `NcertImportPlan` (see
 * `dataset.ts` / `contracts.ts` — this module never parses raw JSON itself)
 * and creates/reuses the corresponding `curriculum_sources` /
 * `curriculum_nodes` rows through the existing `CurriculumStore` repository.
 * No Supabase client is touched directly — every write goes through the
 * repository, so RLS/service-role concerns stay exactly where they already
 * live.
 *
 * IDEMPOTENCY is the core property: running this twice with the same plan
 * must not create duplicate sources or nodes. Identity is resolved the same
 * way `curriculum_nodes`'s own DB constraint resolves it —
 * `(curriculumSourceId, parentId, nodeType, normalizedTitle)` — via
 * `CurriculumStore.findByNaturalKey`, and at the source level via the new
 * `findSourceByNaturalKey` (added this milestone).
 *
 * CONSISTENCY STRATEGY: this repository layer has no transaction primitive
 * (Supabase-js issues one HTTP request per call; there is no multi-statement
 * transaction wrapper anywhere in this codebase — see `shared.ts`). Rather
 * than introduce one for this pilot, the importer relies on IDEMPOTENT
 * RESUME: nodes are only ever created after their parent already exists (so
 * a failure mid-import can never leave an orphaned child — the DB's own FK
 * constraint would reject that write outright), and every node/source
 * lookup is by natural key, not "did the last run succeed." If a call fails
 * partway through, the already-written rows are valid and complete for the
 * subtree written so far; re-running `importNcertDataset` with the same plan
 * finds and reuses everything already created and only creates what's still
 * missing — the same mechanism that makes a second, fully successful import
 * a no-op.
 *
 * VERSION/SYNC LIMITATION (documented, not silently assumed away): a
 * renamed topic is NOT detected as "the same node under a new title" — title
 * participates in the natural key, so a rename looks like "old node
 * disappeared, new node appeared." Disappearance is handled safely (the old
 * node is archived, never deleted — see below); appearance creates a new
 * node. No fuzzy/heuristic rename matching is implemented.
 */

export interface NcertImportSummary {
  sourceId: string;
  createdSources: number;
  reusedSources: number;
  createdNodes: number;
  reusedNodes: number;
  updatedNodes: number;
  archivedNodes: number;
}

type CurriculumNodeRow = Tables<"curriculum_nodes">;

function sourceTitle(plan: NcertImportPlan): string {
  const { class: cls, subject, textbookVersion } = plan.source;
  return `NCERT Class ${cls} ${subject} (${textbookVersion})`;
}

/** `null` stands for the plan's own root (no parent) — mirrors `listChildren`'s
 * own `parentId: string | null` convention, just keyed by string for a Map. */
const ROOT_KEY = "__root__";

/**
 * Resolve or create the one global NCERT source this plan belongs to.
 * Reuse-or-create only — an existing source's fields are never updated by
 * this importer (out of scope for this milestone; see the module doc).
 */
async function resolveSource(
  store: CurriculumStore,
  plan: NcertImportPlan,
): Promise<Result<{ id: string; created: boolean }>> {
  const metadataMatch: Record<string, string> = {
    class: plan.source.class,
    subject: plan.source.subject,
    textbookVersion: plan.source.textbookVersion,
  };

  const existing = await store.findSourceByNaturalKey({
    ownerUserId: null,
    kind: plan.source.kind,
    version: plan.datasetVersion,
    metadataMatch,
  });
  if (!existing.ok) return existing;
  if (existing.value) {
    return ok({ id: existing.value.id, created: false });
  }

  const created = await store.createSource({
    ownerUserId: null,
    kind: plan.source.kind,
    title: sourceTitle(plan),
    status: "READY",
    version: plan.datasetVersion,
    metadata: { ...metadataMatch, datasetVersion: plan.datasetVersion },
  });
  if (!created.ok) return created;
  return ok({ id: created.value.id, created: true });
}

interface NodeMutablePatch {
  title?: string;
  position?: number;
  status?: "ACTIVE";
}

/** Does this node's mutable fields differ from the plan, and does it need
 * reactivating (e.g. it was archived by a previous sync and has reappeared)? */
function mutableFieldsChanged(
  existing: CurriculumNodeRow,
  planNode: NcertPlanNode,
): NodeMutablePatch | null {
  const patch: NodeMutablePatch = {};
  if (existing.title !== planNode.title) patch.title = planNode.title;
  if (existing.position !== planNode.position)
    patch.position = planNode.position;
  if (existing.status !== "ACTIVE") patch.status = "ACTIVE";
  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * Import an already-parsed NCERT dataset plan into the curriculum database.
 * Idempotent: running this twice with the same plan creates zero duplicate
 * sources or nodes and leaves the same node ids in place.
 */
export async function importNcertDataset(
  store: CurriculumStore,
  plan: NcertImportPlan,
): Promise<Result<NcertImportSummary>> {
  const source = await resolveSource(store, plan);
  if (!source.ok) return source;

  const summary: NcertImportSummary = {
    sourceId: source.value.id,
    createdSources: source.value.created ? 1 : 0,
    reusedSources: source.value.created ? 0 : 1,
    createdNodes: 0,
    reusedNodes: 0,
    updatedNodes: 0,
    archivedNodes: 0,
  };

  /** naturalKey (from the plan) -> real curriculum_nodes.id */
  const idByNaturalKey = new Map<string, string>();
  /** real parentId (or ROOT_KEY) -> the (nodeType, normalizedTitle) pairs this
   * import intends to keep active under it — used for the archive pass. */
  const intendedChildrenByParent = new Map<string, Set<string>>();

  function recordIntendedChild(
    parentDbKey: string,
    nodeType: string,
    normalizedTitle: string,
  ): void {
    const key = `${nodeType}:${normalizedTitle}`;
    const set = intendedChildrenByParent.get(parentDbKey) ?? new Set<string>();
    set.add(key);
    intendedChildrenByParent.set(parentDbKey, set);
  }

  for (const planNode of plan.nodes) {
    const parentId = planNode.parentNaturalKey
      ? (idByNaturalKey.get(planNode.parentNaturalKey) ?? null)
      : null;
    const parentDbKey = parentId ?? ROOT_KEY;

    recordIntendedChild(
      parentDbKey,
      planNode.nodeType,
      planNode.normalizedTitle,
    );

    const found = await store.findByNaturalKey({
      curriculumSourceId: source.value.id,
      parentId,
      nodeType: planNode.nodeType,
      normalizedTitle: planNode.normalizedTitle,
    });
    if (!found.ok) return found;

    if (found.value) {
      idByNaturalKey.set(planNode.naturalKey, found.value.id);
      const patch = mutableFieldsChanged(found.value, planNode);
      if (patch) {
        const updated = await store.updateNode({
          id: found.value.id,
          ...patch,
        });
        if (!updated.ok) return updated;
        summary.updatedNodes += 1;
      } else {
        summary.reusedNodes += 1;
      }
      continue;
    }

    const created = await store.createNode({
      curriculumSourceId: source.value.id,
      parentId,
      nodeType: planNode.nodeType,
      title: planNode.title,
      normalizedTitle: planNode.normalizedTitle,
      position: planNode.position,
      status: "ACTIVE",
    });
    if (!created.ok) return created;
    idByNaturalKey.set(planNode.naturalKey, created.value.id);
    summary.createdNodes += 1;
  }

  // Archive pass: for every parent this import actually touched, any
  // currently-ACTIVE sibling not in this import's intended set is archived
  // (never deleted) — it means the dataset no longer includes that node.
  // Scoped only to parents this import touched, so it never reaches into
  // unrelated subtrees of the same source.
  for (const [parentDbKey, intended] of intendedChildrenByParent) {
    const parentId = parentDbKey === ROOT_KEY ? null : parentDbKey;
    const children = await store.listChildren(source.value.id, parentId);
    if (!children.ok) return children;

    for (const child of children.value) {
      if (child.status !== "ACTIVE") continue;
      const key = `${child.node_type}:${child.normalized_title}`;
      if (intended.has(key)) continue;
      const archived = await store.updateNode({
        id: child.id,
        status: "ARCHIVED",
      });
      if (!archived.ok) return archived;
      summary.archivedNodes += 1;
    }
  }

  return ok(summary);
}
