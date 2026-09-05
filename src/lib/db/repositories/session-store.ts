import type { Json } from "@/lib/db/types";
import type { Result } from "@/lib/result";

import type { Tables, TablesInsert, TablesUpdate } from "../types";
import {
  createSessionSchema,
  updateSessionSchema,
  updateSessionTeachingSchema,
  type CreateSessionInput,
  type UpdateSessionInput,
  type UpdateSessionTeachingInput,
} from "../schemas";
import { type DbClient, listResult, parseInput, rowResult } from "./shared";

export type LearningSessionRow = Tables<"learning_sessions">;

export interface SessionStore {
  create(input: CreateSessionInput): Promise<Result<LearningSessionRow>>;
  get(sessionId: string): Promise<Result<LearningSessionRow>>;
  listForUser(
    userId: string,
    options?: { limit?: number },
  ): Promise<Result<LearningSessionRow[]>>;
  update(input: UpdateSessionInput): Promise<Result<LearningSessionRow>>;
  /** Phase 2: update the teaching-loop columns (lesson, cursor, action, …). */
  updateTeaching(
    input: UpdateSessionTeachingInput,
  ): Promise<Result<LearningSessionRow>>;
}

export function createSessionStore(db: DbClient): SessionStore {
  return {
    async create(input) {
      const parsed = parseInput(createSessionSchema, input);
      if (!parsed.ok) return parsed;
      const v = parsed.value;

      const payload: TablesInsert<"learning_sessions"> = {
        user_id: v.userId,
        title: v.title ?? null,
        topic: v.topic ?? null,
        language: v.language,
        goal: v.goal ?? null,
        status: v.status,
        current_concept_id: v.currentConceptId ?? null,
      };

      const res = await db
        .from("learning_sessions")
        .insert(payload)
        .select("*")
        .single();
      return rowResult(res);
    },

    async get(sessionId) {
      const res = await db
        .from("learning_sessions")
        .select("*")
        .eq("id", sessionId)
        .maybeSingle();
      return rowResult(res);
    },

    async listForUser(userId, options) {
      let query = db
        .from("learning_sessions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (options?.limit) query = query.limit(options.limit);
      return listResult(await query);
    },

    async update(input) {
      const parsed = parseInput(updateSessionSchema, input);
      if (!parsed.ok) return parsed;
      const { id, ...rest } = parsed.value;

      const patch: TablesUpdate<"learning_sessions"> = {
        ...(rest.title !== undefined && { title: rest.title }),
        ...(rest.topic !== undefined && { topic: rest.topic }),
        ...(rest.goal !== undefined && { goal: rest.goal }),
        ...(rest.status !== undefined && { status: rest.status }),
        ...(rest.currentConceptId !== undefined && {
          current_concept_id: rest.currentConceptId,
        }),
        ...(rest.startedAt !== undefined && { started_at: rest.startedAt }),
        ...(rest.endedAt !== undefined && { ended_at: rest.endedAt }),
      };

      const res = await db
        .from("learning_sessions")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      return rowResult(res);
    },

    async updateTeaching(input) {
      const parsed = parseInput(updateSessionTeachingSchema, input);
      if (!parsed.ok) return parsed;
      const { id, ...rest } = parsed.value;

      const patch: TablesUpdate<"learning_sessions"> = {
        ...(rest.lessonId !== undefined && { lesson_id: rest.lessonId }),
        ...(rest.status !== undefined && { status: rest.status }),
        ...(rest.currentConceptId !== undefined && {
          current_concept_id: rest.currentConceptId,
        }),
        ...(rest.currentAction !== undefined && {
          current_action: rest.currentAction,
        }),
        ...(rest.planCursor !== undefined && { plan_cursor: rest.planCursor }),
        ...(rest.timeBudgetMinutes !== undefined && {
          time_budget_minutes: rest.timeBudgetMinutes,
        }),
        ...(rest.masterySnapshot !== undefined && {
          mastery_snapshot: rest.masterySnapshot as Json,
        }),
        ...(rest.startedAt !== undefined && { started_at: rest.startedAt }),
        ...(rest.endedAt !== undefined && { ended_at: rest.endedAt }),
      };

      let query = db.from("learning_sessions").update(patch).eq("id", id);
      if (rest.expectedCurrentAction !== undefined) {
        query =
          rest.expectedCurrentAction === null
            ? query.is("current_action", null)
            : query.eq("current_action", rest.expectedCurrentAction);
      }

      const res = await query.select("*").single();
      return rowResult(res);
    },
  };
}
