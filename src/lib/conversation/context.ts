import {
  createInteractionStore,
  createLessonStore,
  createMasteryStore,
  createMisconceptionStore,
  createSessionStore,
  type DbClient,
  type InteractionRow,
} from "@/lib/db/repositories";
import { SessionNotFoundError } from "@/lib/errors";
import { err, ok, type Result } from "@/lib/result";
import { masteryBandLabel, scoreToPoints } from "@/lib/teaching/mastery";
import type { ExistingMisconception } from "@/lib/learner";

/**
 * CONVERSATIONAL CONTEXT — deliberately compact.
 *
 * A dedicated, small view of the session for the conversational teacher. It is
 * NOT the full learner history: only the current concept, the live learner
 * state, active misconceptions, and the last few conversational turns. Loaded
 * standalone from the repositories so the conversation service never reaches
 * into the teaching orchestrator's internals.
 */

const RECENT_CONVERSATION_TURNS = 4;

export interface ConversationTurn {
  role: "learner" | "teacher";
  text: string;
}

export interface ConversationContext {
  sessionId: string;
  userId: string;
  lesson: {
    id: string;
    title: string;
    objective: string;
    language: string;
    sourceGrounded: boolean;
    documentId: string | null;
  };
  concept: {
    id: string | null;
    key: string;
    title: string;
    summary: string;
    /** The teaching action currently in effect (EXPLAIN, RETEACH, ASK, …). */
    action: string | null;
    difficulty: number;
    importance: number;
  };
  learner: {
    masteryPoints: number;
    band: string;
    confidence: number;
    attempts: number;
    lastAnswerClassification: string | null;
  };
  /** Non-resolved misconceptions on the current concept. */
  misconceptions: ExistingMisconception[];
  /** Last few conversational turns (oldest → newest). */
  recentTurns: ConversationTurn[];
}

function conversationTurnsFrom(
  interactions: InteractionRow[],
): ConversationTurn[] {
  return interactions
    .filter((i) => {
      const meta = i.metadata as Record<string, unknown> | null;
      return meta?.kind === "conversation" && i.content.trim().length > 0;
    })
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
    .slice(-RECENT_CONVERSATION_TURNS * 2)
    .map((i) => ({
      role: i.role === "STUDENT" ? ("learner" as const) : ("teacher" as const),
      text: i.content.slice(0, 600),
    }))
    .slice(-RECENT_CONVERSATION_TURNS);
}

function detectionsOf(metadata: unknown, evidence: unknown): number {
  const n = Number(
    (metadata as Record<string, unknown> | null)?.detections ?? 0,
  );
  if (Number.isFinite(n) && n > 0) return n;
  return Array.isArray(evidence) ? Math.max(1, evidence.length) : 1;
}

export async function loadConversationContext(
  db: DbClient,
  userId: string,
  sessionId: string,
): Promise<Result<ConversationContext>> {
  const sessions = createSessionStore(db);
  const lessons = createLessonStore(db);
  const mastery = createMasteryStore(db);
  const misconceptions = createMisconceptionStore(db);
  const interactions = createInteractionStore(db);

  const sessionRes = await sessions.get(sessionId);
  if (!sessionRes.ok) return err(new SessionNotFoundError(sessionId));
  const session = sessionRes.value;
  if (session.user_id !== userId || !session.lesson_id) {
    return err(new SessionNotFoundError(sessionId));
  }

  const [lessonRes, conceptsRes, interactionsRes] = await Promise.all([
    lessons.get(session.lesson_id),
    lessons.listConcepts(session.lesson_id),
    interactions.listForSession(sessionId, { limit: 60 }),
  ]);
  if (!lessonRes.ok) return lessonRes;
  const lesson = lessonRes.value;
  const concepts = conceptsRes.ok ? conceptsRes.value : [];
  if (concepts.length === 0) {
    return err(new SessionNotFoundError(sessionId));
  }

  const cursor = Math.min(session.plan_cursor, concepts.length - 1);
  const concept = concepts.find((c) => c.position === cursor) ?? concepts[0];

  const [masteryRes, misconRes] = await Promise.all([
    concept.concept_id
      ? mastery.get(userId, concept.concept_id)
      : Promise.resolve(ok(null)),
    concept.concept_id
      ? misconceptions.listForConcept(userId, concept.concept_id)
      : Promise.resolve(ok([])),
  ]);

  const masteryRow =
    masteryRes.ok && masteryRes.value ? masteryRes.value : null;
  const masteryPoints = masteryRow
    ? scoreToPoints(masteryRow.mastery_score)
    : 0;

  const sessionInteractions = interactionsRes.ok ? interactionsRes.value : [];
  const lastAnswer = sessionInteractions
    .filter((i) => i.role === "STUDENT" && i.interaction_type === "ANSWER")
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
    .at(-1);
  const lastAnswerClassification =
    (lastAnswer?.metadata as Record<string, unknown> | null)?.classification ??
    null;

  const activeMisconceptions: ExistingMisconception[] = (
    misconRes.ok ? misconRes.value : []
  )
    .filter((m) => m.status !== "RESOLVED")
    .map((m) => ({
      id: m.id,
      category: m.category,
      description: m.description,
      confidence: m.confidence,
      status: m.status,
      detections: detectionsOf(m.metadata, m.evidence),
    }));

  return ok({
    sessionId,
    userId,
    lesson: {
      id: lesson.id,
      title: lesson.title,
      objective: lesson.objective,
      language: lesson.language,
      sourceGrounded: lesson.source_grounded,
      documentId: lesson.document_id,
    },
    concept: {
      id: concept.concept_id,
      key: concept.concept_key,
      title: concept.title,
      summary: concept.summary,
      action: session.current_action,
      difficulty: concept.difficulty,
      importance: concept.importance,
    },
    learner: {
      masteryPoints,
      band: masteryBandLabel(masteryPoints),
      confidence: masteryRow?.confidence_score ?? 0,
      attempts: masteryRow?.attempt_count ?? 0,
      lastAnswerClassification:
        typeof lastAnswerClassification === "string"
          ? lastAnswerClassification
          : null,
    },
    misconceptions: activeMisconceptions,
    recentTurns: conversationTurnsFrom(sessionInteractions),
  });
}
