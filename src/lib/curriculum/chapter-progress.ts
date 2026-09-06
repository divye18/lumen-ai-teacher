import "server-only";

import type { CurriculumStore, LessonStore } from "@/lib/db/repositories";
import { ok, type Result } from "@/lib/result";

import { getTopicProgressForNodes, type TopicProgress } from "./topic-progress";

/**
 * CHAPTER CURRICULUM PROGRESS (Milestone 18.3e) — aggregates the existing
 * 18.3d topic-progress primitive across one chapter's active topics, and
 * picks the next unfinished topic by curriculum position. Still curriculum
 * ENGAGEMENT progress, not mastery — never reads `concept_mastery` or
 * `misconceptions`, and never duplicates the NOT_STARTED/IN_PROGRESS/
 * COMPLETED derivation logic (that lives once, in `topic-progress.ts`).
 *
 * Responsibility boundary:
 *   CurriculumStore     -> global curriculum structure (learner-agnostic)
 *   topic-progress.ts   -> learner-specific status for a set of topics
 *   chapter-progress.ts -> aggregation + next-topic selection over that set
 */

export interface ChapterProgress {
  chapterNodeId: string;
  totalTopics: number;
  completedTopics: number;
  /** Integer 0-100. 0 when `totalTopics` is 0. */
  progressPercent: number;
}

export interface NextTopic {
  nodeId: string;
  title: string;
  position: number;
}

export interface ChapterProgressResult {
  progress: ChapterProgress;
  nextTopic: NextTopic | null;
}

/** Pure: `Math.round(completed / total * 100)`, 0 when `total` is 0
 * (avoids a division by zero producing NaN). */
export function computeChapterProgressPercent(
  completedTopics: number,
  totalTopics: number,
): number {
  if (totalTopics === 0) return 0;
  return Math.round((completedTopics / totalTopics) * 100);
}

/**
 * Pure: the first topic (in the given, already-position-ordered list) whose
 * status is not COMPLETED — NOT_STARTED and IN_PROGRESS both count as
 * candidates, matching the "first unfinished topic by position" rule.
 * `ABANDONED` gets no special treatment (per `topic-progress.ts`, a
 * closed-tab lesson is represented as ACTIVE -> IN_PROGRESS, which is
 * already a valid candidate here). `null` when every topic is COMPLETED,
 * or when there are no topics at all.
 */
export function pickNextTopic(topics: TopicProgress[]): NextTopic | null {
  const next = topics.find((t) => t.status !== "COMPLETED");
  if (!next) return null;
  return { nodeId: next.nodeId, title: next.title, position: next.position };
}

/**
 * Chapter progress + next topic for one chapter node, scoped to `sourceId`
 * (never searched globally by title, never mixed across curriculum
 * versions) and `userId`. Only ACTIVE TOPIC children count — SUBTOPIC and
 * archived nodes are excluded, matching the active Curriculum Explorer's
 * own browsing scope.
 *
 * Exactly two queries regardless of topic count: `listChildren` for the
 * chapter's topic nodes, then the shared `getTopicProgressForNodes` (one
 * more query, scoped to those specific node ids) — no per-topic queries.
 */
export async function getChapterProgressForUser(
  store: CurriculumStore,
  lessons: LessonStore,
  userId: string,
  sourceId: string,
  chapterNodeId: string,
): Promise<Result<ChapterProgressResult>> {
  const childrenRes = await store.listChildren(sourceId, chapterNodeId);
  if (!childrenRes.ok) return childrenRes;

  const topicNodes = childrenRes.value
    .filter((n) => n.node_type === "TOPIC" && n.status === "ACTIVE")
    .sort((a, b) => a.position - b.position);

  const topicProgressRes = await getTopicProgressForNodes(
    lessons,
    userId,
    topicNodes,
  );
  if (!topicProgressRes.ok) return topicProgressRes;

  const totalTopics = topicProgressRes.value.length;
  const completedTopics = topicProgressRes.value.filter(
    (t) => t.status === "COMPLETED",
  ).length;

  return ok({
    progress: {
      chapterNodeId,
      totalTopics,
      completedTopics,
      progressPercent: computeChapterProgressPercent(
        completedTopics,
        totalTopics,
      ),
    },
    nextTopic: pickNextTopic(topicProgressRes.value),
  });
}
