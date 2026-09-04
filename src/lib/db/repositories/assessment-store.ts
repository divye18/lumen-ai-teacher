import type { Json } from "@/lib/db/types";
import { ok, type Result } from "@/lib/result";

import type { Tables, TablesInsert, TablesUpdate } from "../types";
import {
  addAssessmentQuestionSchema,
  completeAssessmentSchema,
  createAssessmentSchema,
  recordAssessmentAnswerSchema,
  type AddAssessmentQuestionInput,
  type CompleteAssessmentInput,
  type CreateAssessmentInput,
  type RecordAssessmentAnswerInput,
} from "../schemas";
import { type DbClient, listResult, parseInput, rowResult } from "./shared";

export type AssessmentRow = Tables<"assessments">;
export type AssessmentQuestionRow = Tables<"assessment_questions">;
export type AssessmentAnswerRow = Tables<"assessment_answers">;

/** Question shape safe to send to client components — omits `expected_answer`. */
export type ClientAssessmentQuestion = Omit<
  AssessmentQuestionRow,
  "expected_answer"
>;

function toClientQuestion(
  row: AssessmentQuestionRow,
): ClientAssessmentQuestion {
  const { expected_answer: _omitted, ...safe } = row;
  void _omitted;
  return safe;
}

export interface AssessmentStore {
  create(input: CreateAssessmentInput): Promise<Result<AssessmentRow>>;
  addQuestion(
    input: AddAssessmentQuestionInput,
  ): Promise<Result<AssessmentQuestionRow>>;
  /** Client-safe question list — never includes `expected_answer`. */
  listQuestionsForClient(
    assessmentId: string,
  ): Promise<Result<ClientAssessmentQuestion[]>>;
  /** Full question rows including `expected_answer`. Server/grading use only. */
  listQuestionsForGrading(
    assessmentId: string,
  ): Promise<Result<AssessmentQuestionRow[]>>;
  recordAnswer(
    input: RecordAssessmentAnswerInput,
  ): Promise<Result<AssessmentAnswerRow>>;
  /** Mark an assessment COMPLETED/ABANDONED with a final score. */
  complete(input: CompleteAssessmentInput): Promise<Result<AssessmentRow>>;
}

export function createAssessmentStore(db: DbClient): AssessmentStore {
  return {
    async create(input) {
      const parsed = parseInput(createAssessmentSchema, input);
      if (!parsed.ok) return parsed;
      const v = parsed.value;

      const payload: TablesInsert<"assessments"> = {
        user_id: v.userId,
        session_id: v.sessionId ?? null,
        title: v.title ?? null,
        topic: v.topic ?? null,
        assessment_type: v.assessmentType,
        status: v.status,
      };

      return rowResult(
        await db.from("assessments").insert(payload).select("*").single(),
      );
    },

    async addQuestion(input) {
      const parsed = parseInput(addAssessmentQuestionSchema, input);
      if (!parsed.ok) return parsed;
      const v = parsed.value;

      const payload: TablesInsert<"assessment_questions"> = {
        assessment_id: v.assessmentId,
        concept_id: v.conceptId ?? null,
        question_text: v.questionText,
        question_type: v.questionType,
        difficulty: v.difficulty,
        expected_answer: v.expectedAnswer ?? null,
        metadata: (v.metadata ?? {}) as Json,
        position: v.position,
      };

      return rowResult(
        await db
          .from("assessment_questions")
          .insert(payload)
          .select("*")
          .single(),
      );
    },

    async listQuestionsForClient(assessmentId) {
      const res = await db
        .from("assessment_questions")
        .select("*")
        .eq("assessment_id", assessmentId)
        .order("position", { ascending: true });
      const list = listResult(res);
      if (!list.ok) return list;
      return ok(list.value.map(toClientQuestion));
    },

    async listQuestionsForGrading(assessmentId) {
      return listResult(
        await db
          .from("assessment_questions")
          .select("*")
          .eq("assessment_id", assessmentId)
          .order("position", { ascending: true }),
      );
    },

    async recordAnswer(input) {
      const parsed = parseInput(recordAssessmentAnswerSchema, input);
      if (!parsed.ok) return parsed;
      const v = parsed.value;

      const payload: TablesInsert<"assessment_answers"> = {
        question_id: v.questionId,
        user_id: v.userId,
        answer_text: v.answerText,
        is_correct: v.isCorrect ?? null,
        score: v.score ?? null,
        evaluation: (v.evaluation ?? {}) as Json,
      };

      return rowResult(
        await db
          .from("assessment_answers")
          .insert(payload)
          .select("*")
          .single(),
      );
    },

    async complete(input) {
      const parsed = parseInput(completeAssessmentSchema, input);
      if (!parsed.ok) return parsed;
      const v = parsed.value;

      const payload: TablesUpdate<"assessments"> = {
        status: v.status,
        score: v.score ?? null,
        max_score: v.maxScore ?? null,
        completed_at: v.completedAt ?? new Date().toISOString(),
      };

      return rowResult(
        await db
          .from("assessments")
          .update(payload)
          .eq("id", v.id)
          .select("*")
          .single(),
      );
    },
  };
}
