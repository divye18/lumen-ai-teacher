import type { Json } from "@/lib/db/types";
import { err, ok, type Result } from "@/lib/result";

import type { Tables, TablesInsert, TablesUpdate } from "../types";
import type { LessonConceptStatus } from "../enums";
import {
  addLessonConceptSchema,
  createLessonSchema,
  updateLessonConceptStatusSchema,
  updateLessonSchema,
  uuidSchema,
  type AddLessonConceptInput,
  type CreateLessonInput,
  type UpdateLessonInput,
} from "../schemas";
import {
  fromPostgrestError,
  listResult,
  parseInput,
  rowResult,
  type DbClient,
} from "./shared";

export type LessonRow = Tables<"lessons">;
export type LessonConceptRow = Tables<"lesson_concepts">;

export interface LessonStore {
  create(input: CreateLessonInput): Promise<Result<LessonRow>>;
  get(lessonId: string): Promise<Result<LessonRow>>;
  listForUser(userId: string): Promise<Result<LessonRow[]>>;
  update(input: UpdateLessonInput): Promise<Result<LessonRow>>;
  addConcepts(
    inputs: AddLessonConceptInput[],
  ): Promise<Result<LessonConceptRow[]>>;
  listConcepts(lessonId: string): Promise<Result<LessonConceptRow[]>>;
  setConceptStatus(
    id: string,
    status: LessonConceptStatus,
  ): Promise<Result<LessonConceptRow>>;
}

export function createLessonStore(db: DbClient): LessonStore {
  return {
    async create(input) {
      const parsed = parseInput(createLessonSchema, input);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const payload: TablesInsert<"lessons"> = {
        user_id: v.userId,
        document_id: v.documentId ?? null,
        title: v.title,
        topic: v.topic,
        objective: v.objective,
        language: v.language,
        teaching_style: v.teachingStyle ?? null,
        estimated_minutes: v.estimatedMinutes ?? null,
        source_grounded: v.sourceGrounded,
        plan_source: v.planSource,
        status: v.status,
        plan: v.plan as Json,
        citations: v.citations as Json,
      };
      return rowResult(
        await db.from("lessons").insert(payload).select("*").single(),
      );
    },

    async get(lessonId) {
      const id = parseInput(uuidSchema, lessonId);
      if (!id.ok) return id;
      return rowResult(
        await db.from("lessons").select("*").eq("id", id.value).maybeSingle(),
      );
    },

    async listForUser(userId) {
      const id = parseInput(uuidSchema, userId);
      if (!id.ok) return id;
      return listResult(
        await db
          .from("lessons")
          .select("*")
          .eq("user_id", id.value)
          .order("created_at", { ascending: false }),
      );
    },

    async update(input) {
      const parsed = parseInput(updateLessonSchema, input);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const patch: TablesUpdate<"lessons"> = {
        ...(v.status !== undefined && { status: v.status }),
        ...(v.plan !== undefined && { plan: v.plan as Json }),
        ...(v.citations !== undefined && { citations: v.citations as Json }),
      };
      return rowResult(
        await db
          .from("lessons")
          .update(patch)
          .eq("id", v.id)
          .select("*")
          .single(),
      );
    },

    async addConcepts(inputs) {
      if (inputs.length === 0) return ok([]);
      const rows: TablesInsert<"lesson_concepts">[] = [];
      for (const input of inputs) {
        const parsed = parseInput(addLessonConceptSchema, input);
        if (!parsed.ok) return parsed;
        const v = parsed.value;
        rows.push({
          lesson_id: v.lessonId,
          concept_id: v.conceptId ?? null,
          concept_key: v.conceptKey,
          title: v.title,
          summary: v.summary,
          position: v.position,
          difficulty: v.difficulty,
          importance: v.importance,
          is_prerequisite: v.isPrerequisite,
          status: v.status,
        });
      }
      const res = await db.from("lesson_concepts").insert(rows).select("*");
      if (res.error) return err(fromPostgrestError(res.error));
      return ok(res.data ?? []);
    },

    async listConcepts(lessonId) {
      const id = parseInput(uuidSchema, lessonId);
      if (!id.ok) return id;
      return listResult(
        await db
          .from("lesson_concepts")
          .select("*")
          .eq("lesson_id", id.value)
          .order("position", { ascending: true }),
      );
    },

    async setConceptStatus(conceptRowId, status) {
      const parsed = parseInput(updateLessonConceptStatusSchema, {
        id: conceptRowId,
        status,
      });
      if (!parsed.ok) return parsed;
      return rowResult(
        await db
          .from("lesson_concepts")
          .update({ status: parsed.value.status })
          .eq("id", parsed.value.id)
          .select("*")
          .single(),
      );
    },
  };
}
