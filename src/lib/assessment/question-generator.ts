import type { LLMProvider } from "@/lib/ai/types";
import { generateStructured } from "@/lib/ai/structured";
import type { QuestionKind } from "@/lib/db/enums";
import {
  generatedQuestionSchema,
  type GeneratedQuestion,
} from "@/lib/teaching/contracts";
import { clampInt } from "@/lib/teaching/keys";
import { ok, type Result } from "@/lib/result";

import { buildQuestionPrompt } from "./prompts";

/**
 * QUESTION GENERATION.
 *
 * Questions are generated from live learner state: low mastery → conceptual,
 * developing → application, high → scenario / problem-solving. Free-form
 * answers only (never multiple choice). Grounded in source material when a
 * document is being taught.
 */

export interface GenerateQuestionInput {
  llm: LLMProvider | null;
  concept: { key: string; title: string; summary: string; difficulty: number };
  learnerMasteryPoints: number;
  /** Force a kind; otherwise derived from mastery. */
  targetKind?: QuestionKind;
  language: string;
  sourceContext?: string | null;
  temperature?: number;
}

export interface GeneratedQuestionResult extends GeneratedQuestion {
  source: "ai" | "fallback";
}

export function questionKindForMastery(points: number): QuestionKind {
  if (points >= 86) return "PROBLEM_SOLVING";
  if (points >= 71) return "SCENARIO";
  if (points >= 41) return "APPLICATION";
  return "CONCEPTUAL";
}

function fallbackQuestion(
  concept: GenerateQuestionInput["concept"],
  kind: QuestionKind,
): GeneratedQuestion {
  const t = concept.title;
  const byKind: Record<QuestionKind, GeneratedQuestion> = {
    CONCEPTUAL: {
      kind: "CONCEPTUAL",
      difficulty: clampInt(concept.difficulty, 1, 5),
      prompt: `In your own words, explain what ${t} is and why it matters.`,
      expectedReasoning: `A correct answer defines ${t} accurately and states its purpose or significance.`,
      groundedInSource: false,
    },
    APPLICATION: {
      kind: "APPLICATION",
      difficulty: clampInt(concept.difficulty, 1, 5),
      prompt: `Describe a concrete situation where ${t} applies, and walk through how it works in that case.`,
      expectedReasoning: `A correct answer gives a valid concrete case and correctly applies the mechanics of ${t} to it.`,
      groundedInSource: false,
    },
    SCENARIO: {
      kind: "SCENARIO",
      difficulty: clampInt(concept.difficulty + 1, 1, 5),
      prompt: `Consider a system where ${t} is involved. What would go wrong if ${t} were removed or handled incorrectly, and why?`,
      expectedReasoning: `A correct answer reasons about consequences and links them causally to the role of ${t}.`,
      groundedInSource: false,
    },
    PROBLEM_SOLVING: {
      kind: "PROBLEM_SOLVING",
      difficulty: clampInt(concept.difficulty + 1, 1, 5),
      prompt: `Work through a specific problem that requires ${t}. State the steps and your reasoning at each step.`,
      expectedReasoning: `A correct answer produces a valid multi-step solution with sound reasoning that correctly uses ${t}.`,
      groundedInSource: false,
    },
  };
  return byKind[kind];
}

export async function generateQuestion(
  input: GenerateQuestionInput,
): Promise<Result<GeneratedQuestionResult>> {
  const kind =
    input.targetKind ?? questionKindForMastery(input.learnerMasteryPoints);

  if (!input.llm) {
    return ok({ ...fallbackQuestion(input.concept, kind), source: "fallback" });
  }

  const { system, user } = buildQuestionPrompt({
    conceptTitle: input.concept.title,
    conceptSummary: input.concept.summary,
    kind,
    difficulty: input.concept.difficulty,
    language: input.language,
    sourceContext: input.sourceContext ?? null,
  });

  const generated = await generateStructured({
    provider: input.llm,
    schema: generatedQuestionSchema,
    system,
    user,
    temperature: input.temperature ?? 0.5,
    maxOutputTokens: 500,
  });

  if (!generated.ok) {
    return ok({ ...fallbackQuestion(input.concept, kind), source: "fallback" });
  }

  return ok({ ...generated.value.value, source: "ai" });
}
