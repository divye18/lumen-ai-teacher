import type { LLMProvider } from "@/lib/ai/types";
import { generateStructured } from "@/lib/ai/structured";
import {
  richAnswerEvaluationSchema,
  type RichAnswerEvaluation,
} from "@/lib/teaching/contracts";
import { ok, type Result } from "@/lib/result";

import { buildEvaluationPrompt } from "./prompts";

/**
 * ANSWER EVALUATION.
 *
 * Structured, rubric-aware, never string matching. Distinguishes CORRECT /
 * PARTIALLY_CORRECT / INCORRECT / UNCERTAIN and surfaces missing components +
 * misconception candidates. When the LLM is unavailable the fallback is
 * deliberately conservative (UNCERTAIN / low confidence) — it never fakes a
 * correctness judgement.
 */

export interface EvaluateAnswerInput {
  llm: LLMProvider | null;
  question: {
    prompt: string;
    expectedReasoning: string | null;
    kind: string;
    difficulty: number;
  };
  answerText: string;
  concept: { key: string; title: string };
  language: string;
  sourceContext?: string | null;
  temperature?: number;
}

export interface AnswerEvaluationResult extends RichAnswerEvaluation {
  source: "ai" | "fallback";
}

const MIN_MEANINGFUL_ANSWER_CHARS = 12;

function fallbackEvaluation(answerText: string): RichAnswerEvaluation {
  const trimmed = answerText.trim();
  if (trimmed.length < MIN_MEANINGFUL_ANSWER_CHARS) {
    return {
      classification: "INCORRECT",
      correctnessScore: 0.1,
      confidence: 0.3,
      reasoningQuality: "none",
      missingConcepts: [],
      misconceptionCandidates: [],
      feedback:
        "That answer is too short to show your understanding. Try to explain your thinking in a couple of sentences.",
      rationale:
        "Answer below the meaningful-length threshold; automatic grader unavailable.",
    };
  }
  return {
    classification: "UNCERTAIN",
    correctnessScore: 0.35,
    confidence: 0.2,
    reasoningQuality: "partial",
    missingConcepts: [],
    misconceptionCandidates: [],
    feedback:
      "Thanks — your answer has been recorded. Detailed evaluation is temporarily unavailable, so we'll keep checking your understanding as we go.",
    rationale:
      "LLM evaluator unavailable; recorded answer without a correctness judgement.",
  };
}

export async function evaluateAnswer(
  input: EvaluateAnswerInput,
): Promise<Result<AnswerEvaluationResult>> {
  if (!input.llm) {
    return ok({ ...fallbackEvaluation(input.answerText), source: "fallback" });
  }

  const { system, user } = buildEvaluationPrompt({
    conceptTitle: input.concept.title,
    questionPrompt: input.question.prompt,
    expectedReasoning: input.question.expectedReasoning,
    answerText: input.answerText,
    language: input.language,
    sourceContext: input.sourceContext ?? null,
  });

  const generated = await generateStructured({
    provider: input.llm,
    schema: richAnswerEvaluationSchema,
    system,
    user,
    temperature: input.temperature ?? 0.1,
    maxOutputTokens: 700,
  });

  if (!generated.ok) {
    return ok({ ...fallbackEvaluation(input.answerText), source: "fallback" });
  }

  return ok({ ...generated.value.value, source: "ai" });
}
