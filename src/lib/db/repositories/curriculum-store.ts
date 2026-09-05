import type { CurriculumSourceKind } from "@/lib/db/enums";
import type { Json } from "@/lib/db/types";
import { err, ok, type Result } from "@/lib/result";

import type { Tables, TablesInsert, TablesUpdate } from "../types";
import {
  createCurriculumNodeSchema,
  createCurriculumSourceSchema,
  updateCurriculumNodeSchema,
  updateCurriculumSourceSchema,
  uuidSchema,
  type CreateCurriculumNodeInput,
  type CreateCurriculumSourceInput,
  type UpdateCurriculumNodeInput,
  type UpdateCurriculumSourceInput,
} from "../schemas";
import {
  fromPostgrestError,
  listResult,
  parseInput,
  rowResult,
  type DbClient,
} from "./shared";

export type CurriculumSourceRow = Tables<"curriculum_sources">;
export type CurriculumNodeRow = Tables<"curriculum_nodes">;

export interface CurriculumStore {
  createSource(
    input: CreateCurriculumSourceInput,
  ): Promise<Result<CurriculumSourceRow>>;
  getSource(sourceId: string): Promise<Result<CurriculumSourceRow>>;
  /**
   * Sources visible to this user: every shared/global source
   * (`owner_user_id IS NULL`) plus this user's own private sources. Expressed
   * explicitly here (not just left to RLS) so it also behaves correctly when
   * called with the admin client (tests, trusted server tasks).
   */
  listSourcesForUser(userId: string): Promise<Result<CurriculumSourceRow[]>>;
  updateSource(
    input: UpdateCurriculumSourceInput,
  ): Promise<Result<CurriculumSourceRow>>;
  /**
   * Look up a source by its natural identity (owner + kind + version, then
   * an exact match on the given `metadata` keys) — the same identity a
   * deterministic re-import matches on. Returns `null` (not a NOT_FOUND
   * error) when nothing matches, so a caller can use this directly as a
   * "reuse or create" check, mirroring `findByNaturalKey` for nodes below.
   * `metadataMatch` is checked client-side (no jsonb-path querying) since
   * only one or two sources are ever expected per (ownerUserId, kind,
   * version) combination.
   */
  findSourceByNaturalKey(input: {
    ownerUserId: string | null;
    kind: CurriculumSourceKind;
    version: string;
    metadataMatch: Record<string, string>;
  }): Promise<Result<CurriculumSourceRow | null>>;

  createNode(
    input: CreateCurriculumNodeInput,
  ): Promise<Result<CurriculumNodeRow>>;
  createNodes(
    inputs: CreateCurriculumNodeInput[],
  ): Promise<Result<CurriculumNodeRow[]>>;
  getNode(nodeId: string): Promise<Result<CurriculumNodeRow>>;
  /** Every node belonging to a source, in a stable (parent, position) order. */
  listNodesForSource(sourceId: string): Promise<Result<CurriculumNodeRow[]>>;
  /** Direct children of a node (or root children when `parentId` is null),
   * in position order. */
  listChildren(
    sourceId: string,
    parentId: string | null,
  ): Promise<Result<CurriculumNodeRow[]>>;
  updateNode(
    input: UpdateCurriculumNodeInput,
  ): Promise<Result<CurriculumNodeRow>>;
  /**
   * Look up a node by its natural key (source + parent + type + normalized
   * title) — the same identity a deterministic re-seed matches on. Returns
   * `null` (not a NOT_FOUND error) when nothing matches, so a caller can use
   * this directly as a "reuse or create" check.
   */
  findByNaturalKey(input: {
    curriculumSourceId: string;
    parentId: string | null;
    nodeType: string;
    normalizedTitle: string;
  }): Promise<Result<CurriculumNodeRow | null>>;
}

