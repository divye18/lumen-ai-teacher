import type { Json } from "@/lib/db/types";
import type { Result } from "@/lib/result";

import type { Tables, TablesInsert } from "../types";
import {
  learningProfileUpsertSchema,
  uuidSchema,
  type LearningProfileUpsertInput,
} from "../schemas";
import { type DbClient, parseInput, rowResult } from "./shared";

export type LearningProfileRow = Tables<"learner_learning_profiles">;

/**
 * The derived, cross-session behavioural learning profile (adaptive teacher
 * memory). One row per user. Written by `recomputeLearningProfile`, read on the
 * Teaching Room / dashboard hot paths.
 */
export interface LearningProfileStore {
  get(userId: string): Promise<Result<LearningProfileRow>>;
  upsert(
    input: LearningProfileUpsertInput,
  ): Promise<Result<LearningProfileRow>>;
}

export function createLearningProfileStore(db: DbClient): LearningProfileStore {
  return {
    async get(userId) {
      const id = parseInput(uuidSchema, userId);
      if (!id.ok) return id;
      return rowResult(
        await db
          .from("learner_learning_profiles")
          .select("*")
          .eq("user_id", id.value)
          .maybeSingle(),
      );
    },

    async upsert(input) {
      const parsed = parseInput(learningProfileUpsertSchema, input);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const payload: TablesInsert<"learner_learning_profiles"> = {
        user_id: v.userId,
        signals: v.signals as Json,
        evidence: v.evidence as Json,
        sample_size: v.sampleSize,
        computed_at: v.computedAt,
      };
      return rowResult(
        await db
          .from("learner_learning_profiles")
          .upsert(payload, { onConflict: "user_id" })
          .select("*")
          .single(),
      );
    },
  };
}
