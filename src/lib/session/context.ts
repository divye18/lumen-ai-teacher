import type {
  ClientTeachingQuestion,
  ConceptMasteryRow,
  InteractionRow,
  LearningSessionRow,
  LessonConceptRow,
  LessonRow,
  MisconceptionRow,
  TeachingAnswerRow,
} from "@/lib/db/repositories";
import {
  TEACHING_STYLES,
  type AnswerClassification,
  type QuestionKind,
  type TeachingStyle,
} from "@/lib/db/enums";
import type { PolicyFacts } from "@/lib/teaching/policy";
import { scoreToPoints } from "@/lib/teaching/mastery";
import type {
  EngineConceptContext,
  EngineSignalContext,
} from "@/lib/teaching/prompts";

const DEFAULT_STRATEGY: TeachingStyle = "conversational";

export interface SessionContextData {
  session: LearningSessionRow;
  lesson: LessonRow;
  lessonConcepts: LessonConceptRow[];
  currentConcept: LessonConceptRow;
  masteryRow: ConceptMasteryRow | null;
  /** Mastery points for the current concept BEFORE the last interaction. */
  previousMasteryPoints: number;
  misconceptions: MisconceptionRow[];
  recentAnswers: TeachingAnswerRow[];
  recentQuestions: ClientTeachingQuestion[];
  sessionInteractions: InteractionRow[];
  timeElapsedMinutes: number;
}

function asStrategy(value: string | null | undefined): TeachingStyle | null {
  return value && (TEACHING_STYLES as readonly string[]).includes(value)
    ? (value as TeachingStyle)
    : null;
}

export function currentStrategy(data: SessionContextData): TeachingStyle {
  return (
    asStrategy(data.masteryRow?.preferred_strategy) ??
    asStrategy(data.lesson.teaching_style) ??
    DEFAULT_STRATEGY
  );
}

/** Strategies already tried on the current concept, from persisted decisions. */
export function triedStrategies(data: SessionContextData): TeachingStyle[] {
  const out = new Set<TeachingStyle>();
  for (const interaction of data.sessionInteractions) {
    if (interaction.role !== "SYSTEM") continue;
    const meta = interaction.metadata as Record<string, unknown> | null;
    if (!meta || meta.kind !== "teaching_decision") continue;
    if (meta.conceptKey !== data.currentConcept.concept_key) continue;
    const s = asStrategy(
      typeof meta.strategy === "string" ? meta.strategy : null,
    );
    if (s) out.add(s);
  }
  return [...out];
}

function streaks(recentAnswers: TeachingAnswerRow[]): {
  correctStreak: number;
  incorrectStreak: number;
  lastClassification: AnswerClassification | null;
  lastCorrectnessScore: number | null;
} {
  const ordered = [...recentAnswers].sort((a, b) =>
    a.created_at < b.created_at ? -1 : 1,
  );
  let correctStreak = 0;
  let incorrectStreak = 0;
  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    if (ordered[i].classification === "CORRECT") {
      if (incorrectStreak > 0) break;
      correctStreak += 1;
    } else if (ordered[i].classification === "INCORRECT") {
      if (correctStreak > 0) break;
      incorrectStreak += 1;
    } else {
      break;
    }
  }
  const last = ordered[ordered.length - 1];
  return {
    correctStreak,
    incorrectStreak,
    lastClassification:
      (last?.classification as AnswerClassification | null) ?? null,
    lastCorrectnessScore: last?.correctness_score ?? null,
  };
}

const TEACHING_CONTENT_TYPES = new Set([
  "EXPLANATION",
  "RETEACH",
  "RECAP",
  "VISUAL",
  "HINT",
]);

/**
 * Teaching-content deliveries for the current concept since its most recent
 * question. Lets the policy move from EXPLAIN to ASK instead of re-explaining
 * forever when the learner has not been assessed yet.
 */
function explanationsSinceQuestion(data: SessionContextData): number {
  const conceptKey = data.currentConcept.concept_key;
  const lastQuestionAt = data.recentQuestions
    .filter((q) => q.concept_key === conceptKey)
    .map((q) => Date.parse(q.created_at))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b)
    .pop();
  const since = lastQuestionAt ?? 0;
  return data.sessionInteractions.filter((i) => {
    if (i.role !== "TEACHER") return false;
    if (!TEACHING_CONTENT_TYPES.has(i.interaction_type)) return false;
    const meta = i.metadata as Record<string, unknown> | null;
    if (meta?.conceptKey !== conceptKey) return false;
    return Date.parse(i.created_at) > since;
  }).length;
}

