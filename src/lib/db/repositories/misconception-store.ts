import type { Json } from "@/lib/db/types";
import type { Result } from "@/lib/result";

import type { Tables, TablesInsert, TablesUpdate } from "../types";
import {
  recordMisconceptionSchema,
  updateMisconceptionStatusSchema,
  type RecordMisconceptionInput,
} from "../schemas";
import type { MisconceptionStatus } from "../enums";
import { type DbClient, listResult, parseInput, rowResult } from "./shared";

export type MisconceptionRow = Tables<"misconceptions">;

export interface MisconceptionStore {
  record(input: RecordMisconceptionInput): Promise<Result<MisconceptionRow>>;
  listActiveForUser(userId: string): Promise<Result<MisconceptionRow[]>>;
  listForConcept(
    userId: string,
    conceptId: string,
  ): Promise<Result<MisconceptionRow[]>>;
  updateStatus(
    id: string,
    status: MisconceptionStatus,
  ): Promise<Result<MisconceptionRow>>;
  /** Convenience: mark RESOLVED and stamp resolved_at. */
  resolve(id: string): Promise<Result<MisconceptionRow>>;
}

export function createMisconceptionStore(db: DbClient): MisconceptionStore {
  async function setStatus(
    id: string,
    status: MisconceptionStatus,
  ): Promise<Result<MisconceptionRow>> {
    const parsed = parseInput(updateMisconceptionStatusSchema, { id, status });
    if (!parsed.ok) return parsed;

    const patch: TablesUpdate<"misconceptions"> = {
      status: parsed.value.status,
      last_detected_at: new Date().toISOString(),
      resolved_at:
        parsed.value.status === "RESOLVED" ? new Date().toISOString() : null,
    };

    const res = await db
      .from("misconceptions")
      .update(patch)
      .eq("id", parsed.value.id)
      .select("*")
      .single();
    return rowResult(res);
  }

  return {
    async record(input) {
      const parsed = parseInput(recordMisconceptionSchema, input);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const now = new Date().toISOString();

      const payload: TablesInsert<"misconceptions"> = {
        user_id: v.userId,
        concept_id: v.conceptId,
        session_id: v.sessionId ?? null,
        interaction_id: v.interactionId ?? null,
        category: v.category,
        description: v.description,
        severity: v.severity,
        confidence: v.confidence,
        status: "ACTIVE",
        first_detected_at: now,
        last_detected_at: now,
        evidence: (v.evidence ?? []) as Json,
        metadata: (v.metadata ?? {}) as Json,
      };

      const res = await db
        .from("misconceptions")
        .insert(payload)
        .select("*")
        .single();
      return rowResult(res);
    },

    async listActiveForUser(userId) {
      return listResult(
        await db
          .from("misconceptions")
          .select("*")
          .eq("user_id", userId)
          .neq("status", "RESOLVED")
          .order("last_detected_at", { ascending: false }),
      );
    },

    async listForConcept(userId, conceptId) {
      return listResult(
        await db
          .from("misconceptions")
          .select("*")
          .eq("user_id", userId)
          .eq("concept_id", conceptId)
          .order("last_detected_at", { ascending: false }),
      );
    },

    updateStatus: setStatus,

    resolve(id) {
      return setStatus(id, "RESOLVED");
    },
  };
}
