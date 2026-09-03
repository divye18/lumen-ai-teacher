import type { Json } from "@/lib/db/types";
import { ok, type Result } from "@/lib/result";

import type { Tables, TablesInsert, TablesUpdate } from "../types";
import {
  createConceptRelationshipSchema,
  createConceptSchema,
  uuidSchema,
  type CreateConceptInput,
  type CreateConceptRelationshipInput,
} from "../schemas";
import { type DbClient, listResult, parseInput, rowResult } from "./shared";

export type ConceptRow = Tables<"concepts">;
export type ConceptRelationshipRow = Tables<"concept_relationships">;

export interface ConceptStore {
  create(input: CreateConceptInput): Promise<Result<ConceptRow>>;
  get(conceptId: string): Promise<Result<ConceptRow>>;
  listForUser(userId: string): Promise<Result<ConceptRow[]>>;
  listForDocument(documentId: string): Promise<Result<ConceptRow[]>>;
  /** Reuse an existing concept for this user by its stable normalized key. */
  findByNormalizedKey(
    userId: string,
    normalizedKey: string,
  ): Promise<Result<ConceptRow | null>>;
  /** Set the Phase-4 knowledge-graph fields on a concept. */
  updateGraphFields(
    conceptId: string,
    fields: {
      normalizedKey?: string;
      importanceScore?: number;
      sourcePages?: number[];
      graphDegree?: number;
    },
  ): Promise<Result<ConceptRow>>;
  addRelationship(
    input: CreateConceptRelationshipInput,
  ): Promise<Result<ConceptRelationshipRow>>;
  listRelationships(
    conceptId: string,
  ): Promise<Result<ConceptRelationshipRow[]>>;
  /** Edges touching any of the given concept ids (graph read path). */
  listRelationshipsForConcepts(
    conceptIds: string[],
  ): Promise<Result<ConceptRelationshipRow[]>>;
}

export function createConceptStore(db: DbClient): ConceptStore {
  return {
    async create(input) {
      const parsed = parseInput(createConceptSchema, input);
      if (!parsed.ok) return parsed;
      const v = parsed.value;

      const payload: TablesInsert<"concepts"> = {
        user_id: v.userId,
        document_id: v.documentId ?? null,
        name: v.name,
        description: v.description ?? null,
        subject: v.subject ?? null,
        metadata: (v.metadata ?? {}) as Json,
      };

      const res = await db
        .from("concepts")
        .insert(payload)
        .select("*")
        .single();
      return rowResult(res);
    },

    async get(conceptId) {
      const res = await db
        .from("concepts")
        .select("*")
        .eq("id", conceptId)
        .maybeSingle();
      return rowResult(res);
    },

    async listForUser(userId) {
      return listResult(
        await db.from("concepts").select("*").eq("user_id", userId),
      );
    },

    async listForDocument(documentId) {
      return listResult(
        await db.from("concepts").select("*").eq("document_id", documentId),
      );
    },

    async findByNormalizedKey(userId, normalizedKey) {
      const uid = parseInput(uuidSchema, userId);
      if (!uid.ok) return uid;
      const key = String(normalizedKey).slice(0, 121);
      const res = await db
        .from("concepts")
        .select("*")
        .eq("user_id", uid.value)
        .eq("normalized_key", key)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (res.error) return rowResult(res);
      return ok(res.data ?? null);
    },

    async updateGraphFields(conceptId, fields) {
      const id = parseInput(uuidSchema, conceptId);
      if (!id.ok) return id;
      const payload: TablesUpdate<"concepts"> = {};
      if (fields.normalizedKey !== undefined)
        payload.normalized_key = fields.normalizedKey.slice(0, 121);
      if (fields.importanceScore !== undefined)
        payload.importance_score = Math.min(
          1,
          Math.max(0, fields.importanceScore),
        );
      if (fields.sourcePages !== undefined)
        payload.source_pages = fields.sourcePages as Json;
      if (fields.graphDegree !== undefined)
        payload.graph_degree = Math.max(0, Math.round(fields.graphDegree));
      const res = await db
        .from("concepts")
        .update(payload)
        .eq("id", id.value)
        .select("*")
        .single();
      return rowResult(res);
    },

    async addRelationship(input) {
      const parsed = parseInput(createConceptRelationshipSchema, input);
      if (!parsed.ok) return parsed;
      const v = parsed.value;

      const payload: TablesInsert<"concept_relationships"> = {
        source_concept_id: v.sourceConceptId,
        target_concept_id: v.targetConceptId,
        relationship_type: v.relationshipType,
        strength: v.strength,
        metadata: (v.metadata ?? {}) as Json,
      };

      const res = await db
        .from("concept_relationships")
        .upsert(payload, {
          onConflict: "source_concept_id,target_concept_id,relationship_type",
        })
        .select("*")
        .single();
      return rowResult(res);
    },

    async listRelationships(conceptId) {
      // conceptId is interpolated into a PostgREST filter string, so it must be
      // a strict UUID — never raw user input.
      const parsed = parseInput(uuidSchema, conceptId);
      if (!parsed.ok) return parsed;
      const id = parsed.value;
      return listResult(
        await db
          .from("concept_relationships")
          .select("*")
          .or(`source_concept_id.eq.${id},target_concept_id.eq.${id}`),
      );
    },

    async listRelationshipsForConcepts(conceptIds) {
      const ids: string[] = [];
      for (const raw of conceptIds) {
        const parsed = parseInput(uuidSchema, raw);
        if (parsed.ok) ids.push(parsed.value);
      }
      if (ids.length === 0) return ok([]);
      const list = ids.join(",");
      return listResult(
        await db
          .from("concept_relationships")
          .select("*")
          .or(`source_concept_id.in.(${list}),target_concept_id.in.(${list})`),
      );
    },
  };
}
