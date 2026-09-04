import "server-only";

import {
  createInteractionStore,
  createLessonStore,
  createMasteryStore,
  createMisconceptionStore,
  createTeachingQaStore,
  createLearningProfileStore,
  type DbClient,
} from "@/lib/db/repositories";
import { scoreToPoints } from "@/lib/teaching/mastery";
import { ok, type Result } from "@/lib/result";

import { buildStrategyMemory } from "./strategy-memory";
import {
  deriveLearningProfile,
  type LearningProfile,
  type LearningSignal,
  type ProfileConcept,
} from "./learning-profile";
import {
  personalizeTeaching,
  type PersonalizationAdjustments,
} from "./personalization-policy";

/**
 * ADAPTIVE TEACHER MEMORY — persistence + recompute.
 *
 * `recomputeLearningProfile` assembles a user's cross-session evidence, runs
 * the pure {@link deriveLearningProfile}, and stores the result. It is called
 * when a session finishes (fresh evidence just landed) and lazily when a row is
 * missing (older learners). `loadPersonalization` reads the stored snapshot on
 * the Teaching Room hot path and maps it to concrete adjustments.
 */

const EVIDENCE_LIMIT = 200;

export interface Personalization {
  profile: LearningProfile;
  adjustments: PersonalizationAdjustments;
}

/** Parse a stored jsonb row back into a `LearningProfile`. */
export function profileFromRow(row: {
  signals: unknown;
  evidence: unknown;
  sample_size: number;
  computed_at: string;
}): LearningProfile {
  const signals = Array.isArray(row.signals)
    ? (row.signals as LearningSignal[])
    : [];
  const evidence =
    row.evidence && typeof row.evidence === "object"
      ? (row.evidence as Record<string, unknown>)
      : {};
  return {
    signals,
    sampleSize: row.sample_size,
    computedAt: row.computed_at,
    strongestConceptFamily:
      typeof evidence.strongestConceptFamily === "string"
        ? evidence.strongestConceptFamily
        : null,
    weakestConceptFamily:
      typeof evidence.weakestConceptFamily === "string"
        ? evidence.weakestConceptFamily
        : null,
  };
}

async function loadProfileConcepts(
  db: DbClient,
  userId: string,
): Promise<ProfileConcept[]> {
  const lessons = createLessonStore(db);
  const mastery = createMasteryStore(db);
  const [lessonRes, masteryRes] = await Promise.all([
    lessons.listForUser(userId),
    mastery.listForUser(userId),
  ]);
  const masteryByConceptId = new Map(
    (masteryRes.ok ? masteryRes.value : []).map((m) => [m.concept_id, m]),
  );
  const out = new Map<string, ProfileConcept>();
  await Promise.all(
    (lessonRes.ok ? lessonRes.value : []).map(async (lesson) => {
      const res = await lessons.listConcepts(lesson.id);
      if (!res.ok) return;
      for (const c of res.value) {
        const m = c.concept_id
          ? masteryByConceptId.get(c.concept_id)
          : undefined;
        // Keep the row with the most attempts if the concept spans lessons.
        const existing = out.get(c.concept_key);
        const attempts = m?.attempt_count ?? 0;
        if (existing && existing.attempts >= attempts) continue;
        out.set(c.concept_key, {
          conceptKey: c.concept_key,
          title: c.title,
          masteryPoints: m ? scoreToPoints(m.mastery_score) : 0,
          attempts,
          misconceptionCount: m?.misconception_count ?? 0,
        });
      }
    }),
  );
  return [...out.values()];
}

export async function recomputeLearningProfile(
  db: DbClient,
  userId: string,
): Promise<Result<LearningProfile>> {
  const qa = createTeachingQaStore(db);
  const interactions = createInteractionStore(db);
  const misconceptions = createMisconceptionStore(db);
  const store = createLearningProfileStore(db);

  const [answersRes, questionsRes, interactionsRes, misconRes, concepts] =
    await Promise.all([
      qa.listRecentAnswersForUser(userId, EVIDENCE_LIMIT),
      qa.listRecentQuestionsForUser(userId, EVIDENCE_LIMIT),
      interactions.listRecentForUser(userId, EVIDENCE_LIMIT),
      misconceptions.listActiveForUser(userId),
      loadProfileConcepts(db, userId),
    ]);

  const answers = answersRes.ok ? answersRes.value : [];
  const questions = questionsRes.ok ? questionsRes.value : [];
  const interactionRows = interactionsRes.ok ? interactionsRes.value : [];
  const misconRows = misconRes.ok ? misconRes.value : [];

  const strategyMemory = buildStrategyMemory({
    interactions: interactionRows,
    answers,
    questions,
  });

  const profile = deriveLearningProfile({
    answers,
    questions,
    interactions: interactionRows,
    concepts,
    misconceptions: misconRows,
    strategyMemory,
  });

  await store.upsert({
    userId,
    signals: profile.signals as unknown as Record<string, unknown>[],
    evidence: {
      strongestConceptFamily: profile.strongestConceptFamily,
      weakestConceptFamily: profile.weakestConceptFamily,
    },
    sampleSize: profile.sampleSize,
    computedAt: profile.computedAt,
  });

  return ok(profile);
}

/**
 * The personalization to apply right now. Reads the stored snapshot; recomputes
 * once if it is missing. Never throws — a failure degrades to the baseline.
 */
export async function loadPersonalization(
  db: DbClient,
  userId: string,
): Promise<Personalization> {
  try {
    const store = createLearningProfileStore(db);
    const rowRes = await store.get(userId);
    let profile: LearningProfile;
    if (rowRes.ok && rowRes.value) {
      profile = profileFromRow(rowRes.value);
    } else {
      const computed = await recomputeLearningProfile(db, userId);
      profile = computed.ok
        ? computed.value
        : {
            signals: [],
            sampleSize: 0,
            computedAt: new Date().toISOString(),
            strongestConceptFamily: null,
            weakestConceptFamily: null,
          };
    }
    return { profile, adjustments: personalizeTeaching(profile) };
  } catch {
    return {
      profile: {
        signals: [],
        sampleSize: 0,
        computedAt: new Date().toISOString(),
        strongestConceptFamily: null,
        weakestConceptFamily: null,
      },
      adjustments: personalizeTeaching({
        signals: [],
        sampleSize: 0,
        computedAt: new Date().toISOString(),
        strongestConceptFamily: null,
        weakestConceptFamily: null,
      }),
    };
  }
}
