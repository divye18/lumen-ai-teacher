import type { Json } from "@/lib/db/types";
import { LumenError } from "@/lib/errors";
import { err, type Result } from "@/lib/result";

import type { Tables, TablesInsert, TablesUpdate } from "../types";
import {
  recordMisconceptionSchema,
  strengthenMisconceptionSchema,
  updateMisconceptionStatusSchema,
  type RecordMisconceptionInput,
  type StrengthenMisconceptionInput,
} from "../schemas";
import type { MisconceptionStatus } from "../enums";
import {
  fromPostgrestError,
  listResult,
  parseInput,
  rowResult,
  type DbClient,
} from "./shared";

export type MisconceptionRow = Tables<"misconceptions">;

export interface MisconceptionStore {
  record(input: RecordMisconceptionInput): Promise<Result<MisconceptionRow>>;
  listActiveForUser(userId: string): Promise<Result<MisconceptionRow[]>>;
  listForConcept(
    userId: string,
    conceptId: string,
  ): Promise<Result<MisconceptionRow[]>>;
  /**
   * `metadataPatch`, when given, is merged into the existing `metadata`
   * jsonb (never replaces it) — used by the misconception resolution loop to
   * stamp `clearedChecks`/`lastVerifiedQuestionId` alongside the status.
   */
  updateStatus(
    id: string,
    status: MisconceptionStatus,
    metadataPatch?: Record<string, unknown>,
  ): Promise<Result<MisconceptionRow>>;
  /** Convenience: mark RESOLVED and stamp resolved_at. */
  resolve(
    id: string,
    metadataPatch?: Record<string, unknown>,
  ): Promise<Result<MisconceptionRow>>;
  /** Reinforce an existing misconception with fresh evidence. */
  strengthen(
    input: StrengthenMisconceptionInput,
  ): Promise<Result<MisconceptionRow>>;
}

export function createMisconceptionStore(db: DbClient): MisconceptionStore {
  async function setStatus(
    id: string,
    status: MisconceptionStatus,
    metadataPatch?: Record<string, unknown>,
  ): Promise<Result<MisconceptionRow>> {
    const parsed = parseInput(updateMisconceptionStatusSchema, {
      id,
      status,
      metadataPatch,
    });
    if (!parsed.ok) return parsed;

    let metadata: Json | undefined;
    if (parsed.value.metadataPatch) {
      const existing = await db
        .from("misconceptions")
        .select("metadata")
        .eq("id", parsed.value.id)
        .maybeSingle();
      if (existing.error) return err(fromPostgrestError(existing.error));
      if (!existing.data) {
        return err(
          new LumenError("NOT_FOUND", `Misconception ${id} not found.`, {
            recoverable: true,
          }),
        );
      }
      const currentMeta =
        (existing.data.metadata as Record<string, unknown> | null) ?? {};
      metadata = { ...currentMeta, ...parsed.value.metadataPatch } as Json;
    }

    const patch: TablesUpdate<"misconceptions"> = {
      status: parsed.value.status,
      last_detected_at: new Date().toISOString(),
      resolved_at:
        parsed.value.status === "RESOLVED" ? new Date().toISOString() : null,
      ...(metadata !== undefined ? { metadata } : {}),
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

    resolve(id, metadataPatch) {
      return setStatus(id, "RESOLVED", metadataPatch);
    },

    async strengthen(input) {
      const parsed = parseInput(strengthenMisconceptionSchema, input);
      if (!parsed.ok) return parsed;
      const v = parsed.value;

      const existing = await db
        .from("misconceptions")
        .select("*")
        .eq("id", v.id)
        .maybeSingle();
      if (existing.error) return err(fromPostgrestError(existing.error));
      if (!existing.data) {
        return err(
          new LumenError("NOT_FOUND", `Misconception ${v.id} not found.`, {
            recoverable: true,
          }),
        );
      }

      const meta =
        (existing.data.metadata as Record<string, unknown> | null) ?? {};
      const evidence = Array.isArray(existing.data.evidence)
        ? [...(existing.data.evidence as unknown[])]
        : [];
      if (v.evidenceEntry) evidence.push(v.evidenceEntry);

      const wasResolved = existing.data.status === "RESOLVED";
      const patch: TablesUpdate<"misconceptions"> = {
        confidence: v.confidence,
        last_detected_at: new Date().toISOString(),
        status: wasResolved ? "ACTIVE" : existing.data.status,
        // A relapse (spaced-review or otherwise) reactivates the row — its
        // resolved_at must no longer claim it's currently resolved.
        ...(wasResolved ? { resolved_at: null } : {}),
        ...(v.severity ? { severity: v.severity } : {}),
        metadata: { ...meta, detections: v.detections } as Json,
        evidence: evidence.slice(0, 50) as Json,
      };

      return rowResult(
        await db
          .from("misconceptions")
          .update(patch)
          .eq("id", v.id)
          .select("*")
          .single(),
      );
    },
  };
}
