import "server-only";

import type { LLMProvider } from "@/lib/ai/types";
import {
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
import type { InteractionType } from "@/lib/db/enums";
import {
  LessonNotFoundError,
  PersistenceError,
  SessionNotFoundError,
} from "@/lib/errors";
import type { Retriever } from "@/lib/rag";
import { err, ok, type Result } from "@/lib/result";
import { generateQuestion, questionKindForMastery } from "@/lib/assessment";
import { evaluateAnswer } from "@/lib/assessment/evaluator";
import {
  applyInteractionOutcome,
  type ExistingMisconception,
} from "@/lib/learner";
import {
  createTeachingEngine,
  generateTeachingContent,
  masteryBandLabel,
  nextQuestionKind,
  scoreToPoints,
  type ResolvedTeachingDecision,
} from "@/lib/teaching";
import { lessonPlanSchema, type LessonPlan } from "@/lib/teaching/contracts";
import { getKnowledgeGraph, graphSignalFromView } from "@/lib/graph";
import { resolveVisual, visualSignalFromState } from "@/lib/visuals";

import {
  buildEngineConcept,
  buildEngineSignal,
  buildPolicyFacts,
  currentStrategy,
  type SessionContextData,
} from "./context";
import {
  buildSourceContextText,
  toTeachingCitations,
  type TeachingCitation,
} from "./citations";
import type {
  DecisionView,
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
  const engine = createTeachingEngine({ llm: deps.llm });

  /** Snapshot each lesson concept's current mastery (0–100) at session start. */
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
    };
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
    try {
      const graphRes = await getKnowledgeGraph(deps.db, deps.userId, {
        lessonId: lesson.id,
      });
      if (graphRes.ok && graphRes.value.edges.length > 0) {
        graphSignal = graphSignalFromView(
          graphRes.value,
          currentConcept.concept_key,
        );
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
    });
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

      return buildSessionView(withTeaching.value);
    },

    async getNextStep(input) {
      const loaded = await loadContext(input.sessionId);
      if (!loaded.ok) return loaded;
      const { data, plan, currentConceptId } = loaded.value;

      if (
        data.session.status === "COMPLETED" ||
        data.session.plan_cursor >= data.lessonConcepts.length
      ) {
        return ok(terminalStep(data));
      }

      const facts = buildPolicyFacts(data);
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

      // ── MOVE_FORWARD ───────────────────────────────────────────────
      if (decision.action === "MOVE_FORWARD") {
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
          await sessions.update({
            id: data.session.id,
            status: "COMPLETED",
            endedAt: new Date().toISOString(),
          });
          await lessons.update({ id: data.lesson.id, status: "COMPLETED" });
        } else {
          await lessons.setConceptStatus(nextConcept.id, "TEACHING");
        }
        const refreshed = await sessions.get(data.session.id);
        const sessionRow = refreshed.ok ? refreshed.value : data.session;
        return ok({
          sessionId: data.session.id,
          decision: toDecisionView(decision),
          content: null,
          question: null,
          citations: [],
          progress: progressOf(
            sessionRow,
            data.lessonConcepts,
            Math.round(data.timeElapsedMinutes),
          ),
          sessionStatus: done ? "COMPLETED" : "ACTIVE",
        });
      }

      // ── ASK / ASSESS ───────────────────────────────────────────────
      if (QUESTION_ACTIONS.has(decision.action)) {
        const masteryPoints = data.masteryRow
          ? scoreToPoints(data.masteryRow.mastery_score)
          : 0;
        const seedKind =
          facts.lastQuestionKind ?? questionKindForMastery(masteryPoints);
        const kind = nextQuestionKind(seedKind, decision.difficultyDirection);

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
          decision: toDecisionView(decision),
          content: null,
          question: {
            questionId: questionRow.value.id,
            kind: q.kind,
            difficulty: q.difficulty,
            prompt: q.prompt,
            conceptKey: engineConcept.key,
            groundedInSource: q.groundedInSource,
          },
          citations: src?.citations ?? [],
          progress: progressOf(
            data.session,
            data.lessonConcepts,
            Math.round(data.timeElapsedMinutes),
          ),
          sessionStatus: "ACTIVE",
        });
      }

      // ── teaching content actions ───────────────────────────────────
      const content = await generateTeachingContent({
        llm: deps.llm,
        action: decision.action,
        strategy: decision.strategy,
        difficultyDirection: decision.difficultyDirection,
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
          ACTION_TO_INTERACTION_TYPE[decision.action] ?? "EXPLANATION",
        content: content.value.body,
        metadata: {
          conceptKey: engineConcept.key,
          action: decision.action,
          strategy: decision.strategy,
          contentSource: content.value.source,
        },
      });

      if (decision.action === "RETEACH" && currentConceptId) {
        await mastery.upsert({
          userId: deps.userId,
          conceptId: currentConceptId,
          preferredStrategy: decision.strategy,
        });
      }
      await lessons.setConceptStatus(data.currentConcept.id, "TEACHING");
      await sessions.updateTeaching({
        id: data.session.id,
        currentAction: decision.action,
      });

      // Deterministic visual: no model output touches the renderer.
      const visualSignal = visualSignalFromState({
        masteryPoints: facts.masteryPoints,
        lastClassification: facts.lastClassification,
        repeatedMisconception: facts.repeatedMisconception,
        incorrectStreak: facts.incorrectStreak,
        attempts: facts.attempts,
      });
      const resolvedVisual = resolveVisual({
        conceptKey: engineConcept.key,
        title: engineConcept.title,
        summary: content.value.body || engineConcept.summary,
        action: decision.action,
        strategy: decision.strategy,
        learnerSignal: visualSignal,
      });
      const showVisual =
        resolvedVisual.source !== "text" || decision.action === "VISUALIZE";

      return ok({
        sessionId: data.session.id,
        decision: toDecisionView(decision),
        content: {
          title: content.value.title,
          body: content.value.body,
          conceptKey: engineConcept.key,
          groundedInSource: content.value.groundedInSource,
          visual: showVisual ? resolvedVisual.directive : null,
          visualRationale: showVisual ? resolvedVisual.rationale : null,
        },
        question: null,
        citations: src?.citations ?? [],
        progress: progressOf(
          data.session,
          data.lessonConcepts,
          Math.round(data.timeElapsedMinutes),
        ),
        sessionStatus: "ACTIVE",
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
      const evaluation = evaluated.value;

      await qa.recordAnswer({
        questionId: question.id,
        sessionId: data.session.id,
        userId: deps.userId,
        responseText: input.answerText,
        classification: evaluation.classification,
        correctnessScore: evaluation.correctnessScore,
        evaluation,
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
        },
      });

      const existingForConcept = data.misconceptions.filter(
        (m) => m.status !== "RESOLVED",
      );
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

      return ok({
        sessionId: data.session.id,
        evaluation: {
          classification: evaluation.classification,
          correctnessScore: evaluation.correctnessScore,
          confidence: evaluation.confidence,
          reasoningQuality: evaluation.reasoningQuality,
          missingConcepts: evaluation.missingConcepts,
          feedback: evaluation.feedback,
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
        nextDecision: toDecisionView(nextDecision),
        progress: progressOf(
          next.data.session,
          next.data.lessonConcepts,
          Math.round(next.data.timeElapsedMinutes),
        ),
        sessionStatus: next.data.session.status,
      });
    },
  };
}