export function createCurriculumStore(db: DbClient): CurriculumStore {
  return {
    async createSource(input) {
      const parsed = parseInput(createCurriculumSourceSchema, input);
      if (!parsed.ok) return parsed;
      const v = parsed.value;

      const payload: TablesInsert<"curriculum_sources"> = {
        owner_user_id: v.ownerUserId ?? null,
        kind: v.kind,
        title: v.title,
        status: v.status,
        version: v.version ?? null,
        metadata: (v.metadata ?? {}) as Json,
      };

      return rowResult(
        await db
          .from("curriculum_sources")
          .insert(payload)
          .select("*")
          .single(),
      );
    },

    async getSource(sourceId) {
      const id = parseInput(uuidSchema, sourceId);
      if (!id.ok) return id;
      return rowResult(
        await db
          .from("curriculum_sources")
          .select("*")
          .eq("id", id.value)
          .maybeSingle(),
      );
    },

    async listSourcesForUser(userId) {
      const id = parseInput(uuidSchema, userId);
      if (!id.ok) return id;
      return listResult(
        await db
          .from("curriculum_sources")
          .select("*")
          .or(`owner_user_id.is.null,owner_user_id.eq.${id.value}`)
          .order("created_at", { ascending: false }),
      );
    },

    async updateSource(input) {
      const parsed = parseInput(updateCurriculumSourceSchema, input);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const patch: TablesUpdate<"curriculum_sources"> = {
        ...(v.title !== undefined && { title: v.title }),
        ...(v.status !== undefined && { status: v.status }),
        ...(v.version !== undefined && { version: v.version }),
        ...(v.metadata !== undefined && { metadata: v.metadata as Json }),
      };
      return rowResult(
        await db
          .from("curriculum_sources")
          .update(patch)
          .eq("id", v.id)
          .select("*")
          .single(),
      );
    },

    async findSourceByNaturalKey(input) {
      let query = db
        .from("curriculum_sources")
        .select("*")
        .eq("kind", input.kind)
        .eq("version", input.version);
      query =
        input.ownerUserId === null
          ? query.is("owner_user_id", null)
          : query.eq("owner_user_id", input.ownerUserId);

      const res = await listResult(await query);
      if (!res.ok) return res;

      const match = res.value.find((row) => {
        const metadata = (row.metadata ?? {}) as Record<string, unknown>;
        return Object.entries(input.metadataMatch).every(
          ([key, value]) => metadata[key] === value,
        );
      });
      return ok(match ?? null);
    },

    async createNode(input) {
      const parsed = parseInput(createCurriculumNodeSchema, input);
      if (!parsed.ok) return parsed;
      const v = parsed.value;

      const payload: TablesInsert<"curriculum_nodes"> = {
        curriculum_source_id: v.curriculumSourceId,
        parent_id: v.parentId ?? null,
        node_type: v.nodeType,
        title: v.title,
        normalized_title: v.normalizedTitle,
        position: v.position,
        page_start: v.pageStart ?? null,
        page_end: v.pageEnd ?? null,
        metadata: (v.metadata ?? {}) as Json,
        status: v.status,
      };

      return rowResult(
        await db.from("curriculum_nodes").insert(payload).select("*").single(),
      );
    },

    async createNodes(inputs) {
      if (inputs.length === 0) return ok([]);
      const rows: TablesInsert<"curriculum_nodes">[] = [];
      for (const input of inputs) {
        const parsed = parseInput(createCurriculumNodeSchema, input);
        if (!parsed.ok) return parsed;
        const v = parsed.value;
        rows.push({
          curriculum_source_id: v.curriculumSourceId,
          parent_id: v.parentId ?? null,
          node_type: v.nodeType,
          title: v.title,
          normalized_title: v.normalizedTitle,
          position: v.position,
          page_start: v.pageStart ?? null,
          page_end: v.pageEnd ?? null,
          metadata: (v.metadata ?? {}) as Json,
          status: v.status,
        });
      }
      const res = await db.from("curriculum_nodes").insert(rows).select("*");
      if (res.error) return err(fromPostgrestError(res.error));
      return ok(res.data ?? []);
    },

    async getNode(nodeId) {
      const id = parseInput(uuidSchema, nodeId);
      if (!id.ok) return id;
      return rowResult(
        await db
          .from("curriculum_nodes")
          .select("*")
          .eq("id", id.value)
          .maybeSingle(),
      );
    },

    async listNodesForSource(sourceId) {
      const id = parseInput(uuidSchema, sourceId);
      if (!id.ok) return id;
      return listResult(
        await db
          .from("curriculum_nodes")
          .select("*")
          .eq("curriculum_source_id", id.value)
          .order("position", { ascending: true }),
      );
    },

    async listChildren(sourceId, parentId) {
      const id = parseInput(uuidSchema, sourceId);
      if (!id.ok) return id;
      let query = db
        .from("curriculum_nodes")
        .select("*")
        .eq("curriculum_source_id", id.value);
      if (parentId === null) {
        query = query.is("parent_id", null);
      } else {
        const pid = parseInput(uuidSchema, parentId);
        if (!pid.ok) return pid;
        query = query.eq("parent_id", pid.value);
      }
      return listResult(await query.order("position", { ascending: true }));
    },

    async updateNode(input) {
      const parsed = parseInput(updateCurriculumNodeSchema, input);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const patch: TablesUpdate<"curriculum_nodes"> = {
        ...(v.title !== undefined && { title: v.title }),
        ...(v.position !== undefined && { position: v.position }),
        ...(v.pageStart !== undefined && { page_start: v.pageStart }),
        ...(v.pageEnd !== undefined && { page_end: v.pageEnd }),
        ...(v.metadata !== undefined && { metadata: v.metadata as Json }),
        ...(v.status !== undefined && { status: v.status }),
      };
      return rowResult(
        await db
          .from("curriculum_nodes")
          .update(patch)
          .eq("id", v.id)
          .select("*")
          .single(),
      );
    },

    async findByNaturalKey(input) {
      const sourceId = parseInput(uuidSchema, input.curriculumSourceId);
      if (!sourceId.ok) return sourceId;

      let query = db
        .from("curriculum_nodes")
        .select("*")
        .eq("curriculum_source_id", sourceId.value)
        .eq("node_type", input.nodeType)
        .eq("normalized_title", input.normalizedTitle);
      query =
        input.parentId === null
          ? query.is("parent_id", null)
          : query.eq("parent_id", input.parentId);

      const res = await query.maybeSingle();
      if (res.error) return rowResult(res);
      return ok(res.data ?? null);
    },
  };
}
