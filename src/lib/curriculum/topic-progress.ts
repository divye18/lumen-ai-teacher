import "server-only";

import type {
  CurriculumStore,
  LessonRow,
  LessonStore,
} from "@/lib/db/repositories";
import type { LessonStatus } from "@/lib/db/enums";
import { ok, type Result } from "@/lib/result";

/**
 * LEARNER CURRICULUM TOPIC PROGRESS (Milestone 18.3d) — a read-only model
 * of a learner's *engagement* with the curriculum structure, sitting beside
 * the global browser (`ncert-browser.ts`) rather than inside it or inside
 * `CurriculumStore` — `CurriculumStore` stays learner-agnostic per 17.2's
 * founding constraint, and this file is the one place that composes it with
 * learner-specific `LessonStore` data.
 *
 * This is deliberately NOT mastery. `concept_mastery` remains the sole
 * source of truth for what a learner actually knows; this only answers
 * "has this learner engaged with this curriculum topic, and how far."
 * Never derived from `concept_mastery`, never written back to it.
 *
 * SEMANTICS (confirmed against the real orchestrator in the 18.3c audit —
 * `lessons.status` and `learning_sessions.status` complete in lockstep, see
 * `orchestrator.ts`'s `finishSession()`, so lesson status alone is a
 * sufficient, sticky signal and `learning_sessions` need not be queried):
 *
 *   NOT_STARTED  — no lesson exists for (user, curriculum_node_id)
 *   IN_PROGRESS  — at least one lesson exists, none is COMPLETED
 *   COMPLETED    — at least one lesson is COMPLETED (sticky: a later
 *                  restart of the same topic never regresses this)
 *
 * `ABANDONED` is a declared but currently-unreachable status in the real
 * teaching flow (only ever set by demo/reset seed logic, never by the
 * orchestrator) — it is deliberately NOT given special treatment here; it
 * falls through to the same "not completed" bucket as DRAFT/ACTIVE.
 */

export type TopicStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export interface TopicProgress {
  nodeId: string;
  status: TopicStatus;
}

/**
 * Pure reducer: given every lesson a user has for ONE curriculum topic,
 * return its aggregate status. No I/O, deterministic, order-independent.
 */
export function reduceLessonsToTopicStatus(
  lessons: Array<{ status: LessonStatus }>,
): TopicStatus {
  if (lessons.length === 0) return "NOT_STARTED";
  if (lessons.some((l) => l.status === "COMPLETED")) return "COMPLETED";
  return "IN_PROGRESS";
}

/**
 * Topic progress for every currently-active TOPIC node under `sourceId`,
 * for `userId`. Archived topics are excluded (matches the active Curriculum
 * Explorer's own browsing scope — see `ncert-browser.ts`). Topics with zero
 * lessons are still included, as NOT_STARTED. Ordering follows each node's
 * stored `position` (siblings only — see the module-level caveat below for
 * curriculum sources with more than one chapter).
 *
 * Exactly two queries regardless of topic count: one for the topic nodes,
 * one for this user's lessons scoped to those specific node ids — never a
 * per-topic query, never every lesson the user has ever created.
 *
 * NOTE: `position` is only unique among siblings (e.g. topics within one
 * chapter). For a curriculum source whose topics span multiple chapters,
 * sorting purely by `position` can interleave chapters unevenly — this
 * matches the current single-chapter NCERT pilot exactly, and is a known,
 * documented limitation to revisit before a multi-chapter rollout, not a
 * defect introduced here.
 */
export async function getTopicProgressForUser(
  store: CurriculumStore,
  lessons: LessonStore,
  userId: string,
  sourceId: string,
): Promise<Result<TopicProgress[]>> {
  const nodesRes = await store.listNodesForSource(sourceId);
  if (!nodesRes.ok) return nodesRes;

  const topics = nodesRes.value
    .filter((n) => n.node_type === "TOPIC" && n.status === "ACTIVE")
    .sort((a, b) => a.position - b.position);

  const nodeIds = topics.map((t) => t.id);
  const lessonsRes = await lessons.listForUserByCurriculumNodes(
    userId,
    nodeIds,
  );
  if (!lessonsRes.ok) return lessonsRes;

  const lessonsByNode = new Map<string, LessonRow[]>();
  for (const lesson of lessonsRes.value) {
    if (!lesson.curriculum_node_id) continue;
    const bucket = lessonsByNode.get(lesson.curriculum_node_id) ?? [];
    bucket.push(lesson);
    lessonsByNode.set(lesson.curriculum_node_id, bucket);
  }

  return ok(
    topics.map((topic) => {
      const matching = lessonsByNode.get(topic.id) ?? [];
      // `status` is a plain `string` in the hand-written DB row type; the
      // SQL CHECK constraint already guarantees it's one of LessonStatus.
      const statuses = matching.map((l) => ({
        status: l.status as LessonStatus,
      }));
      return { nodeId: topic.id, status: reduceLessonsToTopicStatus(statuses) };
    }),
  );
}
