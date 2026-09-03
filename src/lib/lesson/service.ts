import "server-only";

import type { LLMProvider } from "@/lib/ai/types";
import {
  createConceptStore,
  createLearnerProfileStore,
  createLessonStore,
  createMasteryStore,
  type DbClient,
} from "@/lib/db/repositories";
import type { SupportedLanguage, TeachingStyle } from "@/lib/db/enums";
import { TEACHING_STYLES } from "@/lib/db/enums";
import type { Retriever } from "@/lib/rag";
import {
  buildSourceContextText,
  toTeachingCitations,
} from "@/lib/session/citations";
import type { LessonView } from "@/lib/session/views";
import { scoreToPoints } from "@/lib/teaching/mastery";
import { clampInt } from "@/lib/teaching/keys";
import { PersistenceError } from "@/lib/errors";
import { err, ok, type Result } from "@/lib/result";

import { planLesson } from "./planner";
import type { LessonPlan } from "@/lib/teaching/contracts";
import type { TeachingCitation } from "@/lib/session/citations";

interface SourceContext {
  text: string;
  citations: TeachingCitation[];
}

export interface CreateLessonInput {
  topic: string;
  documentId?: string | null;
  timeBudgetMinutes?: number | null;
  teachingStyle?: TeachingStyle | null;
  retrievalTopK?: number;
}

export interface CreateLessonDeps {
  db: DbClient;
  llm: LLMProvider | null;
  retriever: Retriever | null;
  userId: string;
}

function asStyle(value: string | null | undefined): TeachingStyle | null {
  return value && (TEACHING_STYLES as readonly string[]).includes(value)
    ? (value as TeachingStyle)
    : null;
}

function isPrerequisite(key: string, plan: LessonPlan): boolean {
  return plan.concepts.some((c) => c.prerequisites.includes(key));
}

export async function createLessonForUser(
  deps: CreateLessonDeps,
  input: CreateLessonInput,
): Promise<Result<LessonView>> {
  const lessons = createLessonStore(deps.db);
  const concepts = createConceptStore(deps.db);
  const profiles = createLearnerProfileStore(deps.db);
  const mastery = createMasteryStore(deps.db);

  const profileRes = await profiles.get(deps.userId);
  const profile = profileRes.ok ? profileRes.value : null;
  const language = (profile?.preferred_language ?? "en") as SupportedLanguage;
  const style =
    input.teachingStyle ??
    asStyle(profile?.preferred_learning_strategy) ??
    null;

  // Known mastery (best effort — by concept name).
  const masteryRes = await mastery.listForUser(deps.userId);
  const conceptRows = await concepts.listForUser(deps.userId);
  const nameById = new Map<string, string>();
  if (conceptRows.ok) {
    for (const c of conceptRows.value) nameById.set(c.id, c.name);
  }
  const knownMastery = masteryRes.ok
    ? masteryRes.value
        .map((m) => ({
          title: nameById.get(m.concept_id) ?? "",
          points: scoreToPoints(m.mastery_score),
        }))
        .filter((m) => m.title.length > 0)
    : [];
  const weakConceptTitles = knownMastery
    .filter((m) => m.points < 50)
    .map((m) => m.title);

  // Optional source grounding.
  let sourceContext: SourceContext | null = null;
  if (input.documentId && deps.retriever) {
    const retrieved = await deps.retriever.retrieve({
      userId: deps.userId,
      text: input.topic,
      documentId: input.documentId,
      topK: input.retrievalTopK ?? 6,
      similarityThreshold: 0.1,
    });
    if (retrieved.ok && retrieved.value.length > 0) {
      sourceContext = {
        text: buildSourceContextText(retrieved.value),
        citations: toTeachingCitations(retrieved.value),
      };
    }
  }

  const planned = await planLesson({
    llm: deps.llm,
    topic: input.topic,
    language,
    learner: {
      level: profile?.current_level ?? 3,
      goal: profile?.learning_goal ?? null,
      style,
      availableMinutes:
        input.timeBudgetMinutes ?? profile?.available_time_minutes ?? null,
    },
    knownMastery,
    weakConceptTitles,
    sourceContext,
  });
  if (!planned.ok) return planned;
  const { plan, source, citations } = planned.value;

  // Persist a concept row per plan concept, then the lesson, then lesson_concepts.
  const conceptIdByKey = new Map<string, string>();
  for (const c of plan.concepts) {
    const created = await concepts.create({
      userId: deps.userId,
      documentId: input.documentId ?? null,
      name: c.title,
      description: c.summary,
      subject: input.topic,
      metadata: { conceptKey: c.key, lessonTopic: input.topic },
    });
    if (!created.ok) return created;
    conceptIdByKey.set(c.key, created.value.id);
  }

  const lessonRes = await lessons.create({
    userId: deps.userId,
    documentId: input.documentId ?? null,
    title: `${input.topic}`,
    topic: input.topic,
    objective: plan.objective,
    language,
    teachingStyle: style,
    estimatedMinutes: clampInt(plan.estimatedMinutes, 1, 600),
    sourceGrounded: source === "ai+source",
    planSource: source,
    status: "DRAFT",
    plan,
    citations,
  });
  if (!lessonRes.ok) return lessonRes;
  const lesson = lessonRes.value;

  const conceptInputs = plan.concepts.map((c, i) => ({
    lessonId: lesson.id,
    conceptId: conceptIdByKey.get(c.key) ?? null,
    conceptKey: c.key,
    title: c.title,
    summary: c.summary,
    position: i,
    difficulty: clampInt(c.difficulty, 1, 5),
    importance: clampInt(c.importance, 1, 5),
    isPrerequisite: isPrerequisite(c.key, plan),
    status: "PENDING" as const,
  }));
  const conceptsRes = await lessons.addConcepts(conceptInputs);
  if (!conceptsRes.ok) {
    return err(
      new PersistenceError("failed to persist lesson concepts", {
        cause: conceptsRes.error,
      }),
    );
  }

  return ok({
    lessonId: lesson.id,
    title: lesson.title,
    topic: lesson.topic,
    objective: lesson.objective,
    language: lesson.language,
    estimatedMinutes: lesson.estimated_minutes,
    teachingStyle: lesson.teaching_style,
    sourceGrounded: lesson.source_grounded,
    planSource: lesson.plan_source,
    assessmentStrategy: plan.assessmentStrategy,
    concepts: conceptsRes.value
      .sort((a, b) => a.position - b.position)
      .map((c) => ({
        key: c.concept_key,
        title: c.title,
        summary: c.summary,
        position: c.position,
        difficulty: c.difficulty,
        importance: c.importance,
        isPrerequisite: c.is_prerequisite,
        status: c.status,
      })),
    citations: sourceContext?.citations ?? [],
  });
}