function hintsRequested(data: SessionContextData): number {
  return data.sessionInteractions.filter(
    (i) =>
      i.interaction_type === "HINT" &&
      (i.metadata as Record<string, unknown> | null)?.conceptKey ===
        data.currentConcept.concept_key,
  ).length;
}

export function buildPolicyFacts(data: SessionContextData): PolicyFacts {
  const masteryPoints = data.masteryRow
    ? scoreToPoints(data.masteryRow.mastery_score)
    : 0;
  const confidence = data.masteryRow ? data.masteryRow.confidence_score : 0;
  const attempts = data.masteryRow?.attempt_count ?? 0;

  const s = streaks(data.recentAnswers);

  const activeMisconceptions = data.misconceptions.filter(
    (m) => m.status !== "RESOLVED",
  );
  const repeatedMisconception = activeMisconceptions.some((m) => {
    const detections =
      Number((m.metadata as Record<string, unknown> | null)?.detections ?? 0) ||
      (Array.isArray(m.evidence) ? m.evidence.length : 0);
    return detections >= 2;
  });

  const timeRemainingMinutes =
    data.session.time_budget_minutes === null
      ? null
      : Math.max(
          0,
          Math.round(
            data.session.time_budget_minutes - data.timeElapsedMinutes,
          ),
        );

  const conceptsRemaining = data.lessonConcepts.filter(
    (c) =>
      c.position > data.currentConcept.position &&
      c.status !== "COMPLETED" &&
      c.status !== "SKIPPED",
  ).length;

  const lastQuestion = [...data.recentQuestions].sort((a, b) =>
    a.created_at < b.created_at ? -1 : 1,
  )[data.recentQuestions.length - 1];

  return {
    masteryPoints,
    previousMasteryPoints: data.previousMasteryPoints,
    confidence,
    attempts,
    correctStreak: s.correctStreak,
    incorrectStreak: s.incorrectStreak,
    hintsRequested: hintsRequested(data),
    repeatedMisconception,
    activeMisconceptionCount: activeMisconceptions.length,
    conceptImportance: data.currentConcept.importance,
    conceptDifficulty: data.currentConcept.difficulty,
    timeRemainingMinutes,
    lastClassification: s.lastClassification,
    lastCorrectnessScore: s.lastCorrectnessScore,
    currentStrategy: currentStrategy(data),
    triedStrategies: triedStrategies(data),
    lastQuestionKind:
      (lastQuestion?.question_kind as QuestionKind | null) ?? null,
    conceptsRemaining,
    explanationsSinceQuestion: explanationsSinceQuestion(data),
  };
}

export function buildEngineConcept(
  concept: LessonConceptRow,
  planConcepts: { key: string; prerequisites: string[] }[],
): EngineConceptContext {
  const planEntry = planConcepts.find((c) => c.key === concept.concept_key);
  return {
    key: concept.concept_key,
    title: concept.title,
    summary: concept.summary,
    difficulty: concept.difficulty,
    importance: concept.importance,
    prerequisites: planEntry?.prerequisites ?? [],
  };
}

export function buildEngineSignal(
  data: SessionContextData,
): EngineSignalContext {
  const lastAnswer = [...data.recentAnswers].sort((a, b) =>
    a.created_at < b.created_at ? -1 : 1,
  )[data.recentAnswers.length - 1];
  const evaluation =
    (lastAnswer?.evaluation as Record<string, unknown> | null) ?? null;

  return {
    lastAnswerText: lastAnswer?.response_text ?? null,
    lastClassification: lastAnswer?.classification ?? null,
    lastFeedback:
      typeof evaluation?.feedback === "string" ? evaluation.feedback : null,
    missingConcepts: Array.isArray(evaluation?.missingConcepts)
      ? (evaluation.missingConcepts as unknown[]).filter(
          (v): v is string => typeof v === "string",
        )
      : [],
    misconceptionSummaries: data.misconceptions
      .filter((m) => m.status !== "RESOLVED")
      .slice(0, 4)
      .map((m) => `${m.category}: ${m.description}`),
  };
}
