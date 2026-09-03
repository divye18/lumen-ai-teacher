import { TEACHING_ACTIONS } from "@/types/teaching";

import type { PromptPair } from "@/lib/teaching/prompts";

export function buildLessonPlanPrompt(params: {
  topic: string;
  language: string;
  level: number;
  goal: string | null;
  style: string | null;
  availableMinutes: number | null;
  knownMastery: { title: string; points: number }[];
  weakConcepts: string[];
  sourceContext: string | null;
}): PromptPair {
  const system = [
    "You are Lumen's Lesson Planner. Produce a STRUCTURED lesson plan, not prose.",
    "Break the topic into an ordered chain of 2-6 concepts, from prerequisite to advanced.",
    "Each concept needs: a stable lowercase-hyphen `key`, a title, a one-paragraph summary, difficulty (1-5), importance (1-5), and prerequisite keys (only keys that appear in this plan).",
    "The `sequence` gives, per concept, the ordered teaching actions to start with.",
    `Valid actions: ${TEACHING_ACTIONS.join(", ")}.`,
    "Calibrate difficulty and depth to the learner level and available time. Prioritise the learner's weak concepts and goal.",
    params.sourceContext
      ? "Base concepts and their summaries on the SOURCE MATERIAL provided. Do not introduce concepts the source does not support."
      : "No source material — plan from general knowledge of the topic.",
    "Respond with ONE JSON object only. No prose, no markdown, no code fences.",
    'Schema: {"objective": <string>, "estimatedMinutes": <int>, "assessmentStrategy": <string>, "concepts": [{"key","title","summary","difficulty","importance","prerequisites":[]}], "sequence": [{"conceptKey","actions":[]}]}',
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    `TOPIC: ${params.topic}`,
    `LANGUAGE: ${params.language}`,
    `LEARNER LEVEL (1-5): ${params.level}`,
    `LEARNER GOAL: ${params.goal ?? "(not specified)"}`,
    `PREFERRED TEACHING STYLE: ${params.style ?? "(not specified)"}`,
    `AVAILABLE TIME (minutes): ${params.availableMinutes ?? "(not specified)"}`,
    params.knownMastery.length > 0
      ? `KNOWN MASTERY (0-100): ${params.knownMastery
          .map((m) => `${m.title}=${m.points}`)
          .join(", ")}`
      : "",
    params.weakConcepts.length > 0
      ? `WEAK CONCEPTS TO PRIORITISE: ${params.weakConcepts.join(", ")}`
      : "",
    params.sourceContext ? `\nSOURCE MATERIAL:\n${params.sourceContext}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user };
}
