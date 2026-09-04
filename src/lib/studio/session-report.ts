import "server-only";

import {
  createDocumentStore,
  createInteractionStore,
  createLessonStore,
  createMasteryStore,
  createSessionStore,
  createTeachingQaStore,
  type ClientTeachingQuestion,
  type DbClient,
  type TeachingAnswerRow,
} from "@/lib/db/repositories";
import { masteryBandLabel, scoreToPoints } from "@/lib/teaching/mastery";
import { buildStrategyMemory, deriveLearningProfile } from "@/lib/learner";
import { getKnowledgeGraph, type KnowledgeGraphView } from "@/lib/graph";
import { deriveSessionEvents } from "@/lib/session/learning-intelligence";
import { toLearningEventView } from "@/lib/session/intelligence-views";
import type { LearningEventView } from "@/lib/session/views";
import { SessionNotFoundError } from "@/lib/errors";
import { err, ok, type Result } from "@/lib/result";

import { buildObservations, type Observation } from "./observations";
import { buildLearningStory } from "./learning-story";
import {
  buildMasteryTrajectory,
  type MasteryTrajectory,
} from "./mastery-trajectory";
import { buildRecommendation, type RecommendationView } from "./recommendation";

export interface ConceptOutcome {
  key: string;
  title: string;
  masteryBefore: number;
  masteryAfter: number;
  delta: number;
  band: string;
}

export interface SessionReport {
  sessionId: string;
  lessonId: string;
  lessonTitle: string;
  topic: string;
  status: string;
  durationMinutes: number | null;
  questionsAnswered: number;
  correct: number;
  partial: number;
  incorrect: number;
  conceptsStrengthened: number;
  conceptsCompleted: number;
  averageMasteryMovement: number;
  misconceptionsIdentified: number;
  misconceptionsRepeated: number;
  outcomes: ConceptOutcome[];
  insights: string[];
  /** An ordered, evidence-backed narrative of how the session unfolded. */
  learningStory: string[];
  recommendation: RecommendationView;
  /** Total mastery points gained across strengthened concepts. */
  masteryGained: number;
  /** Concepts whose mastery moved up this session. */
  conceptsReinforced: number;
  /** Evidence-backed learning-pattern observations for this session. */
  learningPattern: Observation[];
  /**
   * One adaptive-teacher-memory insight: the strongest cross-session behavioural
   * signal refreshed by this session's evidence. `null` when evidence is thin.
   */
  personalizationInsight: string | null;
  /**
   * 7.4 — the real-time learning-intelligence events from THIS session's
   * evidence. The same vocabulary the Teaching Room showed live.
   */
  learningEvents: LearningEventView[];
  /** Graph-aware recommended next concept. */
  nextBestMove: {
    title: string;
    reason: string;
    href: string;
  } | null;
  /** The lesson's knowledge graph with current learner state. */
  graph: KnowledgeGraphView;
  /** Real per-concept mastery trajectories from this session's answers. */
  trajectories: MasteryTrajectory[];
}

function jsonNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function getSessionReport(
  db: DbClient,
  userId: string,
  sessionId: string,
): Promise<Result<SessionReport>> {
  const sessions = createSessionStore(db);
  const lessons = createLessonStore(db);
  const qa = createTeachingQaStore(db);
  const mastery = createMasteryStore(db);
  const documents = createDocumentStore(db);
  const interactions = createInteractionStore(db);

  const sessionRes = await sessions.get(sessionId);
  if (!sessionRes.ok) return sessionRes;
  const session = sessionRes.value;
  if (session.user_id !== userId || !session.lesson_id) {
    return err(new SessionNotFoundError(sessionId));
  }

  const [lessonRes, conceptsRes, answersRes, questionsRes, masteryRes] =
    await Promise.all([
      lessons.get(session.lesson_id),
      lessons.listConcepts(session.lesson_id),
      qa.listAnswersForSession(sessionId),
      qa.listQuestionsForSession(sessionId),
      mastery.listForUser(userId),
    ]);

  const lesson = lessonRes.ok ? lessonRes.value : null;
  const lessonConcepts = conceptsRes.ok ? conceptsRes.value : [];
  const answers = answersRes.ok ? answersRes.value : [];
  const questions = questionsRes.ok ? questionsRes.value : [];
  const masteryRows = masteryRes.ok ? masteryRes.value : [];
  const masteryByConceptId = new Map(masteryRows.map((m) => [m.concept_id, m]));

  const snapshot =
    (session.mastery_snapshot as Record<string, unknown> | null) ?? {};
  const baseline = (snapshot.__baseline as Record<string, number> | null) ?? {};
  // A completed session snapshots ending mastery so its report stays immutable
  // even after the shared per-user concept mastery moves in a later session.
  const ending = (snapshot.__ending as Record<string, number> | null) ?? null;

  const answeredConceptKeys = new Set(
    questions
      .filter((q) => answers.some((a) => a.question_id === q.id))
      .map((q) => q.concept_key),
  );

  const outcomes: ConceptOutcome[] = lessonConcepts
    .filter(
      (c) => answeredConceptKeys.has(c.concept_key) || c.status === "COMPLETED",
    )
    .map((c) => {
      const m = c.concept_id ? masteryByConceptId.get(c.concept_id) : undefined;
      const liveAfter = m ? scoreToPoints(m.mastery_score) : 0;
      const after = (ending && jsonNum(ending[c.concept_key])) ?? liveAfter;
      const before = jsonNum(baseline[c.concept_key]) ?? 0;
      return {
        key: c.concept_key,
        title: c.title,
        masteryBefore: before,
        masteryAfter: after,
        delta: after - before,
        band: masteryBandLabel(after),
      };
    });

  const questionsAnswered = answers.length;
  const correct = answers.filter((a) => a.classification === "CORRECT").length;
  const partial = answers.filter(
    (a) => a.classification === "PARTIALLY_CORRECT",
  ).length;
  const incorrect = answers.filter(
    (a) => a.classification === "INCORRECT",
  ).length;

  const movements = outcomes.map((o) => o.delta);
  const averageMasteryMovement =
    movements.length > 0
      ? Math.round(movements.reduce((s, d) => s + d, 0) / movements.length)
      : 0;
  const conceptsStrengthened = outcomes.filter((o) => o.delta > 0).length;
  const conceptsCompleted = lessonConcepts.filter(
    (c) => c.status === "COMPLETED",
  ).length;

  // Misconceptions tied to this session's evaluations.
  const evalMisconceptions = answers.flatMap((a) => {
    const evaluation = a.evaluation as Record<string, unknown> | null;
    const cands = evaluation?.misconceptionCandidates;
    return Array.isArray(cands) ? cands : [];
  });
  const misconceptionsIdentified = evalMisconceptions.length;
  const repeatedFromSnapshot = Object.entries(snapshot).filter(
    ([k, v]) =>
      k !== "__baseline" &&
      typeof v === "object" &&
      v !== null &&
      (v as { status?: string }).status === "NEEDS_RETEACHING",
  ).length;

  const startedAt = session.started_at
    ? new Date(session.started_at).getTime()
    : new Date(session.created_at).getTime();
  const endedAt = session.ended_at
    ? new Date(session.ended_at).getTime()
    : Date.now();
  const durationMinutes = Math.max(
    1,
    Math.round((endedAt - startedAt) / 60_000),
  );

  const insights = buildInsights({
    outcomes,
    answers,
    questions,
    repeated: repeatedFromSnapshot,
  });

  const [docRes, interactionsRes, graphRes] = await Promise.all([
    documents.listForUser(userId),
    interactions.listForSession(sessionId, { limit: 200 }),
    getKnowledgeGraph(db, userId, { lessonId: session.lesson_id }),
  ]);

  const emptyGraph: KnowledgeGraphView = {
    scope: "lesson",
    nodes: [],
    edges: [],
    layerCount: 0,
    stats: {
      nodeCount: 0,
      edgeCount: 0,
      assessedCount: 0,
      misconceptionCount: 0,
      prerequisiteEdges: 0,
      averageMastery: null,
    },
    generatedAt: new Date().toISOString(),
  };
  const graph = graphRes.ok ? graphRes.value : emptyGraph;

  const sessionInteractions = interactionsRes.ok ? interactionsRes.value : [];
  const strategyMemory = buildStrategyMemory({
    interactions: sessionInteractions,
    answers,
    questions,
  });
  const learningStory = buildLearningStory({
    outcomes,
    answers,
    questions,
    interactions: sessionInteractions,
    repeatedMisconception: repeatedFromSnapshot > 0,
  });
  const learningPattern = buildObservations({
    answers,
    questions,
    concepts: outcomes.map((o) => ({
      conceptKey: o.key,
      title: o.title,
      lessonId: session.lesson_id ?? "",
      lessonTitle: lesson?.title ?? "",
      masteryPoints: o.masteryAfter,
      band: o.band,
      bandId: "",
      confidence: 0,
      attempts: 1,
      misconceptionCount: 0,
      status: "COMPLETED",
      assessed: true,
      lastSeenAt: null,
    })),
    strategyMemory,
    graph,
  });

  const sessionProfile = deriveLearningProfile({
    answers,
    questions,
    interactions: sessionInteractions,
    concepts: outcomes.map((o) => ({
      conceptKey: o.key,
      title: o.title,
      masteryPoints: o.masteryAfter,
      attempts: 1,
      misconceptionCount: 0,
    })),
    misconceptions: [],
    strategyMemory,
  });
  const personalizationInsight =
    [...sessionProfile.signals].sort(
      (a, b) => b.evidence.confidence - a.evidence.confidence,
    )[0]?.summary ?? null;

  const learningEvents = deriveSessionEvents({
    concepts: outcomes.map((o) => ({
      key: o.key,
      title: o.title,
      masteryStart: o.masteryBefore,
      masteryEnd: o.masteryAfter,
    })),
    answers,
    questions,
    interactions: sessionInteractions,
    graph,
  }).map(toLearningEventView);

  const masteryGained = outcomes
    .filter((o) => o.delta > 0)
    .reduce((s, o) => s + o.delta, 0);
  const conceptsReinforced = outcomes.filter((o) => o.delta > 0).length;

  // Graph-aware next best move: the weakest node that the most other concepts
  // depend on, else the lowest-mastery assessed concept.
  const dependentCounts = new Map<string, number>();
  for (const e of graph.edges) {
    if (e.type !== "PREREQUISITE") continue;
    dependentCounts.set(e.source, (dependentCounts.get(e.source) ?? 0) + 1);
  }
  const candidate = [...graph.nodes]
    .filter((n) => n.masteryPoints < 71)
    .sort((a, b) => {
      const da = dependentCounts.get(a.id) ?? 0;
      const db2 = dependentCounts.get(b.id) ?? 0;
      if (da !== db2) return db2 - da;
      return a.masteryPoints - b.masteryPoints;
    })[0];
  const nextBestMove = candidate
    ? {
        title: candidate.title,
        reason:
          (dependentCounts.get(candidate.id) ?? 0) > 0
            ? `${candidate.title} supports other concepts and is at ${candidate.masteryPoints}/100 — reinforcing it unlocks the most.`
            : `${candidate.title} is your lowest point at ${candidate.masteryPoints}/100 — a focused pass will lift it.`,
        href: `/studio/plan?topic=${encodeURIComponent(candidate.title)}`,
      }
    : null;

  const recommendation = buildRecommendation({
    activeSession: null,
    concepts: outcomes.map((o) => ({
      conceptKey: o.key,
      title: o.title,
      lessonId: session.lesson_id ?? "",
      lessonTitle: lesson?.title ?? "",
      masteryPoints: o.masteryAfter,
      band: o.band,
      bandId: "",
      confidence: 0,
      attempts: 1,
      misconceptionCount: 0,
      status: "COMPLETED",
      assessed: true,
      lastSeenAt: null,
    })),
    documents: docRes.ok ? docRes.value : [],
    lessons: lesson ? [lesson] : [],
    misconceptions: [],
    answers,
    questions,
  });

  return ok({
    sessionId,
    lessonId: session.lesson_id,
    lessonTitle: lesson?.title ?? "Lesson",
    topic: lesson?.topic ?? session.topic ?? "",
    status: session.status,
    durationMinutes,
    questionsAnswered,
    correct,
    partial,
    incorrect,
    conceptsStrengthened,
    conceptsCompleted,
    averageMasteryMovement,
    misconceptionsIdentified,
    misconceptionsRepeated: repeatedFromSnapshot,
    outcomes,
    insights,
    learningStory,
    recommendation,
    masteryGained: Math.round(masteryGained),
    conceptsReinforced,
    learningEvents,
    learningPattern,
    personalizationInsight,
    nextBestMove,
    graph,
    trajectories: outcomes
      .map((o) =>
        buildMasteryTrajectory({
          conceptKey: o.key,
          conceptTitle: o.title,
          answers,
          questions,
        }),
      )
      .filter((t) => t.points.length > 0),
  });
}

