import type { Json } from "@/lib/db/types";
import type { Result } from "@/lib/result";

import type { Tables, TablesInsert } from "../types";
import {
  recordInteractionSchema,
  type RecordInteractionInput,
} from "../schemas";
import { type DbClient, listResult, parseInput, rowResult } from "./shared";

export type InteractionRow = Tables<"interactions">;

export interface InteractionStore {
  /** Append one interaction to the evidence log. */
  record(input: RecordInteractionInput): Promise<Result<InteractionRow>>;
  /** A session's timeline, oldest first. */
  listForSession(
    sessionId: string,
    options?: { limit?: number },
  ): Promise<Result<InteractionRow[]>>;
  /** A user's most recent interactions across sessions, newest first. */
  listRecentForUser(
    userId: string,
    limit?: number,
  ): Promise<Result<InteractionRow[]>>;
}

export function createInteractionStore(db: DbClient): InteractionStore {
  return {
    async record(input) {
      const parsed = parseInput(recordInteractionSchema, input);
      if (!parsed.ok) return parsed;
      const v = parsed.value;

      const payload: TablesInsert<"interactions"> = {
        session_id: v.sessionId,
        user_id: v.userId,
        concept_id: v.conceptId ?? null,
        role: v.role,
        interaction_type: v.interactionType,
        content: v.content,
        metadata: (v.metadata ?? {}) as Json,
      };

      const res = await db
        .from("interactions")
        .insert(payload)
        .select("*")
        .single();
      return rowResult(res);
    },

    async listForSession(sessionId, options) {
      let query = db
        .from("interactions")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });
      if (options?.limit) query = query.limit(options.limit);
      return listResult(await query);
    },

    async listRecentForUser(userId, limit = 20) {
      const res = await db
        .from("interactions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);
      return listResult(res);
    },
  };
}
