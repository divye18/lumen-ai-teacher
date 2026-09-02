import type { Result } from "@/lib/result";

import type { Tables, TablesInsert } from "../types";
import {
  learnerProfileUpsertSchema,
  type LearnerProfileUpsertInput,
} from "../schemas";
import { type DbClient, parseInput, rowResult } from "./shared";

export type LearnerProfileRow = Tables<"learner_profiles">;

export interface LearnerProfileStore {
  /** The learner's preference row, or NOT_FOUND if none exists yet. */
  get(userId: string): Promise<Result<LearnerProfileRow>>;
  /** Create or update (by user_id) the learner's preferences. */
  upsert(input: LearnerProfileUpsertInput): Promise<Result<LearnerProfileRow>>;
}

export function createLearnerProfileStore(db: DbClient): LearnerProfileStore {
  return {
    async get(userId) {
      const res = await db
        .from("learner_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      return rowResult(res);
    },

    async upsert(input) {
      const parsed = parseInput(learnerProfileUpsertSchema, input);
      if (!parsed.ok) return parsed;
      const v = parsed.value;

      const payload: TablesInsert<"learner_profiles"> = {
        user_id: v.userId,
        ...(v.currentLevel !== undefined && { current_level: v.currentLevel }),
        ...(v.learningGoal !== undefined && { learning_goal: v.learningGoal }),
        ...(v.availableTimeMinutes !== undefined && {
          available_time_minutes: v.availableTimeMinutes,
        }),
        ...(v.preferredLanguage !== undefined && {
          preferred_language: v.preferredLanguage,
        }),
        ...(v.preferredLearningStrategy !== undefined && {
          preferred_learning_strategy: v.preferredLearningStrategy,
        }),
      };

      const res = await db
        .from("learner_profiles")
        .upsert(payload, { onConflict: "user_id" })
        .select("*")
        .single();
      return rowResult(res);
    },
  };
}
