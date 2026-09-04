import "server-only";

import {
  createDocumentStore,
  createInteractionStore,
  createLessonStore,
  createMasteryStore,
  createMisconceptionStore,
  createSessionStore,
  createTeachingQaStore,
  type DbClient,
  type LessonConceptRow,
} from "@/lib/db/repositories";
import {
  masteryBand,
  masteryBandLabel,
  scoreToPoints,
} from "@/lib/teaching/mastery";
import {
  buildStrategyMemory,
  deriveLearningProfile,
  personalizeTeaching,
} from "@/lib/learner";
import { getKnowledgeGraph, type KnowledgeGraphView } from "@/lib/graph";

import { buildMomentum, type MomentumView } from "./momentum";
import { buildObservations, type Observation } from "./observations";
import { buildRecommendation, type RecommendationView } from "./recommendation";

export interface ConceptNode {
  conceptKey: string;
  title: string;
  lessonId: string;
  lessonTitle: string;
  masteryPoints: number;
  band: string;
  bandId: string;
  confidence: number;
  attempts: number;
  misconceptionCount: number;
  status: string;
  assessed: boolean;
  lastSeenAt: string | null;
}

export interface MisconceptionInsight {
  id: string;
  conceptKey: string | null;
  conceptTitle: string;
  category: string;
  whatLumenNoticed: string;
  severity: string;
  detections: number;
  status: string;
}

export interface ActiveSessionView {
  sessionId: string;
  lessonId: string;
  lessonTitle: string;
  topic: string;
  currentConceptKey: string | null;
  currentConceptTitle: string | null;
  currentAction: string | null;
  masteryPoints: number;
  band: string;
  conceptIndex: number;
  conceptCount: number;
  conceptsCompleted: number;
  timeRemainingMinutes: number | null;
  sourceGrounded: boolean;
}

export interface DocumentSummary {
  id: string;
  title: string;
  fileName: string;
  status: string;
  pageCount: number | null;
  chunkCount: number | null;
  createdAt: string;
}

export interface StudioOverview {
  learnerName: string | null;
  hasAnyData: boolean;
  activeSession: ActiveSessionView | null;
  concepts: ConceptNode[];
  misconceptions: MisconceptionInsight[];
  momentum: MomentumView;
  recommendation: RecommendationView;
  documents: DocumentSummary[];
  lessonCount: number;
  llmConfigured: boolean;
  /** The learner-aware knowledge graph across every lesson. */
  graph: KnowledgeGraphView;
  /** Evidence-backed "how Lumen sees your learning" observations. */
  observations: Observation[];
  /** "What Lumen has learned about how you learn" — adaptive teacher memory. */
  learnerMemory: LearnerMemoryView | null;
  /** 7.4 — one compact real-time-learning-intelligence line, or null. */
  intelligenceInsight: string | null;
}

export interface LearnerMemoryView {
  /** Number of answers the profile was derived from. */
  computedFrom: number;
  /** Up to three concise, evidence-backed behavioural signals. */
  signals: { text: string; evidence: string }[];
  /** One sentence on how this currently changes Lumen's teaching, if it does. */
  personalizationNote: string | null;
}

function jsonNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function getStudioOverview(
  db: DbClient,
  userId: string,
  options: { llmConfigured: boolean },
): Promise<StudioOverview> {
  const lessons = createLessonStore(db);
  const sessions = createSessionStore(db);
  const mastery = createMasteryStore(db);
  const misconceptions = createMisconceptionStore(db);
  const documents = createDocumentStore(db);
  const interactions = createInteractionStore(db);
  const qa = createTeachingQaStore(db);

  const [
    identityRes,
    lessonRes,
    sessionRes,
    masteryRes,
    misconRes,
    docRes,
    recentInteractionsRes,
    recentAnswersRes,
    recentQuestionsRes,
  ] = await Promise.all([
    db.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
    lessons.listForUser(userId),
    sessions.listForUser(userId, { limit: 25 }),
    mastery.listForUser(userId),
    misconceptions.listActiveForUser(userId),
    documents.listForUser(userId),
    interactions.listRecentForUser(userId, 120),
    qa.listRecentAnswersForUser(userId, 120),
    qa.listRecentQuestionsForUser(userId, 120),
  ]);

  const lessonRows = lessonRes.ok ? lessonRes.value : [];
  const sessionRows = sessionRes.ok ? sessionRes.value : [];
  const masteryRows = masteryRes.ok ? masteryRes.value : [];
  const misconRows = misconRes.ok ? misconRes.value : [];
  const docRows = docRes.ok ? docRes.value : [];
  const recentInteractions = recentInteractionsRes.ok
    ? recentInteractionsRes.value
    : [];
  const recentAnswers = recentAnswersRes.ok ? recentAnswersRes.value : [];
  const recentQuestions = recentQuestionsRes.ok ? recentQuestionsRes.value : [];

  const masteryByConceptId = new Map(masteryRows.map((m) => [m.concept_id, m]));

  const activeMisconByConceptId = new Map<string, typeof misconRows>();
  for (const m of misconRows) {
    if (m.status === "RESOLVED") continue;
    const list = activeMisconByConceptId.get(m.concept_id) ?? [];
    list.push(m);
    activeMisconByConceptId.set(m.concept_id, list);
  }

  const lessonConceptsByLesson = new Map<string, LessonConceptRow[]>();
  await Promise.all(
    lessonRows.map(async (lesson) => {
      const res = await lessons.listConcepts(lesson.id);
      if (res.ok) lessonConceptsByLesson.set(lesson.id, res.value);
    }),
  );

  // concept_id → { key, title } from lesson_concepts (authoritative mapping).
  const conceptIdInfo = new Map<string, { key: string; title: string }>();
  for (const rows of lessonConceptsByLesson.values()) {
    for (const c of rows) {
      if (c.concept_id) {
        conceptIdInfo.set(c.concept_id, { key: c.concept_key, title: c.title });
      }
    }
  }

  const conceptByKey = new Map<string, ConceptNode>();
  for (const lesson of lessonRows) {
    for (const c of lessonConceptsByLesson.get(lesson.id) ?? []) {
      const m = c.concept_id ? masteryByConceptId.get(c.concept_id) : undefined;
      const points = m ? scoreToPoints(m.mastery_score) : 0;
      const activeMiscon = c.concept_id
        ? (activeMisconByConceptId.get(c.concept_id) ?? [])
        : [];
      conceptByKey.set(c.concept_key, {
        conceptKey: c.concept_key,
        title: c.title,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        masteryPoints: points,
        band: masteryBandLabel(points),
        bandId: masteryBand(points),
        confidence: m ? Math.round(m.confidence_score * 100) : 0,
        attempts: m?.attempt_count ?? 0,
        misconceptionCount: activeMiscon.length,
        status: c.status,
        assessed: Boolean(m && m.attempt_count > 0),
        lastSeenAt: m?.last_attempt_at ?? null,
      });
    }
  }
  const concepts = [...conceptByKey.values()].sort(
    (a, b) => a.masteryPoints - b.masteryPoints,
  );

  const activeRow = sessionRows.find(
    (s) =>
      s.lesson_id &&
      (s.status === "ACTIVE" ||
        s.status === "PAUSED" ||
        s.status === "PLANNED"),
  );
  let activeSession: ActiveSessionView | null = null;
  if (activeRow?.lesson_id) {
    const lesson = lessonRows.find((l) => l.id === activeRow.lesson_id);
    const lc = lessonConceptsByLesson.get(activeRow.lesson_id) ?? [];
    const current =
      lc.find((c) => c.position === activeRow.plan_cursor) ?? lc[0] ?? null;
    const currentNode = current
      ? conceptByKey.get(current.concept_key)
      : undefined;
    const started = activeRow.started_at
      ? new Date(activeRow.started_at).getTime()
      : new Date(activeRow.created_at).getTime();
    const elapsed = Math.max(0, (Date.now() - started) / 60_000);
    activeSession = {
      sessionId: activeRow.id,
      lessonId: activeRow.lesson_id,
      lessonTitle: lesson?.title ?? "Lesson",
      topic: lesson?.topic ?? activeRow.topic ?? "",
      currentConceptKey: current?.concept_key ?? null,
      currentConceptTitle: current?.title ?? null,
      currentAction: activeRow.current_action,
      masteryPoints: currentNode?.masteryPoints ?? 0,
      band: masteryBandLabel(currentNode?.masteryPoints ?? 0),
      conceptIndex: activeRow.plan_cursor,
      conceptCount: lc.length,
      conceptsCompleted: lc.filter((c) => c.status === "COMPLETED").length,
      timeRemainingMinutes:
        activeRow.time_budget_minutes === null
          ? null
          : Math.max(0, Math.round(activeRow.time_budget_minutes - elapsed)),
      sourceGrounded: lesson?.source_grounded ?? false,
    };
  }

  const misconceptionInsights: MisconceptionInsight[] = misconRows
    .filter((m) => m.status !== "RESOLVED")
    .slice(0, 8)
    .map((m) => {
      const info = conceptIdInfo.get(m.concept_id);
      return {
        id: m.id,
        conceptKey: info?.key ?? null,
        conceptTitle: info?.title ?? "A concept",
        category: m.category,
        whatLumenNoticed: m.description,
        severity: m.severity,
        detections:
          jsonNumber(
            (m.metadata as Record<string, unknown> | null)?.detections,
          ) ?? (Array.isArray(m.evidence) ? m.evidence.length : 1),
        status: m.status,
      };
    });

  const momentum = buildMomentum({
    answers: recentAnswers,
    interactions: recentInteractions,
    sessions: sessionRows,
    conceptCount: concepts.length,
  });

  const graphRes = await getKnowledgeGraph(db, userId);
  const graph: KnowledgeGraphView = graphRes.ok
    ? graphRes.value
    : {
        scope: "all",
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

  const strategyMemory = buildStrategyMemory({
    interactions: recentInteractions,
    answers: recentAnswers,
    questions: recentQuestions,
  });
  const observations = buildObservations({
    answers: recentAnswers,
    questions: recentQuestions,
    concepts,
    strategyMemory,
    graph,
  });

  const learningProfile = deriveLearningProfile({
    answers: recentAnswers,
    questions: recentQuestions,
    interactions: recentInteractions,
    concepts: concepts.map((c) => ({
      conceptKey: c.conceptKey,
      title: c.title,
      masteryPoints: c.masteryPoints,
      attempts: c.attempts,
      misconceptionCount: c.misconceptionCount,
    })),
    misconceptions: misconRows,
    strategyMemory,
  });
  const topSignals = [...learningProfile.signals]
    .sort((a, b) => b.evidence.confidence - a.evidence.confidence)
    .slice(0, 3);
  const learnerMemory: LearnerMemoryView | null =
    topSignals.length > 0
      ? {
          computedFrom: learningProfile.sampleSize,
          signals: topSignals.map((s) => ({
            text: s.summary,
            evidence:
              s.evidence.evidenceCount > 0
                ? `${s.evidence.evidenceCount} observation${
                    s.evidence.evidenceCount === 1 ? "" : "s"
                  } · confidence ${Math.round(s.evidence.confidence * 100)}%`
                : `confidence ${Math.round(s.evidence.confidence * 100)}%`,
          })),
          personalizationNote: personalizeTeaching(learningProfile).note,
        }
      : null;

  // 7.4 — ONE compact real-time-intelligence trajectory line, derived from the
  // SAME profile (not a second insight set). Only when evidence supports it.
  const signalKinds = new Set(learningProfile.signals.map((s) => s.kind));
  const momentumSignal = learningProfile.signals.find(
    (s) => s.kind === "learning-momentum",
  );
  let intelligenceInsight: string | null = null;
  if (
    learningProfile.sampleSize >= 6 &&
    (signalKinds.has("example-recovery") ||
      signalKinds.has("simplification-recovery"))
  ) {
    intelligenceInsight = "You're recovering faster from mistakes.";
  } else if (
    signalKinds.has("application-ahead-of-recall") ||
    (momentumSignal && momentumSignal.detail.direction === "improving")
  ) {
    intelligenceInsight = "Your application reasoning is getting stronger.";
  } else if (
    learningProfile.signals.some(
      (s) =>
        s.kind === "performance-consistency" &&
        s.detail.stdDev != null &&
        Number(s.detail.stdDev) <= 0.18,
    )
  ) {
    intelligenceInsight = "You're becoming more consistent.";
  }

  const recommendation = buildRecommendation({
    activeSession,
    concepts,
    documents: docRows,
    lessons: lessonRows,
    misconceptions: misconceptionInsights,
    answers: recentAnswers,
    questions: recentQuestions,
  });

  const documentSummaries: DocumentSummary[] = docRows.map((d) => {
    const meta = (d.metadata as Record<string, unknown> | null) ?? {};
    return {
      id: d.id,
      title: d.title,
      fileName: d.file_name,
      status: d.status,
      pageCount: jsonNumber(meta.totalPages),
      chunkCount: jsonNumber(meta.chunkCount),
      createdAt: d.created_at,
    };
  });

  return {
    learnerName:
      identityRes.data?.display_name && identityRes.data.display_name.length > 0
        ? identityRes.data.display_name
        : null,
    hasAnyData:
      docRows.length > 0 || lessonRows.length > 0 || masteryRows.length > 0,
    activeSession,
    concepts,
    misconceptions: misconceptionInsights,
    momentum,
    recommendation,
    documents: documentSummaries,
    lessonCount: lessonRows.length,
    llmConfigured: options.llmConfigured,
    graph,
    observations,
    learnerMemory,
    intelligenceInsight,
  };
}
