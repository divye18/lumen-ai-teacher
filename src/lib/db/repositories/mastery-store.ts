import type { Result } from "@/lib/result";

import type { Tables, TablesInsert } from "../types";
import {
  conceptMasteryUpsertSchema,
  type ConceptMasteryUpsertInput,
} from "../schemas";
import { type DbClient, listResult, parseInput, rowResult } from "./shared";

export type ConceptMasteryRow = Tables<"concept_mastery">;

export interface MasteryStore {
  get(userId: string, conceptId: string): Promise<Result<ConceptMasteryRow>>;
  listForUser(userId: string): Promise<Result<ConceptMasteryRow[]>>;
  /**
   * Create or update the single (user, concept) mastery row. Only the fields
   * present in `input` are written; the rest keep their stored values (or
   * defaults on first insert).
   */
  upsert(input: ConceptMasteryUpsertInput): Promise<Result<ConceptMasteryRow>>;
}

export function createMasteryStore(db: DbClient): MasteryStore {
  return {
    async get(userId, conceptId) {
      const res = await db
        .from("concept_mastery")
        .select("*")
        .eq("user_id", userId)
        .eq("concept_id", conceptId)
        .maybeSingle();
      return rowResult(res);
    },

    async listForUser(userId) {
      const res = await db
        .from("concept_mastery")
        .select("*")
        .eq("user_id", userId);
      return listResult(res);
    },

    async upsert(input) {
      const parsed = parseInput(conceptMasteryUpsertSchema, input);
      if (!parsed.ok) return parsed;
      const v = parsed.value;

      const payload: TablesInsert<"concept_mastery"> = {
        user_id: v.userId,
        concept_id: v.conceptId,
        ...(v.masteryScore !== undefined && { mastery_score: v.masteryScore }),
        ...(v.confidenceScore !== undefined && {
          confidence_score: v.confidenceScore,
        }),
        ...(v.attemptCount !== undefined && { attempt_count: v.attemptCount }),
        ...(v.correctCount !== undefined && { correct_count: v.correctCount }),
        ...(v.incorrectCount !== undefined && {
          incorrect_count: v.incorrectCount,
        }),
        ...(v.misconceptionCount !== undefined && {
          misconception_count: v.misconceptionCount,
        }),
        ...(v.lastAttemptAt !== undefined && {
          last_attempt_at: v.lastAttemptAt,
        }),
        ...(v.lastCorrectAt !== undefined && {
          last_correct_at: v.lastCorrectAt,
        }),
        ...(v.preferredStrategy !== undefined && {
          preferred_strategy: v.preferredStrategy,
        }),
        ...(v.status !== undefined && { status: v.status }),
        ...(v.evidenceSummary !== undefined && {
          evidence_summary: v.evidenceSummary,
        }),
      };

      const res = await db
        .from("concept_mastery")
        .upsert(payload, { onConflict: "user_id,concept_id" })
        .select("*")
        .single();
      return rowResult(res);
    },
  };
}
