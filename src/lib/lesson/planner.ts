import type { LLMProvider } from "@/lib/ai/types";
import { generateStructured } from "@/lib/ai/structured";
import type { SupportedLanguage, TeachingStyle } from "@/lib/db/enums";
import type { LessonPlanSource } from "@/lib/db/enums";
import { lessonPlanSchema, type LessonPlan } from "@/lib/teaching/contracts";
import { clampInt, slugifyConceptKey, titleCase } from "@/lib/teaching/keys";
import { ok, type Result } from "@/lib/result";

import type { TeachingCitation } from "@/lib/session/citations";
import { buildLessonPlanPrompt } from "./prompts";

/**
 * LESSON PLANNER.
 *
 * A structured lesson plan must exist before the teaching conversation starts.
 * The LLM produces it (validated against `lessonPlanSchema`, including
 * cross-reference checks on concept keys). If the model is unavailable or its
 * output never validates, a deterministic fallback plan keeps the loop usable.
 */

export interface PlanLessonInput {
  llm: LLMProvider | null;
  topic: string;
  language: SupportedLanguage;
  learner: {
    level: number;
    goal: string | null;
    style: TeachingStyle | null;
    availableMinutes: number | null;
  };
  knownMastery?: { title: string; points: number }[];
  weakConceptTitles?: string[];
  sourceContext?: { text: string; citations: TeachingCitation[] } | null;
  temperature?: number;
}

export interface PlannedLesson {
  plan: LessonPlan;
  source: LessonPlanSource;
  citations: TeachingCitation[];
}

const FALLBACK_ACTIONS = ["EXPLAIN", "EXAMPLE", "ASK", "ASSESS"] as const;

export function buildFallbackPlan(
  topic: string,
  availableMinutes: number | null,
): LessonPlan {
  const key = slugifyConceptKey(topic, "topic");
  const title = titleCase(topic) || "This topic";
  return {
    objective: `Understand the core ideas behind ${title}.`,
    estimatedMinutes: clampInt(availableMinutes ?? 15, 1, 600),
    assessmentStrategy:
      "Check understanding with one conceptual question, then one application question; reteach with a different strategy if the learner struggles.",
    concepts: [
      {
        key,
        title,
        summary: `The essential concepts and vocabulary needed to reason about ${title}.`,
        difficulty: 3,
        importance: 5,
        prerequisites: [],
      },
    ],
    sequence: [{ conceptKey: key, actions: [...FALLBACK_ACTIONS] }],
  };
}

export async function planLesson(
  input: PlanLessonInput,
): Promise<Result<PlannedLesson>> {
  const citations = input.sourceContext?.citations ?? [];
  const grounded = Boolean(input.sourceContext?.text);

  if (!input.llm) {
    return ok({
      plan: buildFallbackPlan(input.topic, input.learner.availableMinutes),
      source: "fallback",
      citations,
    });
  }

  const { system, user } = buildLessonPlanPrompt({
    topic: input.topic,
    language: input.language,
    level: input.learner.level,
    goal: input.learner.goal,
    style: input.learner.style,
    availableMinutes: input.learner.availableMinutes,
    knownMastery: input.knownMastery ?? [],
    weakConcepts: input.weakConceptTitles ?? [],
    sourceContext: input.sourceContext?.text ?? null,
  });

  const generated = await generateStructured({
    provider: input.llm,
    schema: lessonPlanSchema,
    system,
    user,
    temperature: input.temperature ?? 0.3,
    maxOutputTokens: 1600,
  });

  if (!generated.ok) {
    return ok({
      plan: buildFallbackPlan(input.topic, input.learner.availableMinutes),
      source: "fallback",
      citations,
    });
  }

  return ok({
    plan: generated.value.value,
    source: grounded ? "ai+source" : "ai",
    citations,
  });
}
