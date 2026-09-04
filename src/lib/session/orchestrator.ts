import "server-only";

import type { LLMProvider } from "@/lib/ai/types";
import {
  createAssessmentStore,
  createInteractionStore,
  createLessonStore,
  createMasteryStore,
  createMisconceptionStore,
  createSessionStore,
  createTeachingQaStore,
  type DbClient,
  type LearningSessionRow,
  type LessonConceptRow,
  type LessonRow,
} from "@/lib/db/repositories";
import {
  selectDiagnosticQuestionSet,
  scoreDiagnosticQuestionSet,
} from "@/lib/assessment/diagnostic";
import { seedMasteryFromDiagnostic } from "@/lib/assessment/diagnostic-mastery";
import type { CurrentConceptState } from "@/lib/learner/state-update";
import type { InteractionType } from "@/lib/db/enums";
import {
  LessonNotFoundError,
  PersistenceError,
  SessionNotFoundError,
  ValidationError,
} from "@/lib/errors";
import type { Retriever } from "@/lib/rag";
import { err, ok, type Result } from "@/lib/result";
import { generateQuestion, questionKindForMastery } from "@/lib/assessment";
import { evaluateAnswer } from "@/lib/assessment/evaluator";
import {
  applyInteractionOutcome,
  normalizeCategory,
  evaluateMisconceptionResolution,
  misconceptionCategoriesInQuestion,
  selectVerificationTarget,
  selectSpacedReviewTarget,
  selectQuestionTargetCategory,
  type ExistingMisconception,
  type PersonalizationAdjustments,
  type ResolutionOutcome,
} from "@/lib/learner";
import {
  loadPersonalization,
  recomputeLearningProfile,
} from "@/lib/learner/learning-profile-service";
import {
  createTeachingEngine,
  deriveVisualIntent,
  explainNextStep,
  generateTeachingContent,
  masteryBandLabel,
  nextQuestionKind,
  scoreToPoints,
  titleCase,
  visualIntentLabel,
  visualModeLabel,
  type PolicyFacts,
  type ResolvedTeachingDecision,
  type VisualIntentContext,
} from "@/lib/teaching";
import { buildMisconceptionDetail } from "@/lib/teaching/misconception-view";
import {
  lessonPlanSchema,
  type LessonPlan,
  type RichAnswerEvaluation,
} from "@/lib/teaching/contracts";
import { getKnowledgeGraph, graphSignalFromView } from "@/lib/graph";
import { resolveVisual } from "@/lib/visuals";
import {
  pickStructuredQuestion,
  gradeStructuredAnswer,
  toClientStructured,
  structuredQuestionFromRow,
  structuredAnswerSchema,
  type StructuredAnswer,
} from "@/lib/assessment/structured";

import {
  buildEngineConcept,
  buildEngineSignal,
  buildIntelligenceInput,
  buildPolicyFacts,
  currentStrategy,
  type SessionContextData,
} from "./context";
import {
  buildDiagnosticAssessmentInput,
  buildDiagnosticConceptsAndEdges,
  buildMasteryUpsertInputs,
  buildStoredDiagnosticState,
  markDiagnosticCompleted,
  needsDiagnostic,
  parseStoredDiagnosticState,
  resolveDiagnosticPhase,
  toDiagnosticQuestionSet,
  type DiagnosticGraphInput,
  type DiagnosticLessonConcept,
} from "./diagnostic-flow";
import {
  deriveLearningEvent,
  deriveLearningIntelligence,
  isInterventionAction,
  repeatedMisconceptionCount,
  type EventSnapshot,
} from "./learning-intelligence";
import {
  toIntelligenceView,
  toLearningEventView,
  toLiveStatusView,
} from "./intelligence-views";
import {
  buildSourceContextText,
  toTeachingCitations,
  type TeachingCitation,
} from "./citations";
import type {
  DecisionView,
  DiagnosticCompletionView,
  EvaluationView,
  InteractionResultView,
  SessionProgress,
  SessionView,
  TeachingStepView,
} from "./views";

/**
 * TEACHING SESSION ORCHESTRATOR.
 *
 * The deterministic product loop that ties the learner model, lesson plan,
 * teaching engine, question generation, answer evaluation and persistence
 * together:
 *
 *   understand → plan (done in the lesson service) → teach → ask → evaluate →
 *   update learner state → decide next → adapt
 *
 * Every teaching decision is persisted (as a SYSTEM interaction) so the
 * adaptation history is auditable and a UI can surface "visible intelligence".
 */

export interface OrchestratorDeps {
  db: DbClient;
  llm: LLMProvider | null;
  retriever: Retriever | null;
  userId: string;
}

export interface TeachingOrchestrator {
  startOrResume(input: {
    lessonId?: string;
    sessionId?: string;
    timeBudgetMinutes?: number | null;
  }): Promise<Result<SessionView>>;
  getNextStep(input: { sessionId: string }): Promise<Result<TeachingStepView>>;
  submitAnswer(input: {
    sessionId: string;
    questionId: string;
    answerText: string;
    responseTimeMs?: number | null;
  }): Promise<Result<InteractionResultView>>;
  /**
   * Grade and apply a completed diagnostic pre-assessment (see
   * `session/diagnostic-flow.ts`). Idempotent: calling this again after
   * completion returns the stored result without re-grading or re-seeding.
   */
  submitDiagnostic(input: {
    sessionId: string;
    answers: { conceptKey: string; answer: StructuredAnswer }[];
  }): Promise<Result<DiagnosticCompletionView>>;
}

const ACTION_TO_INTERACTION_TYPE: Record<string, InteractionType> = {
  EXPLAIN: "EXPLANATION",
  EXAMPLE: "EXPLANATION",
  ANALOGY: "EXPLANATION",
  SIMPLIFY: "EXPLANATION",
  RETEACH: "RETEACH",
  RECAP: "RECAP",
  DECREASE_DIFFICULTY: "EXPLANATION",
  INCREASE_DIFFICULTY: "EXPLANATION",
  VISUALIZE: "VISUAL",
  HINT: "HINT",
  ASK: "QUESTION",
  ASSESS: "QUESTION",
};

const QUESTION_ACTIONS = new Set(["ASK", "ASSESS"]);

/** Everything `deriveVisualIntent` needs, straight from the policy facts. */
function visualIntentContext(
  facts: PolicyFacts,
  action: string,
  personalizationBias: PersonalizationAdjustments["visualBias"] = null,
): VisualIntentContext {
  return {
    masteryPoints: facts.masteryPoints,
    previousMasteryPoints: facts.previousMasteryPoints,
    repeatedMisconception: facts.repeatedMisconception,
    lastClassification: facts.lastClassification,
    incorrectStreak: facts.incorrectStreak,
    attempts: facts.attempts,
    action,
    questionKind: facts.lastQuestionKind,
    strategy: facts.currentStrategy,
    conceptImportance: facts.conceptImportance,
    personalizationBias,
  };
}

/**
 * Adaptive teacher memory: open a brand-new concept with a worked example
 * instead of an abstract explanation when the learner's cross-session history
 * shows that helps. Deterministic and narrow — only the very first teaching
 * turn on a concept, and only when the base policy chose a plain EXPLAIN.
 */
function maybeNudgeToExample(
  decision: ResolvedTeachingDecision,
  personalization: PersonalizationAdjustments,
  facts: PolicyFacts,
): { decision: ResolvedTeachingDecision; note: string | null } {
  const eligible =
    decision.action === "EXPLAIN" &&
    decision.source === "policy" &&
    personalization.preferConcreteExample &&
    facts.attempts === 0 &&
    facts.explanationsSinceQuestion === 0;
  if (!eligible) return { decision, note: null };
  const note =
    personalization.note ??
    "Starting with a concrete example — that has helped you recover faster before.";
  return {
    decision: {
      ...decision,
      action: "EXAMPLE",
      adaptationNarrative: [
        ...decision.adaptationNarrative,
        "Opening with a worked example — your history shows that lands faster for you.",
      ],
    },
    note,
  };
}

