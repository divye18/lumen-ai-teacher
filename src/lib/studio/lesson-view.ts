import "server-only";

import {
  createLessonStore,
  createMasteryStore,
  type DbClient,
} from "@/lib/db/repositories";
import { lessonPlanSchema } from "@/lib/teaching/contracts";
import { scoreToPoints } from "@/lib/teaching/mastery";
import type { TeachingCitation } from "@/lib/session/citations";
import type { LessonView } from "@/lib/session/views";
import { err, ok, type Result } from "@/lib/result";
import { LessonNotFoundError } from "@/lib/errors";

export interface LessonViewBundle {
  lesson: LessonView;
  masteryByConcept: Record<string, number>;
  status: string;
}

export async function getLessonView(
  db: DbClient,
  userId: string,
  lessonId: string,
): Promise<Result<LessonViewBundle>> {
  const lessons = createLessonStore(db);
  const mastery = createMasteryStore(db);

  const lessonRes = await lessons.get(lessonId);
  if (!lessonRes.ok) return lessonRes;
  const row = lessonRes.value;
  if (row.user_id !== userId) return err(new LessonNotFoundError(lessonId));

  const conceptsRes = await lessons.listConcepts(row.id);
  if (!conceptsRes.ok) return conceptsRes;
  const lessonConcepts = conceptsRes.value;

  const parsedPlan = lessonPlanSchema.safeParse(row.plan);
  const plan = parsedPlan.success ? parsedPlan.data : null;

  const masteryRes = await mastery.listForUser(userId);
  const masteryByConceptId = new Map(
    (masteryRes.ok ? masteryRes.value : []).map((m) => [m.concept_id, m]),
  );

  const masteryByConcept: Record<string, number> = {};
  const concepts = lessonConcepts.map((c) => {
    const planConcept = plan?.concepts.find((p) => p.key === c.concept_key);
    const m = c.concept_id ? masteryByConceptId.get(c.concept_id) : undefined;
    if (m && m.attempt_count > 0) {
      masteryByConcept[c.concept_key] = scoreToPoints(m.mastery_score);
    }
    return {
      key: c.concept_key,
      title: c.title,
      summary: c.summary || planConcept?.summary || "",
      position: c.position,
      difficulty: c.difficulty,
      importance: c.importance,
      isPrerequisite: c.is_prerequisite,
      status: c.status,
    };
  });

  const citations = Array.isArray(row.citations)
    ? (row.citations as unknown[]).filter(
        (c): c is TeachingCitation =>
          typeof c === "object" && c !== null && "documentName" in c,
      )
    : [];

  const lesson: LessonView = {
    lessonId: row.id,
    title: row.title,
    topic: row.topic,
    objective: row.objective,
    language: row.language,
    estimatedMinutes: row.estimated_minutes,
    teachingStyle: row.teaching_style,
    sourceGrounded: row.source_grounded,
    planSource: row.plan_source,
    assessmentStrategy:
      plan?.assessmentStrategy ??
      "Lumen checks each concept with a question, then adapts based on your answer.",
    concepts,
    citations,
  };

  return ok({ lesson, masteryByConcept, status: row.status });
}
