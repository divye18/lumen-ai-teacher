import type { Json } from "@/lib/db/types";
import type { Result } from "@/lib/result";

import type { Tables, TablesInsert } from "../types";
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
  addRelationship(
    input: CreateConceptRelationshipInput,
  ): Promise<Result<ConceptRelationshipRow>>;
  listRelationships(
    conceptId: string,
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
  };
}
