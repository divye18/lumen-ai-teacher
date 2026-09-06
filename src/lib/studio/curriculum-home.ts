import "server-only";

import {
  createCurriculumStore,
  createLessonStore,
  createSessionStore,
  type DbClient,
} from "@/lib/db/repositories";
import { resolveNcertSource } from "@/lib/curriculum/ncert-browser";
import {
  getCurriculumContinueLearning,
  type CurriculumContinueLearning,
} from "@/lib/curriculum/continue-learning";
import {
  getChapterProgressForUser,
  type ChapterProgress,
  type NextTopic,
} from "@/lib/curriculum/chapter-progress";

/**
 * Home/Studio curriculum composition (Milestone 19.3). Composes the
 * existing 18.3f/18.3e read models — no new repository method, no new
 * query shape, no schema change. This is curriculum ENGAGEMENT data only;
 * concept mastery is a separate aggregate already assembled by
 * `getStudioOverview` and is never computed or touched here.
 */

export interface CurriculumContinueLearningView extends CurriculumContinueLearning {
  chapterTitle: string;
}

export interface CurriculumHome {
  continueLearning: CurriculumContinueLearningView | null;
  chapterProgress: ChapterProgress | null;
  nextTopic: NextTopic | null;
}

const EMPTY: CurriculumHome = {
  continueLearning: null,
  chapterProgress: null,
  nextTopic: null,
};

/**
 * Resolve the first active CHAPTER in the source — used only as a fallback
 * when there is no Continue Learning session to anchor progress to (e.g. a
 * learner who completed topics earlier but has no active session right
 * now). At the current single-chapter NCERT pilot this is exactly the
 * pilot's one chapter; nothing here hardcodes its title or id.
 */
async function resolveDefaultChapterId(
  store: ReturnType<typeof createCurriculumStore>,
  sourceId: string,
): Promise<{ id: string; title: string } | null> {
  const nodesRes = await store.listNodesForSource(sourceId);
  if (!nodesRes.ok) return null;
  const chapter = nodesRes.value.find(
    (n) => n.node_type === "CHAPTER" && n.status === "ACTIVE",
  );
  return chapter ? { id: chapter.id, title: chapter.title } : null;
}

export async function getCurriculumHome(
  db: DbClient,
  userId: string,
): Promise<CurriculumHome> {
  const store = createCurriculumStore(db);
  const sourceRes = await resolveNcertSource(store, userId);
  if (!sourceRes.ok) return EMPTY;
  const sourceId = sourceRes.value.id;

  const lessons = createLessonStore(db);
  const sessions = createSessionStore(db);

  const continueRes = await getCurriculumContinueLearning(
    store,
    lessons,
    sessions,
    userId,
    sourceId,
  );
  const continueLearningRaw = continueRes.ok ? continueRes.value : null;

  // Chapter to show progress for: the Continue Learning session's own
  // chapter when one exists, otherwise the source's first active chapter
  // (still real data — just not anchored to a specific in-progress session).
  let chapterId = continueLearningRaw?.chapterNodeId ?? null;
  let chapterTitle: string | null = null;

  if (chapterId) {
    const nodeRes = await store.getNode(chapterId);
    chapterTitle = nodeRes.ok ? nodeRes.value.title : null;
  } else {
    const fallback = await resolveDefaultChapterId(store, sourceId);
    if (fallback) {
      chapterId = fallback.id;
      chapterTitle = fallback.title;
    }
  }

  const continueLearning =
    continueLearningRaw && chapterTitle
      ? { ...continueLearningRaw, chapterTitle }
      : null;

  if (!chapterId) {
    return { continueLearning, chapterProgress: null, nextTopic: null };
  }

  const progressRes = await getChapterProgressForUser(
    store,
    lessons,
    userId,
    sourceId,
    chapterId,
  );
  if (!progressRes.ok) {
    return { continueLearning, chapterProgress: null, nextTopic: null };
  }

  return {
    continueLearning,
    chapterProgress: progressRes.value.progress,
    nextTopic: progressRes.value.nextTopic,
  };
}