function buildInsights(input: {
  outcomes: ConceptOutcome[];
  answers: TeachingAnswerRow[];
  questions: ClientTeachingQuestion[];
  repeated: number;
}): string[] {
  const insights: string[] = [];
  const { outcomes, answers, questions } = input;

  const kindOf = new Map(questions.map((q) => [q.id, q.question_kind]));
  const byKind = new Map<string, { total: number; correct: number }>();
  for (const a of answers) {
    const k = kindOf.get(a.question_id);
    if (!k) continue;
    const b = byKind.get(k) ?? { total: 0, correct: 0 };
    b.total += 1;
    if (a.classification === "CORRECT") b.correct += 1;
    byKind.set(k, b);
  }
  const rate = (k: string) => {
    const b = byKind.get(k);
    return b && b.total > 0 ? b.correct / b.total : null;
  };

  const conceptual = rate("CONCEPTUAL");
  const applied = rate("APPLICATION");
  const scenario = rate("SCENARIO") ?? rate("PROBLEM_SOLVING");

  if (
    conceptual !== null &&
    conceptual >= 0.75 &&
    scenario !== null &&
    scenario < 0.5
  ) {
    insights.push(
      "Strong on recall, weaker when transferring the idea to a scenario.",
    );
  } else if (
    applied !== null &&
    applied >= 0.7 &&
    conceptual !== null &&
    conceptual < 0.6
  ) {
    insights.push(
      "You reason well with examples even when the formal definition is still forming.",
    );
  }

  const biggestGain = [...outcomes].sort((a, b) => b.delta - a.delta)[0];
  if (biggestGain && biggestGain.delta >= 8) {
    insights.push(
      `Your understanding of ${biggestGain.title} moved the most this session (+${biggestGain.delta}).`,
    );
  }

  const stillWeak = outcomes.filter((o) => o.masteryAfter < 50);
  if (stillWeak.length > 0) {
    insights.push(
      `${stillWeak.map((o) => o.title).join(", ")} ${stillWeak.length === 1 ? "needs" : "need"} another reinforcement cycle.`,
    );
  }

  if (input.repeated > 0) {
    insights.push(
      "A misconception came back after a first attempt — Lumen switched teaching strategy to break the pattern.",
    );
  }

  // Timing signal.
  const times = answers
    .map((a) => a.response_time_ms)
    .filter((t): t is number => typeof t === "number" && t > 0);
  if (times.length >= 3) {
    const avg = times.reduce((s, t) => s + t, 0) / times.length / 1000;
    if (avg < 15) {
      insights.push(
        "You answered quickly — consider slowing down on the harder questions.",
      );
    }
  }

  if (insights.length === 0) {
    insights.push(
      "Keep going — a couple more sessions will give Lumen a clearer picture of your patterns.",
    );
  }

  return insights.slice(0, 4);
}
