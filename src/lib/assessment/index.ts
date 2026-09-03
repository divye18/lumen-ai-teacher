import {
  answerEvaluationSchema,
  type AnswerEvaluation,
  type AssessmentQuestion,
  type StudentAnswer,
} from "@/types/assessment";
import { ValidationError } from "@/lib/errors";
import { err, ok, type Result } from "@/lib/result";

/**
 * Assessment boundary.
 *
 * An `AnswerEvaluator` may use an LLM to grade free-text answers, but its
 * output MUST pass {@link answerEvaluationSchema}. Grading logic and
 * misconception inference are implemented in a later phase.
 */
export interface AnswerEvaluator {
  readonly id: string;
  evaluate(input: {
    question: AssessmentQuestion;
    answer: StudentAnswer;
  }): Promise<Result<AnswerEvaluation>>;
}

export function parseAnswerEvaluation(
  input: unknown,
): Result<AnswerEvaluation, ValidationError> {
  const parsed = answerEvaluationSchema.safeParse(input);
  if (!parsed.success) {
    return err(
      new ValidationError(
        "Answer evaluation failed schema validation.",
        parsed.error.issues,
      ),
    );
  }
  return ok(parsed.data);
}

export {
  generateQuestion,
  questionKindForMastery,
  type GenerateQuestionInput,
  type GeneratedQuestionResult,
} from "./question-generator";
export {
  evaluateAnswer,
  type EvaluateAnswerInput,
  type AnswerEvaluationResult,
} from "./evaluator";
export { buildQuestionPrompt, buildEvaluationPrompt } from "./prompts";
