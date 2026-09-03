import { TEACHING_ACTIONS } from "@/types/teaching";
import { TEACHING_STYLES } from "@/lib/db/enums";

import type { PolicyFacts } from "./policy";

export interface PromptPair {
  system: string;
  user: string;
}

const JSON_ONLY =
  "Respond with ONE JSON object only. No prose, no markdown, no code fences, " +
  "no reasoning steps. Keep every 'reason'/'rationale' field to a single short sentence.";

export interface EngineConceptContext {
  key: string;
  title: string;
  summary: string;
  difficulty: number;
  importance: number;
  prerequisites: string[];
}

export interface EngineSignalContext {
  lastAnswerText: string | null;
  lastClassification: string | null;
  lastFeedback: string | null;
  missingConcepts: string[];
  misconceptionSummaries: string[];
}

export function buildEnginePrompt(params: {
  facts: PolicyFacts;
  concept: EngineConceptContext;
  signal: EngineSignalContext;
  language: string;
  learningGoal: string | null;
  sourceGrounded: boolean;
}): PromptPair {
  const system = [
    "You are Lumen's Teaching Engine: the decision-making brain of an adaptive tutor.",
    "You decide the single best NEXT pedagogical action for this learner, on this concept, right now.",
    "You do NOT write lesson content or questions here — only the decision.",
    `Allowed actions: ${TEACHING_ACTIONS.join(", ")}.`,
    `Allowed strategies: ${TEACHING_STYLES.join(", ")}.`,
    "Principles: if the learner struggles, switch strategy rather than repeat; if they do well, raise difficulty rather than repeat easy questions; if a misconception recurs, RETEACH differently; if time is low, prioritise high-value concepts.",
    JSON_ONLY,
    'Schema: {"action": <action>, "strategy": <strategy>, "difficultyDirection": "EASIER"|"SAME"|"HARDER", "targetConceptKey": <string>, "reason": <one sentence>, "nextAction": <action|null>}',
  ].join("\n");

  const user = JSON.stringify(
    {
      language: params.language,
      learningGoal: params.learningGoal,
      concept: params.concept,
      learner: {
        masteryPoints: params.facts.masteryPoints,
        previousMasteryPoints: params.facts.previousMasteryPoints,
        confidence: Number(params.facts.confidence.toFixed(2)),
        attempts: params.facts.attempts,
        correctStreak: params.facts.correctStreak,
        incorrectStreak: params.facts.incorrectStreak,
        hintsRequested: params.facts.hintsRequested,
        activeMisconceptionCount: params.facts.activeMisconceptionCount,
        repeatedMisconception: params.facts.repeatedMisconception,
        currentStrategy: params.facts.currentStrategy,
        triedStrategies: params.facts.triedStrategies,
      },
      lastInteraction: {
        answer: params.signal.lastAnswerText,
        classification: params.signal.lastClassification,
        feedback: params.signal.lastFeedback,
        missingConcepts: params.signal.missingConcepts,
        misconceptions: params.signal.misconceptionSummaries,
      },
      session: {
        timeRemainingMinutes: params.facts.timeRemainingMinutes,
        conceptsRemaining: params.facts.conceptsRemaining,
        lastQuestionKind: params.facts.lastQuestionKind,
      },
      teachingFromSourceMaterial: params.sourceGrounded,
    },
    null,
    2,
  );

  return { system, user };
}

export function buildTeachingContentPrompt(params: {
  action: string;
  strategy: string;
  concept: { key: string; title: string; summary: string; difficulty: number };
  difficultyDirection: string;
  language: string;
  sourceContext: string | null;
  priorMisconceptions: string[];
}): PromptPair {
  const system = [
    "You are Lumen, an adaptive tutor. Produce ONE short teaching turn for the learner.",
    `The Teaching Engine has chosen action "${params.action}" with a "${params.strategy}" style.`,
    "Be concrete and concise (120-220 words). Match the requested style: analogy-first = lead with a vivid analogy; visual-first = describe a mental picture; example-first = lead with a worked example; socratic = lead the learner with guiding questions; formal = precise definition then unpacking; conversational = plain, friendly language.",
    params.sourceContext
      ? "Ground your explanation in the provided SOURCE MATERIAL. Do not invent facts beyond it; if the source is insufficient, say what is known and set groundedInSource=false."
      : "No source material is provided; teach from general knowledge and set groundedInSource=false.",
    params.priorMisconceptions.length > 0
      ? `Directly address these known misconceptions: ${params.priorMisconceptions.join("; ")}.`
      : "",
    JSON_ONLY,
    'Schema: {"title": <string>, "body": <string>, "groundedInSource": <boolean>}',
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    `LANGUAGE: ${params.language}`,
    `CONCEPT: ${params.concept.title} (key: ${params.concept.key})`,
    `CONCEPT SUMMARY: ${params.concept.summary}`,
    `TARGET DIFFICULTY DIRECTION: ${params.difficultyDirection}`,
    params.sourceContext ? `\nSOURCE MATERIAL:\n${params.sourceContext}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user };
}
