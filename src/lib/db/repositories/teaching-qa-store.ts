import type { Json } from "@/lib/db/types";
import { ok, type Result } from "@/lib/result";

import type { Tables, TablesInsert } from "../types";
import {
  createTeachingQuestionSchema,
  recordTeachingAnswerSchema,
  uuidSchema,
  type CreateTeachingQuestionInput,
  type RecordTeachingAnswerInput,
} from "../schemas";
import { listResult, parseInput, rowResult, type DbClient } from "./shared";

export type TeachingQuestionRow = Tables<"teaching_questions">;
export type TeachingAnswerRow = Tables<"teaching_answers">;

/** Question fields safe for client components — omits `expected_reasoning`. */
export type ClientTeachingQuestion = Omit<
  TeachingQuestionRow,
  "expected_reasoning"
>;

function toClientQuestion(row: TeachingQuestionRow): ClientTeachingQuestion {
  const { expected_reasoning: _omit, ...safe } = row;
  void _omit;
  return safe;
}

export interface TeachingQaStore {
  createQuestion(
    input: CreateTeachingQuestionInput,
  ): Promise<Result<TeachingQuestionRow>>;
  /** Full row incl. `expected_reasoning` — server/grading only. */
  getQuestion(questionId: string): Promise<Result<TeachingQuestionRow>>;
  listQuestionsForSession(
    sessionId: string,
  ): Promise<Result<ClientTeachingQuestion[]>>;
  recordAnswer(
    input: RecordTeachingAnswerInput,
  ): Promise<Result<TeachingAnswerRow>>;
  listAnswersForSession(
    sessionId: string,
  ): Promise<Result<TeachingAnswerRow[]>>;
}

export function createTeachingQaStore(db: DbClient): TeachingQaStore {
  return {
    async createQuestion(input) {
      const parsed = parseInput(createTeachingQuestionSchema, input);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const payload: TablesInsert<"teaching_questions"> = {
        session_id: v.sessionId,
        lesson_id: v.lessonId ?? null,
        user_id: v.userId,
        concept_key: v.conceptKey,
        concept_id: v.conceptId ?? null,
        question_kind: v.questionKind,
        difficulty: v.difficulty,
        prompt: v.prompt,
        expected_reasoning: v.expectedReasoning ?? null,
        source_grounded: v.sourceGrounded,
        citations: v.citations as Json,
        metadata: (v.metadata ?? {}) as Json,
      };
      return rowResult(
        await db
          .from("teaching_questions")
          .insert(payload)
          .select("*")
          .single(),
      );
    },

    async getQuestion(questionId) {
      const id = parseInput(uuidSchema, questionId);
      if (!id.ok) return id;
      return rowResult(
        await db
          .from("teaching_questions")
          .select("*")
          .eq("id", id.value)
          .maybeSingle(),
      );
    },

    async listQuestionsForSession(sessionId) {
      const id = parseInput(uuidSchema, sessionId);
      if (!id.ok) return id;
      const res = await db
        .from("teaching_questions")
        .select("*")
        .eq("session_id", id.value)
        .order("created_at", { ascending: true });
      const list = listResult(res);
      if (!list.ok) return list;
      return ok(list.value.map(toClientQuestion));
    },

    async recordAnswer(input) {
      const parsed = parseInput(recordTeachingAnswerSchema, input);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const payload: TablesInsert<"teaching_answers"> = {
        question_id: v.questionId,
        session_id: v.sessionId,
        user_id: v.userId,
        response_text: v.responseText,
        classification: v.classification ?? null,
        correctness_score: v.correctnessScore ?? null,
        evaluation: v.evaluation as Json,
        response_time_ms: v.responseTimeMs ?? null,
      };
      return rowResult(
        await db.from("teaching_answers").insert(payload).select("*").single(),
      );
    },

    async listAnswersForSession(sessionId) {
      const id = parseInput(uuidSchema, sessionId);
      if (!id.ok) return id;
      return listResult(
        await db
          .from("teaching_answers")
          .select("*")
          .eq("session_id", id.value)
          .order("created_at", { ascending: true }),
      );
    },
  };
}