/** Prereq / dependent / sibling concept titles for the structured template generator. */
function buildTemplateGraphContext(
  graph: SessionContextData["graphView"],
  conceptKey: string,
):
  | {
      prerequisiteTitles: string[];
      dependentTitles: string[];
      otherConceptTitles: string[];
    }
  | undefined {
  if (!graph) return undefined;
  const node = graph.nodes.find((n) => n.conceptKey === conceptKey);
  if (!node) return undefined;
  const titleById = new Map(graph.nodes.map((n) => [n.id, n.title]));
  const prerequisiteTitles = graph.edges
    .filter((e) => e.type === "PREREQUISITE" && e.target === node.id)
    .map((e) => titleById.get(e.source))
    .filter((t): t is string => Boolean(t));
  const dependentTitles = graph.edges
    .filter((e) => e.type === "PREREQUISITE" && e.source === node.id)
    .map((e) => titleById.get(e.target))
    .filter((t): t is string => Boolean(t));
  const otherConceptTitles = graph.nodes
    .filter((n) => n.id !== node.id)
    .map((n) => n.title);
  return { prerequisiteTitles, dependentTitles, otherConceptTitles };
}

interface LoadedSession {
  data: SessionContextData;
  plan: LessonPlan;
  currentConceptId: string | null;
}

