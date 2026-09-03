import type { LLMProvider } from "@/lib/ai/types";
import { generateStructured } from "@/lib/ai/structured";
import { ok, type Result } from "@/lib/result";

import {
  teachingContentSchema,
  type TeachingContent,
  type TeachingStyle,
} from "./contracts";
import { buildTeachingContentPrompt } from "./prompts";

/**
 * Renders the learner-facing text for a non-question teaching action
 * (EXPLAIN / EXAMPLE / ANALOGY / SIMPLIFY / RETEACH / RECAP / …).
 *
 * The Teaching Engine already chose the action and strategy; this only
 * produces the words. Falls back to a deterministic template.
 */

export interface GenerateTeachingContentInput {
  llm: LLMProvider | null;
  action: string;
  strategy: TeachingStyle;
  difficultyDirection: string;
  concept: { key: string; title: string; summary: string; difficulty: number };
  language: string;
  sourceContext?: string | null;
  priorMisconceptions?: string[];
  temperature?: number;
}

export interface TeachingContentResult extends TeachingContent {
  source: "ai" | "fallback";
}

function fallbackContent(input: GenerateTeachingContentInput): TeachingContent {
  const { action, strategy, concept } = input;
  const lead =
    strategy === "analogy-first"
      ? `Here is an analogy for ${concept.title}. `
      : strategy === "visual-first"
        ? `Picture ${concept.title} like this. `
        : strategy === "example-first"
          ? `Let's start with an example of ${concept.title}. `
          : strategy === "socratic"
            ? `Let's reason about ${concept.title} together. `
            : "";
  const verb =
    action === "SIMPLIFY" || action === "RETEACH"
      ? "In the simplest terms, "
      : action === "RECAP"
        ? "Quick recap: "
        : "";
  return {
    title: concept.title,
    body: `${lead}${verb}${concept.summary}`.trim().slice(0, 3800),
    groundedInSource: false,
  };
}

export async function generateTeachingContent(
  input: GenerateTeachingContentInput,
): Promise<Result<TeachingContentResult>> {
  if (!input.llm) {
    return ok({ ...fallbackContent(input), source: "fallback" });
  }

  const { system, user } = buildTeachingContentPrompt({
    action: input.action,
    strategy: input.strategy,
    concept: input.concept,
    difficultyDirection: input.difficultyDirection,
    language: input.language,
    sourceContext: input.sourceContext ?? null,
    priorMisconceptions: input.priorMisconceptions ?? [],
  });

  const generated = await generateStructured({
    provider: input.llm,
    schema: teachingContentSchema,
    system,
    user,
    temperature: input.temperature ?? 0.4,
    maxOutputTokens: 700,
  });

  if (!generated.ok) {
    return ok({ ...fallbackContent(input), source: "fallback" });
  }

  return ok({ ...generated.value.value, source: "ai" });
}
