import "server-only";

import {
  createLessonStore,
  createSessionStore,
  type DbClient,
} from "@/lib/db/repositories";
import {
  buildAndPersistGraph,
  extractConcepts,
  normalizeConceptTitle,
} from "@/lib/graph";
import { createConceptStore } from "@/lib/db/repositories";
import { clampInt } from "@/lib/teaching/keys";
import { err, ok, type Result } from "@/lib/result";
import { PersistenceError } from "@/lib/errors";

import {
  DEMO_LESSON_PLAN,
  DEMO_LESSON_TITLE,
  DEMO_LESSON_TOPIC,
} from "./demo-lesson";

/**
 * DEMO MODE.
 *
 * Idempotently provisions the curated demo lesson + an active session for a
 * user, then hands back the session id. Uses the real persistence and the real
 * adaptive teaching engine — it only fixes the lesson content so the demo is
 * reproducible with zero external providers. Never fabricates progress.
 */

export interface DemoSession {
  sessionId: string;
  lessonId: string;
  created: boolean;
}

export async function ensureDemoSession(
  db: DbClient,
  userId: string,
): Promise<Result<DemoSession>> {
  const lessons = createLessonStore(db);
  const sessions = createSessionStore(db);
  const concepts = createConceptStore(db);

  // 1. Reuse an existing demo lesson if present.
  const existingLessons = await lessons.listForUser(userId);
  const demoLesson = existingLessons.ok
    ? existingLessons.value.find(
        (l) => l.title === DEMO_LESSON_TITLE && l.topic === DEMO_LESSON_TOPIC,
      )
    : undefined;

  let lessonId: string;
  let created = false;

  if (demoLesson) {
    lessonId = demoLesson.id;
  } else {
    const plan = DEMO_LESSON_PLAN;

    // Concept rows (deduped by normalized key).
    const conceptIdByKey = new Map<string, string>();
    for (const c of plan.concepts) {
      const normalizedKey = normalizeConceptTitle(c.title);
      const found = await concepts.findByNormalizedKey(userId, normalizedKey);
      if (found.ok && found.value) {
        conceptIdByKey.set(c.key, found.value.id);
        continue;
      }
      const row = await concepts.create({
        userId,
        documentId: null,
        name: c.title,
        description: c.summary,
        subject: DEMO_LESSON_TOPIC,
        metadata: { conceptKey: c.key, demo: true },
      });
      if (!row.ok) return row;
      await concepts.updateGraphFields(row.value.id, { normalizedKey });
      conceptIdByKey.set(c.key, row.value.id);
    }

    const lessonRes = await lessons.create({
      userId,
      documentId: null,
      title: DEMO_LESSON_TITLE,
      topic: DEMO_LESSON_TOPIC,
      objective: plan.objective,
      language: "en",
      teachingStyle: "visual-first",
      estimatedMinutes: clampInt(plan.estimatedMinutes, 1, 600),
      sourceGrounded: false,
      planSource: "fallback",
      status: "ACTIVE",
      plan,
      citations: [],
    });
    if (!lessonRes.ok) return lessonRes;
    lessonId = lessonRes.value.id;

    const conceptsRes = await lessons.addConcepts(
      plan.concepts.map((c, i) => ({
        lessonId,
        conceptId: conceptIdByKey.get(c.key) ?? null,
        conceptKey: c.key,
        title: c.title,
        summary: c.summary,
        position: i,
        difficulty: clampInt(c.difficulty, 1, 5),
        importance: clampInt(c.importance, 1, 5),
        isPrerequisite: plan.concepts.some((o) =>
          o.prerequisites.includes(c.key),
        ),
        status: "PENDING" as const,
      })),
    );
    if (!conceptsRes.ok) {
      return err(
        new PersistenceError("failed to persist demo lesson concepts", {
          cause: conceptsRes.error,
        }),
      );
    }

    try {
      const extraction = await extractConcepts({
        llm: null,
        subject: DEMO_LESSON_TOPIC,
        planConcepts: plan.concepts.map((c) => ({
          key: c.key,
          title: c.title,
          summary: c.summary,
          importance: c.importance,
          prerequisiteKeys: c.prerequisites,
        })),
      });
      if (extraction.ok) {
        await buildAndPersistGraph({
          db,
          userId,
          extraction: extraction.value.graph,
          conceptIdByKey,
        });
      }
    } catch {
      /* graph is an enhancement */
    }

    created = true;
  }

  // 2. Reuse an in-progress session for the demo lesson, else make one.
  const existingSessions = await sessions.listForUser(userId, { limit: 40 });
  const liveSession = existingSessions.ok
    ? existingSessions.value.find(
        (s) =>
          s.lesson_id === lessonId &&
          (s.status === "ACTIVE" ||
            s.status === "PAUSED" ||
            s.status === "PLANNED"),
      )
    : undefined;

  if (liveSession) {
    return ok({ sessionId: liveSession.id, lessonId, created });
  }

  const sessionRes = await sessions.create({
    userId,
    title: DEMO_LESSON_TITLE,
    topic: DEMO_LESSON_TOPIC,
    language: "en",
    status: "PLANNED",
  });
  if (!sessionRes.ok) return sessionRes;
  await sessions.updateTeaching({
    id: sessionRes.value.id,
    lessonId,
    timeBudgetMinutes: 25,
  });

  return ok({ sessionId: sessionRes.value.id, lessonId, created });
}

export {
  DEMO_LESSON_PLAN,
  DEMO_LESSON_TITLE,
  DEMO_LESSON_TOPIC,
} from "./demo-lesson";