export function createTeachingOrchestrator(
  deps: OrchestratorDeps,
): TeachingOrchestrator {
  const sessions = createSessionStore(deps.db);
  const lessons = createLessonStore(deps.db);
  const qa = createTeachingQaStore(deps.db);
  const mastery = createMasteryStore(deps.db);
  const misconceptions = createMisconceptionStore(deps.db);
  const interactions = createInteractionStore(deps.db);
  const assessments = createAssessmentStore(deps.db);
  const engine = createTeachingEngine({ llm: deps.llm });

  /**
   * Snapshot each lesson concept's current mastery (0–100). Used at session
   * start (`__baseline`) and again at completion (`__ending`) so a finished
   * session's report stays immutable even if the shared per-user concept
   * mastery moves in a later session.
   */
  async function captureBaseline(
    lessonId: string,
  ): Promise<Record<string, number> | null> {
    const conceptsRes = await lessons.listConcepts(lessonId);
    if (!conceptsRes.ok) return null;
    const masteryRes = await mastery.listForUser(deps.userId);
    const byId = new Map(
      (masteryRes.ok ? masteryRes.value : []).map((m) => [m.concept_id, m]),
    );
    const out: Record<string, number> = {};
    for (const c of conceptsRes.value) {
      const m = c.concept_id ? byId.get(c.concept_id) : undefined;
      out[c.concept_key] = m ? scoreToPoints(m.mastery_score) : 0;
    }
    return out;
  }

  function terminalStep(data: SessionContextData): TeachingStepView {
    return {
      sessionId: data.session.id,
      decision: {
        action: "RECAP",
        strategy: currentStrategy(data),
        difficultyDirection: "SAME",
        targetConceptKey: data.currentConcept.concept_key,
        reason: "All planned concepts have been covered.",
        nextAction: null,
        source: "policy",
        adaptationNarrative: [
          "Lesson complete — every planned concept has been taught and checked.",
        ],
        overrides: [],
        whyThisNext: {
          headline: "Lesson complete",
          reason:
            "You've worked through every concept — Lumen has a full picture of where you stand.",
        },
        personalizationNote: null,
      },
      content: null,
      question: null,
      citations: [],
      progress: progressOf(
        data.session,
        data.lessonConcepts,
        Math.round(data.timeElapsedMinutes),
      ),
      sessionStatus: "COMPLETED",
      intelligence: null,
      liveStatus: null,
    };
  }

  function parsePlan(lesson: LessonRow): LessonPlan | null {
    const parsed = lessonPlanSchema.safeParse(lesson.plan);
    return parsed.success ? parsed.data : null;
  }

  function progressOf(
    session: LearningSessionRow,
    lessonConcepts: LessonConceptRow[],
    timeElapsedMinutes: number,
  ): SessionProgress {
    const cursor = session.plan_cursor;
    const current = lessonConcepts.find((c) => c.position === cursor) ?? null;
    return {
      conceptIndex: cursor,
      conceptCount: lessonConcepts.length,
      conceptsCompleted: lessonConcepts.filter((c) => c.status === "COMPLETED")
        .length,
      currentConceptKey: current?.concept_key ?? null,
      timeElapsedMinutes,
      timeRemainingMinutes:
        session.time_budget_minutes === null
          ? null
          : Math.max(
              0,
              Math.round(session.time_budget_minutes - timeElapsedMinutes),
            ),
    };
  }

  function toDecisionView(decision: ResolvedTeachingDecision): DecisionView {
    return {
      action: decision.action,
      strategy: decision.strategy,
      difficultyDirection: decision.difficultyDirection,
      targetConceptKey: decision.targetConceptKey,
      reason: decision.reason,
      nextAction: decision.nextAction,
      source: decision.source,
      adaptationNarrative: decision.adaptationNarrative,
      overrides: decision.overrides,
      whyThisNext: null,
      personalizationNote: null,
    };
  }

  const QUESTION_NEXT_ACTIONS = new Set(["ASK", "ASSESS"]);

  /**
   * A decision view for a step Lumen is about to take, with the deterministic
   * "why this next?" explanation attached. Used for the served step and for the
   * `nextDecision` after an answer — never for bare history records.
   */
  function nextDecisionView(
    decision: ResolvedTeachingDecision,
    facts: PolicyFacts,
    opts: {
      conceptTitle: string;
      nextConceptTitle?: string | null;
      misconceptionDetectionCount?: number;
      personalizationNote?: string | null;
    },
  ): DecisionView {
    const view = toDecisionView(decision);
    view.personalizationNote = opts.personalizationNote ?? null;
    view.whyThisNext = explainNextStep({
      action: decision.action,
      difficultyDirection: decision.difficultyDirection,
      nextActionKind: decision.nextAction
        ? QUESTION_NEXT_ACTIONS.has(decision.nextAction)
          ? "question"
          : "teaching"
        : null,
      facts,
      conceptTitle: titleCase(opts.conceptTitle.replace(/-/g, " ")),
      nextConceptTitle: opts.nextConceptTitle
        ? titleCase(opts.nextConceptTitle.replace(/-/g, " "))
        : null,
      weakPrerequisiteTitle: facts.weakUpstreamPrerequisite?.title ?? null,
      misconceptionDetectionCount: opts.misconceptionDetectionCount,
    });
    return view;
  }

  async function loadContext(
    sessionId: string,
  ): Promise<Result<LoadedSession>> {
    const sessionRes = await sessions.get(sessionId);
    if (!sessionRes.ok) return sessionRes;
    const session = sessionRes.value;
    if (session.user_id !== deps.userId) {
      return err(new SessionNotFoundError(sessionId));
    }
    if (!session.lesson_id) {
      return err(new SessionNotFoundError(sessionId));
    }

    const lessonRes = await lessons.get(session.lesson_id);
    if (!lessonRes.ok) return lessonRes;
    const lesson = lessonRes.value;

    const plan = parsePlan(lesson);
    if (!plan) {
      return err(
        new PersistenceError("stored lesson plan is not valid", {
          cause: lesson.id,
        }),
      );
    }

    const conceptsRes = await lessons.listConcepts(lesson.id);
    if (!conceptsRes.ok) return conceptsRes;
    const lessonConcepts = conceptsRes.value;
    if (lessonConcepts.length === 0) {
      return err(new PersistenceError("lesson has no concepts"));
    }

    const cursor = Math.min(session.plan_cursor, lessonConcepts.length - 1);
    const currentConcept =
      lessonConcepts.find((c) => c.position === cursor) ?? lessonConcepts[0];
    const currentConceptId = currentConcept.concept_id;

    const [masteryRes, misconRes, answersRes, questionsRes, interactionsRes] =
      await Promise.all([
        currentConceptId
          ? mastery.get(deps.userId, currentConceptId)
          : Promise.resolve(ok(null)),
        currentConceptId
          ? misconceptions.listForConcept(deps.userId, currentConceptId)
          : Promise.resolve(ok([])),
        qa.listAnswersForSession(session.id),
        qa.listQuestionsForSession(session.id),
        interactions.listForSession(session.id, { limit: 60 }),
      ]);

    const masteryRow =
      masteryRes.ok && masteryRes.value ? masteryRes.value : null;
    const allMiscon = misconRes.ok ? misconRes.value : [];
    const allAnswers = answersRes.ok ? answersRes.value : [];
    const allQuestions = questionsRes.ok ? questionsRes.value : [];
    const sessionInteractions = interactionsRes.ok ? interactionsRes.value : [];

    const conceptQuestionIds = new Set(
      allQuestions
        .filter((q) => q.concept_key === currentConcept.concept_key)
        .map((q) => q.id),
    );
    const recentAnswers = allAnswers.filter((a) =>
      conceptQuestionIds.has(a.question_id),
    );
    const recentQuestions = allQuestions.filter(
      (q) => q.concept_key === currentConcept.concept_key,
    );

    const startedAt = session.started_at
      ? new Date(session.started_at).getTime()
      : new Date(session.created_at).getTime();
    const timeElapsedMinutes = Math.max(0, (Date.now() - startedAt) / 60_000);

    const snapshot =
      (session.mastery_snapshot as Record<
        string,
        { masteryPoints?: number; previousMasteryPoints?: number }
      > | null) ?? {};
    const snapEntry = snapshot[currentConcept.concept_key];
    const currentPoints = masteryRow
      ? scoreToPoints(masteryRow.mastery_score)
      : 0;
    const previousMasteryPoints =
      snapEntry?.previousMasteryPoints ?? currentPoints;

    // Graph awareness — best effort. Never blocks the teaching loop.
    let graphSignal: SessionContextData["graphSignal"];
    let graphView: SessionContextData["graphView"];
    try {
      const graphRes = await getKnowledgeGraph(deps.db, deps.userId, {
        lessonId: lesson.id,
      });
      if (graphRes.ok) {
        graphView = graphRes.value;
        if (graphRes.value.edges.length > 0) {
          graphSignal = graphSignalFromView(
            graphRes.value,
            currentConcept.concept_key,
          );
        }
      }
    } catch {
      graphSignal = undefined;
    }

    const data: SessionContextData = {
      session,
      lesson,
      lessonConcepts,
      currentConcept,
      masteryRow,
      previousMasteryPoints,
      misconceptions: allMiscon,
      recentAnswers,
      recentQuestions,
      sessionInteractions,
      timeElapsedMinutes,
      graphSignal,
      graphView,
    };

    return ok({ data, plan, currentConceptId });
  }

  async function sourceContextFor(
    data: SessionContextData,
  ): Promise<{ text: string; citations: TeachingCitation[] } | null> {
    if (!deps.retriever || !data.lesson.source_grounded) return null;
    const retrieved = await deps.retriever.retrieve({
      userId: deps.userId,
      text: `${data.currentConcept.title} ${data.currentConcept.summary}`,
      documentId: data.lesson.document_id ?? undefined,
      topK: 4,
      similarityThreshold: 0.12,
    });
    if (!retrieved.ok || retrieved.value.length === 0) return null;
    return {
      text: buildSourceContextText(retrieved.value, 3200),
      citations: toTeachingCitations(retrieved.value),
    };
  }

  async function recordDecision(
    data: SessionContextData,
    decision: ResolvedTeachingDecision,
    conceptId: string | null,
  ): Promise<void> {
    await interactions.record({
      sessionId: data.session.id,
      userId: deps.userId,
      conceptId: conceptId ?? undefined,
      role: "SYSTEM",
      interactionType: "OTHER",
      content: decision.reason,
      metadata: {
        kind: "teaching_decision",
        conceptKey: data.currentConcept.concept_key,
        action: decision.action,
        strategy: decision.strategy,
        difficultyDirection: decision.difficultyDirection,
        source: decision.source,
        overrides: decision.overrides,
        adaptationNarrative: decision.adaptationNarrative,
      },
    });
  }

  async function buildSessionView(
    session: LearningSessionRow,
  ): Promise<Result<SessionView>> {
    if (!session.lesson_id) return err(new SessionNotFoundError(session.id));
    const conceptsRes = await lessons.listConcepts(session.lesson_id);
    if (!conceptsRes.ok) return conceptsRes;
    const startedAt = session.started_at
      ? new Date(session.started_at).getTime()
      : new Date(session.created_at).getTime();
    const timeElapsedMinutes = Math.max(0, (Date.now() - startedAt) / 60_000);

    const snapshot =
      (session.mastery_snapshot as Record<
        string,
        {
          masteryPoints?: number;
          confidence?: number;
          band?: string;
          status?: string;
        }
      > | null) ?? {};

    const storedDiagnostic = parseStoredDiagnosticState(
      (session.mastery_snapshot as Record<string, unknown> | null)
        ?.__diagnostic,
    );

    return ok({
      sessionId: session.id,
      lessonId: session.lesson_id,
      status: session.status,
      language: session.language,
      currentAction: session.current_action,
      progress: progressOf(
        session,
        conceptsRes.value,
        Math.round(timeElapsedMinutes),
      ),
      mastery: conceptsRes.value.map((c) => {
        const s = snapshot[c.concept_key];
        return {
          conceptKey: c.concept_key,
          masteryPoints: s?.masteryPoints ?? 0,
          masteryBand: s?.band ?? masteryBandLabel(s?.masteryPoints ?? 0),
          confidence: s?.confidence ?? 0,
          status: s?.status ?? c.status,
        };
      }),
      diagnostic: resolveDiagnosticPhase(storedDiagnostic).pending,
    });
  }

  /**
   * CASE 1 (new learner / no lesson-scoped mastery evidence): builds a
   * diagnostic question set scoped to this lesson's concepts and graph,
   * persists an `assessments` envelope row (`assessment_type = 'DIAGNOSTIC'`)
   * and the pending question set on the session, and switches
   * `current_action` to `"DIAGNOSTIC"`. Returns `false` (falls through to
   * normal teaching) when the learner already has lesson-scoped evidence, or
   * when no safe diagnostic question could be selected for this lesson.
   */
  async function beginDiagnosticIfNeeded(
    session: LearningSessionRow,
    lesson: LessonRow,
    lessonConceptRows: LessonConceptRow[],
  ): Promise<LearningSessionRow | null> {
    const lessonConcepts: DiagnosticLessonConcept[] = lessonConceptRows.map(
      (c) => ({
        conceptId: c.concept_id,
        conceptKey: c.concept_key,
        title: c.title,
        summary: c.summary,
      }),
    );

    const masteryRes = await mastery.listForUser(deps.userId);
    const evidence = (masteryRes.ok ? masteryRes.value : []).map((m) => ({
      conceptId: m.concept_id,
      attemptCount: m.attempt_count,
    }));

    if (!needsDiagnostic(lessonConcepts, evidence)) return null;

    let graphInput: DiagnosticGraphInput | undefined;
    try {
      const graphRes = await getKnowledgeGraph(deps.db, deps.userId, {
        lessonId: lesson.id,
      });
      if (graphRes.ok) {
        graphInput = {
          nodes: graphRes.value.nodes.map((n) => ({
            id: n.id,
            conceptKey: n.conceptKey,
          })),
          edges: graphRes.value.edges.map((e) => ({
            source: e.source,
            target: e.target,
            type: e.type,
          })),
        };
      }
    } catch {
      graphInput = undefined;
    }

    const { concepts, edges } = buildDiagnosticConceptsAndEdges(
      lessonConcepts,
      graphInput,
    );
    const set = selectDiagnosticQuestionSet(concepts, edges);
    if (set.items.length === 0) return null; // nothing safe to ask — teach immediately

    const assessmentRes = await assessments.create(
      buildDiagnosticAssessmentInput(deps.userId, session.id),
    );
    if (!assessmentRes.ok) return null; // best-effort — fall through to teaching

    const now = new Date().toISOString();
    const stored = buildStoredDiagnosticState(assessmentRes.value.id, set, now);
    const existingSnapshot =
      (session.mastery_snapshot as Record<string, unknown> | null) ?? {};

    const updated = await sessions.updateTeaching({
      id: session.id,
      currentAction: "DIAGNOSTIC",
      masterySnapshot: { ...existingSnapshot, __diagnostic: stored },
    });
    return updated.ok ? updated.value : null;
  }

  return {
    async startOrResume(input) {
      if (input.sessionId) {
        const res = await sessions.get(input.sessionId);
        if (!res.ok) return res;
        if (res.value.user_id !== deps.userId) {
          return err(new SessionNotFoundError(input.sessionId));
        }
        // Backfill the session-start mastery baseline for older sessions.
        const snap =
          (res.value.mastery_snapshot as Record<string, unknown> | null) ?? {};
        if (!snap.__baseline && res.value.lesson_id) {
          const baseline = await captureBaseline(res.value.lesson_id);
          if (baseline) {
            const updated = await sessions.updateTeaching({
              id: res.value.id,
              masterySnapshot: { ...snap, __baseline: baseline },
            });
            if (updated.ok) return buildSessionView(updated.value);
          }
        }
        return buildSessionView(res.value);
      }

      if (!input.lessonId) {
        return err(
          new PersistenceError("startOrResume requires lessonId or sessionId"),
        );
      }

      const lessonRes = await lessons.get(input.lessonId);
      if (!lessonRes.ok) {
        return err(new LessonNotFoundError(input.lessonId));
      }
      const lesson = lessonRes.value;
      if (lesson.user_id !== deps.userId) {
        return err(new LessonNotFoundError(input.lessonId));
      }

      const conceptsRes = await lessons.listConcepts(lesson.id);
      if (!conceptsRes.ok) return conceptsRes;
      const first = conceptsRes.value[0];
      if (!first) return err(new PersistenceError("lesson has no concepts"));

      const language = (["en", "hi", "hinglish"] as const).includes(
        lesson.language as "en",
      )
        ? (lesson.language as "en" | "hi" | "hinglish")
        : "en";

      const created = await sessions.create({
        userId: deps.userId,
        title: lesson.title,
        topic: lesson.topic,
        language,
        goal: lesson.objective,
        status: "ACTIVE",
        currentConceptId: first.concept_id ?? null,
      });
      if (!created.ok) return created;

      const now = new Date().toISOString();
      const baseline = await captureBaseline(lesson.id);
      const withTeaching = await sessions.updateTeaching({
        id: created.value.id,
        lessonId: lesson.id,
        planCursor: 0,
        currentAction: null,
        timeBudgetMinutes:
          input.timeBudgetMinutes ?? lesson.estimated_minutes ?? null,
        startedAt: now,
        masterySnapshot: baseline ? { __baseline: baseline } : {},
      });
      if (!withTeaching.ok) return withTeaching;

      await lessons.update({ id: lesson.id, status: "ACTIVE" });
      await lessons.setConceptStatus(first.id, "TEACHING");

      const withDiagnostic = await beginDiagnosticIfNeeded(
        withTeaching.value,
        lesson,
        conceptsRes.value,
      );

      return buildSessionView(withDiagnostic ?? withTeaching.value);
    },

    async getNextStep(input) {
      const loaded = await loadContext(input.sessionId);
      if (!loaded.ok) return loaded;
      const { data, plan, currentConceptId } = loaded.value;

      const { adjustments: personalization } = await loadPersonalization(
        deps.db,
        deps.userId,
      );

      const finishSession = async (): Promise<void> => {
        if (data.session.status === "COMPLETED") return;
        const ending = await captureBaseline(data.lesson.id);
        if (ending) {
          const snapshot =
            (data.session.mastery_snapshot as Record<string, unknown> | null) ??
            {};
          await sessions.updateTeaching({
            id: data.session.id,
            masterySnapshot: { ...snapshot, __ending: ending },
          });
        }
        await sessions.update({
          id: data.session.id,
          status: "COMPLETED",
          endedAt: new Date().toISOString(),
        });
        await lessons.update({ id: data.lesson.id, status: "COMPLETED" });
        // Fresh evidence just landed — refresh the cross-session learning
        // profile so the next session personalises from it. Best-effort.
        try {
          await recomputeLearningProfile(deps.db, deps.userId);
        } catch {
          // a stale profile is fine; it recomputes lazily on next read
        }
      };

      if (
        data.session.status === "COMPLETED" ||
        data.session.plan_cursor >= data.lessonConcepts.length
      ) {
        await finishSession();
        return ok(terminalStep(data));
      }

      const facts = buildPolicyFacts(data);

      // 7.4 — descriptive read of the current learning state. Pure, from the
      // context already loaded. Never decides the action.
      const intelligence = deriveLearningIntelligence(
        buildIntelligenceInput(data, {
          masteryPoints: facts.masteryPoints,
          previousMasteryPoints: facts.previousMasteryPoints,
          confidence: facts.confidence,
          previousConfidence: null,
          formatWeakness: personalization.targetFormatWeakness,
        }),
      );
      const intelligenceView = toIntelligenceView(intelligence);
      const liveStatusFor = (nextKind: string | null) =>
        toLiveStatusView(intelligence, nextKind);

      const maxDetections = Math.max(
        0,
        ...data.misconceptions.map(
          (m) =>
            Number(
              (m.metadata as Record<string, unknown> | null)?.detections ?? 0,
            ) || (Array.isArray(m.evidence) ? m.evidence.length : 0),
        ),
      );
      const engineConcept = buildEngineConcept(
        data.currentConcept,
        plan.concepts,
      );
      const signal = buildEngineSignal(data);
      const src = await sourceContextFor(data);

      const decision = await engine.decide({
        facts,
        concept: engineConcept,
        signal,
        language: data.session.language,
        learningGoal: data.lesson.objective,
        sourceGrounded: Boolean(src),
      });

      await recordDecision(data, decision, currentConceptId);

      const advanceConcept = async (
        decision: ResolvedTeachingDecision,
        override?: Partial<
          Pick<DecisionView, "reason" | "adaptationNarrative">
        >,
      ): Promise<Result<TeachingStepView>> => {
        await lessons.setConceptStatus(data.currentConcept.id, "COMPLETED");
        const nextCursor = data.session.plan_cursor + 1;
        const nextConcept = data.lessonConcepts.find(
          (c) => c.position === nextCursor,
        );
        const done = !nextConcept;
        await sessions.updateTeaching({
          id: data.session.id,
          planCursor: nextCursor,
          currentAction: "MOVE_FORWARD",
          currentConceptId: nextConcept?.concept_id ?? null,
        });
        if (done) {
          await finishSession();
        } else {
          await lessons.setConceptStatus(nextConcept.id, "TEACHING");
        }
        const refreshed = await sessions.get(data.session.id);
        const sessionRow = refreshed.ok ? refreshed.value : data.session;
        const decisionView = {
          ...nextDecisionView({ ...decision, action: "MOVE_FORWARD" }, facts, {
            conceptTitle: engineConcept.title,
            nextConceptTitle: nextConcept?.title ?? null,
          }),
          ...override,
        };
        return ok({
          sessionId: data.session.id,
          decision: decisionView,
          content: null,
          question: null,
          citations: [],
          progress: progressOf(
            sessionRow,
            data.lessonConcepts,
            Math.round(data.timeElapsedMinutes),
          ),
          sessionStatus: done ? "COMPLETED" : "ACTIVE",
          intelligence: null,
          liveStatus: null,
        });
      };

      // ── MOVE_FORWARD ───────────────────────────────────────────────
      if (decision.action === "MOVE_FORWARD") {
        return advanceConcept(decision);
      }

      // ── RECAP ──────────────────────────────────────────────────────
      // A recap is a wind-down, not a teaching step that can repeat. Serve
      // exactly one recap, then complete the session so the learner reaches
      // their report instead of looping (e.g. when the time budget is spent).
      if (decision.action === "RECAP") {
        if (data.session.current_action === "RECAP") {
          await finishSession();
          return ok(terminalStep(data));
        }
        await sessions.updateTeaching({
          id: data.session.id,
          currentAction: "RECAP",
        });
      }

      // ── ASK / ASSESS ───────────────────────────────────────────────
      if (QUESTION_ACTIONS.has(decision.action)) {
        const masteryPoints = data.masteryRow
          ? scoreToPoints(data.masteryRow.mastery_score)
          : 0;
        const seedKind =
          facts.lastQuestionKind ?? questionKindForMastery(masteryPoints);
        let kind = nextQuestionKind(seedKind, decision.difficultyDirection);
        // Adaptive teacher memory: recall is solid, the gap is in application —
        // deliberately seed an applied question instead of another definition.
        if (personalization.shiftTowardApplication && kind === "CONCEPTUAL") {
          kind = "APPLICATION";
        }

        // 9.2 — targeted verification: an unresolved misconception the
        // learner has already received remediation for (it's a persisted row
        // from a prior turn, not one just created this turn) is eligible to
        // have the next question deliberately test it. Selection only; the
        // status transition itself still happens exclusively through the
        // existing 9.1 resolution loop once the learner answers.
        const verifyMisconceptionCategory = selectVerificationTarget(
          data.misconceptions
            .filter((m) => m.status === "ACTIVE" || m.status === "IMPROVING")
            .map((m) => ({
              id: m.id,
              category: m.category,
              status: m.status,
              severity: m.severity,
            })),
        );

        // 10 — spaced review: a RESOLVED misconception isn't permanently
        // forgotten. Only computed when nothing needs live verification —
        // verification (9.2) always takes priority over a spaced review, per
        // `selectQuestionTargetCategory` below.
        const spacedReviewCategory =
          verifyMisconceptionCategory === null
            ? selectSpacedReviewTarget(
                data.misconceptions
                  .filter((m) => m.status === "RESOLVED")
                  .map((m) => ({
                    id: m.id,
                    category: m.category,
                    status: m.status,
                    resolvedAtISO: m.resolved_at,
                    severity: m.severity,
                  })),
              )
            : null;
        const targetMisconceptionCategory = selectQuestionTargetCategory({
          verifyMisconceptionCategory,
          spacedReviewCategory,
        });

        // Priority: deterministic structured assessment when the LLM is
        // unavailable and a safe structured question exists; otherwise the
        // free-form (LLM-evaluated) path; the deterministic free-form template
        // is the last resort.
        const structured =
          deps.llm === null
            ? pickStructuredQuestion({
                conceptKey: engineConcept.key,
                title: engineConcept.title,
                summary: engineConcept.summary,
                targetKind: kind,
                difficulty: engineConcept.difficulty,
                masteryPoints,
                struggling:
                  facts.lastClassification === "INCORRECT" ||
                  facts.incorrectStreak >= 1,
                usedPrompts: data.recentQuestions
                  .filter((q) => q.concept_key === engineConcept.key)
                  .map((q) => q.prompt),
                preferFormat: personalization.targetFormatWeakness,
                verifyMisconceptionCategory: targetMisconceptionCategory,
                graph: buildTemplateGraphContext(
                  data.graphView,
                  engineConcept.key,
                ),
              })
            : null;

        // Learner-safe rationale: only surfaced when the picked question
        // actually landed on the target (never forced, never named).
        // Existing personalization note takes priority if present. The
        // wording distinguishes live verification from a spaced review
        // without ever naming the misconception, its category, or its status.
        const landedTargetCategory =
          structured &&
          targetMisconceptionCategory &&
          misconceptionCategoriesInQuestion(structured.question).includes(
            targetMisconceptionCategory,
          )
            ? targetMisconceptionCategory
            : null;
        const verificationNote = landedTargetCategory
          ? verifyMisconceptionCategory &&
            landedTargetCategory === verifyMisconceptionCategory
            ? "Let's try this from a different angle."
            : "Let's check this one again after some time."
          : null;

        // Deterministic-assessment dead-end guard. With no LLM, free-form
        // answers can only ever be graded UNCERTAIN — so once the structured
        // bank + grounded template for this concept are exhausted, don't trap
        // the learner in ungradeable free-form questions. If they have already
        // cleared at least one structured check here, advance to the next
        // concept instead of stalling.
        if (deps.llm === null && !structured) {
          const structuredQuestionIdsHere = new Set(
            data.recentQuestions
              .filter(
                (q) =>
                  q.concept_key === engineConcept.key &&
                  q.question_format !== "FREE_FORM",
              )
              .map((q) => q.id),
          );
          const clearedStructuredHere = data.recentAnswers.some(
            (a) =>
              a.classification === "CORRECT" &&
              structuredQuestionIdsHere.has(a.question_id),
          );
          if (clearedStructuredHere) {
            return advanceConcept(decision, {
              reason:
                "You've cleared every structured check I have for this concept — moving on.",
              adaptationNarrative: [
                "No deterministic questions left for this concept.",
                "Advancing — you've already answered the structured checks correctly.",
              ],
            });
          }
        }

        if (structured) {
          const sq = structured.question;
          const questionRow = await qa.createQuestion({
            sessionId: data.session.id,
            lessonId: data.lesson.id,
            userId: deps.userId,
            conceptKey: engineConcept.key,
            conceptId: currentConceptId,
            questionKind: sq.kind,
            questionFormat: sq.format,
            difficulty: sq.difficulty,
            prompt: sq.prompt,
            answerKey: sq.data,
            expectedReasoning: null,
            sourceGrounded: false,
            citations: [],
            metadata: {
              generatorSource: structured.origin,
              structured: true,
              ...(sq.context ? { context: sq.context } : {}),
            },
          });
          if (!questionRow.ok) return questionRow;

          await interactions.record({
            sessionId: data.session.id,
            userId: deps.userId,
            conceptId: currentConceptId ?? undefined,
            role: "TEACHER",
            interactionType: "QUESTION",
            content: sq.prompt,
            metadata: {
              conceptKey: engineConcept.key,
              questionId: questionRow.value.id,
              questionKind: sq.kind,
              questionFormat: sq.format,
              action: decision.action,
            },
          });

          await lessons.setConceptStatus(data.currentConcept.id, "ASSESSING");
          await sessions.updateTeaching({
            id: data.session.id,
            currentAction: decision.action,
          });

          return ok({
            sessionId: data.session.id,
            decision: nextDecisionView(decision, facts, {
              conceptTitle: engineConcept.title,
              misconceptionDetectionCount: maxDetections || undefined,
              personalizationNote: personalization.note ?? verificationNote,
            }),
            content: null,
            question: {
              questionId: questionRow.value.id,
              kind: sq.kind,
              difficulty: sq.difficulty,
              prompt: sq.prompt,
              conceptKey: engineConcept.key,
              groundedInSource: false,
              format: sq.format,
              structured: toClientStructured(sq, questionRow.value.id),
            },
            citations: [],
            progress: progressOf(
              data.session,
              data.lessonConcepts,
              Math.round(data.timeElapsedMinutes),
            ),
            sessionStatus: "ACTIVE",
            intelligence: intelligenceView,
            liveStatus: liveStatusFor(sq.kind),
          });
        }

        const generated = await generateQuestion({
          llm: deps.llm,
          concept: {
            key: engineConcept.key,
            title: engineConcept.title,
            summary: engineConcept.summary,
            difficulty: engineConcept.difficulty,
          },
          learnerMasteryPoints: masteryPoints,
          targetKind: kind,
          language: data.session.language,
          sourceContext: src?.text ?? null,
        });
        if (!generated.ok) return generated;
        const q = generated.value;

        const questionRow = await qa.createQuestion({
          sessionId: data.session.id,
          lessonId: data.lesson.id,
          userId: deps.userId,
          conceptKey: engineConcept.key,
          conceptId: currentConceptId,
          questionKind: q.kind,
          questionFormat: "FREE_FORM",
          difficulty: q.difficulty,
          prompt: q.prompt,
          expectedReasoning: q.expectedReasoning,
          sourceGrounded: q.groundedInSource,
          citations: src?.citations ?? [],
          metadata: { generatorSource: q.source },
        });
        if (!questionRow.ok) return questionRow;

        await interactions.record({
          sessionId: data.session.id,
          userId: deps.userId,
          conceptId: currentConceptId ?? undefined,
          role: "TEACHER",
          interactionType: "QUESTION",
          content: q.prompt,
          metadata: {
            conceptKey: engineConcept.key,
            questionId: questionRow.value.id,
            questionKind: q.kind,
            action: decision.action,
          },
        });

        await lessons.setConceptStatus(data.currentConcept.id, "ASSESSING");
        await sessions.updateTeaching({
          id: data.session.id,
          currentAction: decision.action,
        });

        return ok({
          sessionId: data.session.id,
          decision: nextDecisionView(decision, facts, {
            conceptTitle: engineConcept.title,
            misconceptionDetectionCount: maxDetections || undefined,
            personalizationNote: personalization.note,
          }),
          content: null,
          question: {
            questionId: questionRow.value.id,
            kind: q.kind,
            difficulty: q.difficulty,
            prompt: q.prompt,
            conceptKey: engineConcept.key,
            groundedInSource: q.groundedInSource,
            format: "FREE_FORM",
            structured: null,
          },
          citations: src?.citations ?? [],
          progress: progressOf(
            data.session,
            data.lessonConcepts,
            Math.round(data.timeElapsedMinutes),
          ),
          sessionStatus: "ACTIVE",
          intelligence: intelligenceView,
          liveStatus: liveStatusFor(q.kind),
        });
      }

      // ── teaching content actions ───────────────────────────────────
      // Adaptive teacher memory may open a fresh concept with a worked example.
      const nudge = maybeNudgeToExample(decision, personalization, facts);
      const servedDecision = nudge.decision;
      const personalizationNote =
        nudge.note ??
        (personalization.visualBias ? personalization.note : null);

      const content = await generateTeachingContent({
        llm: deps.llm,
        action: servedDecision.action,
        strategy: servedDecision.strategy,
        difficultyDirection: servedDecision.difficultyDirection,
        concept: {
          key: engineConcept.key,
          title: engineConcept.title,
          summary: engineConcept.summary,
          difficulty: engineConcept.difficulty,
        },
        language: data.session.language,
        sourceContext: src?.text ?? null,
        priorMisconceptions: signal.misconceptionSummaries,
      });
      if (!content.ok) return content;

      await interactions.record({
        sessionId: data.session.id,
        userId: deps.userId,
        conceptId: currentConceptId ?? undefined,
        role: "TEACHER",
        interactionType:
          ACTION_TO_INTERACTION_TYPE[servedDecision.action] ?? "EXPLANATION",
        content: content.value.body,
        metadata: {
          conceptKey: engineConcept.key,
          action: servedDecision.action,
          strategy: servedDecision.strategy,
          contentSource: content.value.source,
          ...(nudge.note ? { personalized: "example-open" } : {}),
        },
      });

      if (servedDecision.action === "RETEACH" && currentConceptId) {
        await mastery.upsert({
          userId: deps.userId,
          conceptId: currentConceptId,
          preferredStrategy: servedDecision.strategy,
        });
      }
      await lessons.setConceptStatus(data.currentConcept.id, "TEACHING");
      await sessions.updateTeaching({
        id: data.session.id,
        currentAction: servedDecision.action,
      });

      // Deterministic visual: no model output touches the renderer. The visual
      // intent names WHY this representation (educational, learner-facing); the
      // resolver picks the concrete directive from that intent's signal.
      const visualIntent = deriveVisualIntent(
        visualIntentContext(
          facts,
          servedDecision.action,
          personalization.visualBias,
        ),
      );
      const resolvedVisual = resolveVisual({
        conceptKey: engineConcept.key,
        title: engineConcept.title,
        summary: content.value.body || engineConcept.summary,
        action: servedDecision.action,
        strategy: servedDecision.strategy,
        learnerSignal: visualIntent.signal,
      });
      const showVisual =
        resolvedVisual.source !== "text" ||
        servedDecision.action === "VISUALIZE";

      return ok({
        sessionId: data.session.id,
        decision: nextDecisionView(servedDecision, facts, {
          conceptTitle: engineConcept.title,
          misconceptionDetectionCount: maxDetections || undefined,
          personalizationNote:
            personalizationNote ??
            (visualIntent.personalized ? visualIntent.rationale : null),
        }),
        content: {
          title: content.value.title,
          body: content.value.body,
          conceptKey: engineConcept.key,
          groundedInSource: content.value.groundedInSource,
          visual: showVisual ? resolvedVisual.directive : null,
          visualRationale: showVisual ? visualIntent.rationale : null,
          visualIntent: showVisual ? visualIntent.intent : null,
        },
        question: null,
        citations: src?.citations ?? [],
        progress: progressOf(
          data.session,
          data.lessonConcepts,
          Math.round(data.timeElapsedMinutes),
        ),
        sessionStatus: "ACTIVE",
        intelligence: intelligenceView,
        liveStatus: liveStatusFor(null),
      });
    },

    async submitAnswer(input) {
      const loaded = await loadContext(input.sessionId);
      if (!loaded.ok) return loaded;
      const { data, plan } = loaded.value;

      const questionRes = await qa.getQuestion(input.questionId);
      if (!questionRes.ok) return questionRes;
      const question = questionRes.value;
      if (
        question.user_id !== deps.userId ||
        question.session_id !== data.session.id
      ) {
        return err(new SessionNotFoundError(input.sessionId));
      }

      const concept =
        data.lessonConcepts.find(
          (c) => c.concept_key === question.concept_key,
        ) ?? data.currentConcept;
      const conceptId = concept.concept_id;
      if (!conceptId) {
        return err(
          new PersistenceError("teaching concept has no persisted concept id"),
        );
      }

      const answerInteraction = await interactions.record({
        sessionId: data.session.id,
        userId: deps.userId,
        conceptId,
        role: "STUDENT",
        interactionType: "ANSWER",
        content: input.answerText,
        metadata: {
          conceptKey: concept.concept_key,
          questionId: question.id,
        },
      });
      if (!answerInteraction.ok) return answerInteraction;

      const src = await sourceContextFor({
        ...data,
        currentConcept: concept,
      });

      // Structured questions are graded by pure deterministic code; free-form
      // questions go to the LLM evaluator (or its conservative fallback).
      let evaluation: RichAnswerEvaluation & {
        source: "ai" | "structured" | "fallback";
        misconceptionInsight?: { label: string; explanation: string } | null;
        breakdown?: EvaluationView["breakdown"];
      };

      if (question.question_format !== "FREE_FORM") {
        const structuredQ = structuredQuestionFromRow(question);
        if (!structuredQ) {
          return err(
            new PersistenceError("stored structured question is not valid", {
              cause: question.id,
            }),
          );
        }
        let parsedAnswer: unknown;
        try {
          parsedAnswer = JSON.parse(input.answerText);
        } catch {
          return err(new ValidationError("structured answer is not JSON", []));
        }
        const answer = structuredAnswerSchema.safeParse(parsedAnswer);
        if (!answer.success) {
          return err(
            new ValidationError(
              "structured answer failed validation",
              answer.error.issues,
            ),
          );
        }
        const graded = gradeStructuredAnswer(structuredQ, answer.data);
        evaluation = {
          ...graded,
          misconceptionInsight: graded.misconceptionInsight,
          breakdown: graded.breakdown,
        };
      } else {
        const evaluated = await evaluateAnswer({
          llm: deps.llm,
          question: {
            prompt: question.prompt,
            expectedReasoning: question.expected_reasoning,
            kind: question.question_kind,
            difficulty: question.difficulty,
          },
          answerText: input.answerText,
          concept: { key: concept.concept_key, title: concept.title },
          language: data.session.language,
          sourceContext: src?.text ?? null,
        });
        if (!evaluated.ok) return evaluated;
        evaluation = {
          ...evaluated.value,
          misconceptionInsight: null,
          breakdown: null,
        };
      }

      // 10 — includes RESOLVED rows (not just ACTIVE/IMPROVING) so a wrong
      // answer that matches an already-RESOLVED misconception's category
      // reactivates that SAME row through the existing strengthen() path
      // instead of matchMisconception() finding no match and creating a
      // duplicate. `resolutionCandidates` below re-filters to ACTIVE/
      // IMPROVING, so 9.1's forward resolution loop is unaffected.
      const existingForConcept = data.misconceptions;
      const existing: ExistingMisconception[] = existingForConcept.map((m) => ({
        id: m.id,
        category: m.category,
        description: m.description,
        confidence: m.confidence,
        status: m.status,
        detections:
          Number(
            (m.metadata as Record<string, unknown> | null)?.detections ?? 0,
          ) || (Array.isArray(m.evidence) ? m.evidence.length : 0),
      }));

      const strategyUsed = currentStrategy(data);
      const outcome = applyInteractionOutcome({
        concept: data.masteryRow
          ? {
              masteryScore: data.masteryRow.mastery_score,
              confidenceScore: data.masteryRow.confidence_score,
              attemptCount: data.masteryRow.attempt_count,
              correctCount: data.masteryRow.correct_count,
              incorrectCount: data.masteryRow.incorrect_count,
              misconceptionCount: data.masteryRow.misconception_count,
              preferredStrategy: strategyUsed,
            }
          : null,
        evaluation,
        questionDifficulty: question.difficulty,
        strategyUsed,
        existingMisconceptions: existing,
      });

      // Persist the answer WITH the resulting mastery delta embedded, so the
      // mastery trajectory reads real evidence directly (no replay needed).
      await qa.recordAnswer({
        questionId: question.id,
        sessionId: data.session.id,
        userId: deps.userId,
        responseText: input.answerText,
        classification: evaluation.classification,
        correctnessScore: evaluation.correctnessScore,
        evaluation: {
          ...evaluation,
          masteryDelta: {
            before: outcome.delta.masteryBefore,
            after: outcome.delta.masteryAfter,
            delta: outcome.delta.masteryAfter - outcome.delta.masteryBefore,
            reason: outcome.delta.reason,
          },
          questionFormat: question.question_format,
          questionDifficulty: question.difficulty,
        },
        responseTimeMs: input.responseTimeMs ?? null,
      });

      await interactions.record({
        sessionId: data.session.id,
        userId: deps.userId,
        conceptId,
        role: "TEACHER",
        interactionType: "FEEDBACK",
        content: evaluation.feedback,
        metadata: {
          conceptKey: concept.concept_key,
          classification: evaluation.classification,
          correctnessScore: evaluation.correctnessScore,
          masteryBefore: outcome.delta.masteryBefore,
          masteryAfter: outcome.delta.masteryAfter,
        },
      });

      const masteryWrite = await mastery.upsert({
        userId: deps.userId,
        conceptId,
        masteryScore: outcome.masteryPatch.masteryScore,
        confidenceScore: outcome.masteryPatch.confidenceScore,
        attemptCount: outcome.masteryPatch.attemptCount,
        correctCount: outcome.masteryPatch.correctCount,
        incorrectCount: outcome.masteryPatch.incorrectCount,
        misconceptionCount: outcome.masteryPatch.misconceptionCount,
        status: outcome.masteryPatch.status,
        preferredStrategy: outcome.masteryPatch.preferredStrategy,
        lastAttemptAt: outcome.masteryPatch.lastAttemptAt,
        lastCorrectAt: outcome.masteryPatch.lastCorrectAt,
        evidenceSummary: outcome.masteryPatch.evidenceSummary,
      });
      if (!masteryWrite.ok) {
        return err(
          new PersistenceError("failed to persist mastery", {
            cause: masteryWrite.error,
          }),
        );
      }

      for (const create of outcome.misconceptionPlan.creates) {
        await misconceptions.record({
          userId: deps.userId,
          conceptId,
          sessionId: data.session.id,
          interactionId: answerInteraction.value.id,
          category: create.category,
          description: create.description,
          severity: create.severity,
          confidence: create.confidence,
          evidence: evaluation.evidenceQuote
            ? [
                {
                  quote: evaluation.evidenceQuote,
                  at: answerInteraction.value.id,
                },
              ]
            : [],
          metadata: { detections: 1, conceptKey: concept.concept_key },
        });
      }
      for (const strengthen of outcome.misconceptionPlan.strengthens) {
        await misconceptions.strengthen({
          id: strengthen.id,
          confidence: strengthen.newConfidence,
          detections: strengthen.newDetections,
          severity: strengthen.escalateSeverity ? "HIGH" : undefined,
          evidenceEntry: evaluation.evidenceQuote
            ? { quote: evaluation.evidenceQuote }
            : undefined,
        });
      }

      // ── misconception resolution ────────────────────────────────────
      // Positive evidence a misconception has been overcome. Purely additive
      // to creates/strengthens above — never replaces matchMisconception() or
      // planMisconceptionUpdates(), and never decided by an LLM. A correct
      // structured answer that specifically avoided a known trap can reach
      // RESOLVED (after two genuinely distinct verified checks); a correct
      // free-form answer is weaker, undirected evidence capped at IMPROVING.
      let resolutionOutcome: ResolutionOutcome | null = null;
      const resolutionCandidates = existingForConcept.filter(
        (m) => m.status === "ACTIVE" || m.status === "IMPROVING",
      );
      if (resolutionCandidates.length > 0) {
        const isStructured = question.question_format !== "FREE_FORM";
        const structuredQForResolution = isStructured
          ? structuredQuestionFromRow(question)
          : null;
        const questionMisconceptionCategories = structuredQForResolution
          ? misconceptionCategoriesInQuestion(structuredQForResolution)
          : [];
        for (const row of resolutionCandidates) {
          const meta = (row.metadata as Record<string, unknown> | null) ?? {};
          const found = evaluateMisconceptionResolution({
            misconception: {
              id: row.id,
              category: row.category,
              status: row.status,
              clearedChecks: Number(meta.clearedChecks ?? 0),
              lastVerifiedQuestionId:
                typeof meta.lastVerifiedQuestionId === "string"
                  ? meta.lastVerifiedQuestionId
                  : null,
            },
            isStructured,
            classification: evaluation.classification,
            questionMisconceptionCategories,
            questionId: question.id,
          });
          if (found) {
            resolutionOutcome ??= found;
            await misconceptions.updateStatus(found.id, found.statusAfter, {
              clearedChecks: found.clearedChecks,
              lastVerifiedQuestionId: found.lastVerifiedQuestionId,
            });
          }
        }
      }

      // Build the "Lumen noticed a pattern" detail from the now-persisted row —
      // whichever misconception this answer touched (created or strengthened).
      let misconceptionDetail: EvaluationView["misconception"] = null;
      const touchedCategory =
        outcome.misconceptionPlan.creates[0]?.category ??
        existing.find((e) =>
          outcome.misconceptionPlan.strengthens.some((s) => s.id === e.id),
        )?.category ??
        evaluation.misconceptionCandidates?.[0]?.category ??
        null;
      const strengthenedId =
        outcome.misconceptionPlan.strengthens[0]?.id ?? null;
      if (touchedCategory || strengthenedId) {
        const rowsRes = await misconceptions.listForConcept(
          deps.userId,
          conceptId,
        );
        const rows = rowsRes.ok ? rowsRes.value : [];
        const row =
          rows.find((r) => r.id === strengthenedId) ??
          rows.find(
            (r) =>
              touchedCategory != null &&
              normalizeCategory(r.category) ===
                normalizeCategory(touchedCategory),
          ) ??
          null;
        if (row) {
          const detections =
            Number(
              (row.metadata as Record<string, unknown> | null)?.detections ?? 0,
            ) || (Array.isArray(row.evidence) ? row.evidence.length : 1);
          misconceptionDetail = buildMisconceptionDetail({
            category: row.category,
            description: row.description,
            severity: row.severity,
            status: row.status,
            firstDetectedAtISO: new Date(row.first_detected_at).toISOString(),
            detectionCount: detections,
            isRecurrence: outcome.misconceptionPlan.strengthens.length > 0,
            insight: evaluation.misconceptionInsight ?? null,
          });
        }
      }

      const snapshot = {
        ...((data.session.mastery_snapshot as Record<string, unknown> | null) ??
          {}),
        [concept.concept_key]: {
          masteryPoints: outcome.delta.masteryAfter,
          previousMasteryPoints: outcome.delta.masteryBefore,
          confidence: outcome.masteryPatch.confidenceScore,
          band: outcome.delta.masteryBandAfter,
          status: outcome.masteryPatch.status,
        },
      };
      await sessions.updateTeaching({
        id: data.session.id,
        masterySnapshot: snapshot,
      });

      // ── decide the adaptive next step ──────────────────────────────
      const reloaded = await loadContext(input.sessionId);
      if (!reloaded.ok) return reloaded;
      const next = reloaded.value;
      const { adjustments: personalization } = await loadPersonalization(
        deps.db,
        deps.userId,
      );
      const nextFacts = buildPolicyFacts(next.data);
      const nextDecision = await engine.decide({
        facts: nextFacts,
        concept: buildEngineConcept(next.data.currentConcept, plan.concepts),
        signal: buildEngineSignal(next.data),
        language: next.data.session.language,
        learningGoal: next.data.lesson.objective,
        sourceGrounded: next.data.lesson.source_grounded,
      });
      await recordDecision(next.data, nextDecision, next.currentConceptId);

      // ── 7.4 real-time learning intelligence ────────────────────────
      // Compare the learning state before and after this answer and emit at
      // most one meaningful educational event. Pure, from state already loaded.
      const sameConcept =
        concept.concept_key === data.currentConcept.concept_key &&
        next.data.currentConcept.concept_key === concept.concept_key;

      let intelligenceView: InteractionResultView["intelligence"] = null;
      let learningEventView: InteractionResultView["learningEvent"] = null;
      let resultLiveStatus: InteractionResultView["liveStatus"] = null;

      if (sameConcept) {
        const beforeIntel = deriveLearningIntelligence(
          buildIntelligenceInput(data, {
            masteryPoints: outcome.delta.masteryBefore,
            previousMasteryPoints: data.previousMasteryPoints,
            confidence: outcome.delta.confidenceBefore,
            previousConfidence: null,
            formatWeakness: personalization.targetFormatWeakness,
          }),
        );
        const afterIntel = deriveLearningIntelligence(
          buildIntelligenceInput(next.data, {
            masteryPoints: outcome.delta.masteryAfter,
            previousMasteryPoints: outcome.delta.masteryBefore,
            confidence: outcome.delta.confidenceAfter,
            previousConfidence: outcome.delta.confidenceBefore,
            formatWeakness: personalization.targetFormatWeakness,
          }),
        );
        const lastBefore = [...data.recentAnswers].sort((a, b) =>
          a.created_at < b.created_at ? -1 : 1,
        )[data.recentAnswers.length - 1];
        const before: EventSnapshot = {
          intelligence: beforeIntel,
          repeatedMisconceptionCount: repeatedMisconceptionCount(
            data.misconceptions,
          ),
          interventionSinceBefore: false,
          lastClassification: lastBefore?.classification ?? null,
          misconceptionStatus: resolutionOutcome
            ? (resolutionOutcome.statusBefore as
                "ACTIVE" | "IMPROVING" | "RESOLVED")
            : "none",
        };
        const after: EventSnapshot = {
          intelligence: afterIntel,
          repeatedMisconceptionCount: repeatedMisconceptionCount(
            next.data.misconceptions,
          ),
          interventionSinceBefore: isInterventionAction(
            data.session.current_action,
          ),
          lastClassification: evaluation.classification,
          misconceptionStatus: resolutionOutcome
            ? resolutionOutcome.statusAfter
            : "none",
        };
        intelligenceView = toIntelligenceView(afterIntel);
        const event = deriveLearningEvent(before, after);
        learningEventView = event ? toLearningEventView(event) : null;
        resultLiveStatus = toLiveStatusView(afterIntel, null);
      }

      // How Lumen will show this concept next — computed here so the adaptive
      // moment can say "here's how the picture changes". Only when the next
      // step actually teaches (not a question, not a jump to a new concept).
      let nextRepresentation: InteractionResultView["nextRepresentation"] =
        null;
      if (
        !QUESTION_ACTIONS.has(nextDecision.action) &&
        nextDecision.action !== "MOVE_FORWARD"
      ) {
        const nextEngineConcept = buildEngineConcept(
          next.data.currentConcept,
          plan.concepts,
        );
        const nextVisualIntent = deriveVisualIntent(
          visualIntentContext(
            nextFacts,
            nextDecision.action,
            personalization.visualBias,
          ),
        );
        const nextResolved = resolveVisual({
          conceptKey: nextEngineConcept.key,
          title: nextEngineConcept.title,
          summary: nextEngineConcept.summary,
          action: nextDecision.action,
          strategy: nextDecision.strategy,
          learnerSignal: nextVisualIntent.signal,
        });
        if (
          nextResolved.source !== "text" ||
          nextDecision.action === "VISUALIZE"
        ) {
          nextRepresentation = {
            mode: nextResolved.directive.mode,
            modeLabel: visualModeLabel(nextResolved.directive.mode),
            intentLabel: visualIntentLabel(nextVisualIntent.intent),
            rationale: nextVisualIntent.rationale,
          };
        }
      }

      return ok({
        sessionId: data.session.id,
        evaluation: {
          classification: evaluation.classification,
          correctnessScore: evaluation.correctnessScore,
          confidence: evaluation.confidence,
          reasoningQuality: evaluation.reasoningQuality,
          missingConcepts: evaluation.missingConcepts,
          feedback: evaluation.feedback,
          source: evaluation.source,
          misconceptionInsight: evaluation.misconceptionInsight ?? null,
          misconception: misconceptionDetail,
          breakdown: evaluation.breakdown ?? null,
        },
        learnerUpdate: {
          conceptKey: concept.concept_key,
          masteryBefore: outcome.delta.masteryBefore,
          masteryAfter: outcome.delta.masteryAfter,
          masteryBand: outcome.delta.masteryBandAfter,
          confidenceBefore: outcome.delta.confidenceBefore,
          confidenceAfter: outcome.delta.confidenceAfter,
          reason: outcome.delta.reason,
          newMisconceptions: outcome.misconceptionPlan.creates.length,
          reinforcedMisconceptions:
            outcome.misconceptionPlan.strengthens.length,
          repeatedMisconception: outcome.hasRepeatedMisconception,
        },
        nextDecision: nextDecisionView(nextDecision, nextFacts, {
          conceptTitle: next.data.currentConcept.title,
          misconceptionDetectionCount: misconceptionDetail?.detectionCount,
          personalizationNote: personalization.note,
        }),
        nextRepresentation,
        progress: progressOf(
          next.data.session,
          next.data.lessonConcepts,
          Math.round(next.data.timeElapsedMinutes),
        ),
        sessionStatus: next.data.session.status,
        intelligence: intelligenceView,
        learningEvent: learningEventView,
        liveStatus: resultLiveStatus,
      });
    },

    async submitDiagnostic(input) {
      const sessionRes = await sessions.get(input.sessionId);
      if (!sessionRes.ok) return sessionRes;
      const session = sessionRes.value;
      if (session.user_id !== deps.userId) {
        return err(new SessionNotFoundError(input.sessionId));
      }

      const snap =
        (session.mastery_snapshot as Record<string, unknown> | null) ?? {};
      const stored = parseStoredDiagnosticState(snap.__diagnostic);

      // Nothing pending, or already completed — idempotent replay. Never
      // re-grades, re-seeds mastery, or repeats the diagnostic.
      if (!stored || stored.status === "COMPLETED") {
        const summary = stored?.summary;
        return ok({
          sessionId: session.id,
          strongConceptKeys: summary?.strong ?? [],
          developingConceptKeys: summary?.developing ?? [],
          weakConceptKeys: summary?.weak ?? [],
          alreadyCompleted: true,
        });
      }

      if (!session.lesson_id) {
        return err(new SessionNotFoundError(input.sessionId));
      }
      const conceptsRes = await lessons.listConcepts(session.lesson_id);
      if (!conceptsRes.ok) return conceptsRes;
      const conceptIdByKey = new Map(
        conceptsRes.value.map((c) => [c.concept_key, c.concept_id]),
      );

      const set = toDiagnosticQuestionSet(stored);
      const result = scoreDiagnosticQuestionSet(set, input.answers);

      // Existing mastery, scoped to this lesson's concepts only — never a
      // global read. Diagnostic evidence can only raise this floor.
      const masteryRes = await mastery.listForUser(deps.userId);
      const masteryByConceptId = new Map(
        (masteryRes.ok ? masteryRes.value : []).map((m) => [m.concept_id, m]),
      );
      const existingByConceptKey: Record<string, CurrentConceptState | null> =
        {};
      for (const c of conceptsRes.value) {
        const m = c.concept_id ? masteryByConceptId.get(c.concept_id) : null;
        existingByConceptKey[c.concept_key] = m
          ? {
              masteryScore: m.mastery_score,
              confidenceScore: m.confidence_score,
              attemptCount: m.attempt_count,
              correctCount: m.correct_count,
              incorrectCount: m.incorrect_count,
              misconceptionCount: m.misconception_count,
              preferredStrategy:
                m.preferred_strategy as CurrentConceptState["preferredStrategy"],
            }
          : null;
      }

      // Never routed through applyInteractionOutcome — diagnostic evidence
      // never touches ordinary teaching-interaction bookkeeping and never
      // creates/strengthens a confirmed misconception.
      const seeded = seedMasteryFromDiagnostic({
        result,
        existingByConceptKey,
      });
      const upserts = buildMasteryUpsertInputs(
        deps.userId,
        conceptIdByKey,
        seeded.seeds,
      );
      for (const upsertInput of upserts) {
        await mastery.upsert(upsertInput);
      }

      const now = new Date().toISOString();
      await assessments.complete({
        id: stored.assessmentId,
        status: "COMPLETED",
        score:
          result.strongConceptKeys.length +
          result.developingConceptKeys.length * 0.5,
        maxScore: set.items.length,
        completedAt: now,
      });

      const completedState = markDiagnosticCompleted(stored, result, now);
      await sessions.updateTeaching({
        id: session.id,
        currentAction: null,
        masterySnapshot: { ...snap, __diagnostic: completedState },
      });

      return ok({
        sessionId: session.id,
        strongConceptKeys: result.strongConceptKeys,
        developingConceptKeys: result.developingConceptKeys,
        weakConceptKeys: result.weakConceptKeys,
        alreadyCompleted: false,
      });
    },
  };
}
