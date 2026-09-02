import type { Result } from "@/lib/result";

import type { Tables, TablesInsert, TablesUpdate } from "../types";
import {
  createSessionSchema,
  updateSessionSchema,
  type CreateSessionInput,
  type UpdateSessionInput,
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
  };
}
