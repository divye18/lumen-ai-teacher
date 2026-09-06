import "server-only";

import type {
  CurriculumStore,
  LessonStore,
  SessionStore,
} from "@/lib/db/repositories";
import { SESSION_STATUSES } from "@/lib/db/enums";
import { ok, type Result } from "@/lib/result";

/**
 * CURRICULUM CONTINUE LEARNING (Milestone 18.3f) — identifies the most
 * recently active curriculum-linked teaching session for a learner, to
 * power a future "Continue Learning" card. Backend read model only — no
 * UI, no API route, no schema change.
 *
 * SESSION-STATUS RULE (chosen to match the existing, already-shipped
 * `ContinueLearning` precedent in `lib/studio/overview.ts`, which surfaces
 * an `activeSession` only when its status is NOT `COMPLETED` — never a
 * finished session presented as something to "resume"): a candidate must
 * have a NON-COMPLETED status. If no non-completed curriculum-linked
 * session exists, this returns `null` — it deliberately does NOT fall back
 * to the most recent COMPLETED session, since "Resume lesson" would be a
 * misleading action for a lesson that's already finished. This mirrors
 * `overview.ts`'s own behavior exactly (its `activeSession` is `null` in
 * the equivalent case), rather than inventing new semantics.
 *
 * Ordered by `learning_sessions.updated_at DESC` (not `lessons.created_at`
 * or session `created_at`) — the orchestrator touches `updated_at` on every
 * teaching step (see the 18.3c/18.3d audits), making it the only reliable
 * "last activity" signal in the current schema.
 *
 * Exactly three queries, none per-candidate: (1) this source's active TOPIC
 * nodes, (2) this user's lessons scoped to those specific node ids, (3)
 * this user's non-completed sessions scoped to those specific lesson ids,
 * ordered + limited to 1 at the database level. Archived topics, other
 * curriculum sources/versions, and free-text (non-curriculum) lessons are
 * excluded at query (1)/(2) — never reachable as a candidate, not filtered
 * out afterward.
 */

export interface CurriculumContinueLearning {
  sessionId: string;
  lessonId: string;
  curriculumNodeId: string;
  topicTitle: string;
  /** The TOPIC's immediate parent (its CHAPTER), if any — read directly off
   * the already-fetched node, no extra CurriculumStore lookup. */
  chapterNodeId: string | null;
  lastActivityAt: string;
}

const NON_COMPLETED_SESSION_STATUSES = SESSION_STATUSES.filter(
  (s) => s !== "COMPLETED",
);

export async function getCurriculumContinueLearning(
  store: CurriculumStore,
  lessons: LessonStore,
  sessions: SessionStore,
  userId: string,
  sourceId: string,
): Promise<Result<CurriculumContinueLearning | null>> {
  const nodesRes = await store.listNodesForSource(sourceId);
  if (!nodesRes.ok) return nodesRes;

  const topicById = new Map(
    nodesRes.value
      .filter((n) => n.node_type === "TOPIC" && n.status === "ACTIVE")
      .map((n) => [n.id, n]),
  );
  if (topicById.size === 0) return ok(null);

  const lessonsRes = await lessons.listForUserByCurriculumNodes(userId, [
    ...topicById.keys(),
  ]);
  if (!lessonsRes.ok) return lessonsRes;
  if (lessonsRes.value.length === 0) return ok(null);

  const lessonById = new Map(lessonsRes.value.map((l) => [l.id, l]));

  const sessionsRes = await sessions.listRecentForUserByLessons(
    userId,
    lessonsRes.value.map((l) => l.id),
    { statuses: NON_COMPLETED_SESSION_STATUSES, limit: 1 },
  );
  if (!sessionsRes.ok) return sessionsRes;

  const candidate = sessionsRes.value[0];
  if (!candidate?.lesson_id) return ok(null);

  const lesson = lessonById.get(candidate.lesson_id);
  const topicNode = lesson?.curriculum_node_id
    ? topicById.get(lesson.curriculum_node_id)
    : undefined;
  if (!lesson || !topicNode) return ok(null);

  return ok({
    sessionId: candidate.id,
    lessonId: lesson.id,
    curriculumNodeId: topicNode.id,
    topicTitle: topicNode.title,
    chapterNodeId: topicNode.parent_id,
    lastActivityAt: candidate.updated_at,
  });
}
