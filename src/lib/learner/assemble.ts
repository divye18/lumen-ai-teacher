import type { ExplanationStrategy } from "@/types/common";
import type {
  ConceptMastery,
  LearnerState,
  RecentInteractionRef,
} from "@/types/learner";
import { learningStrategySchema } from "@/lib/db/enums";
import type {
  ConceptMasteryRow,
  InteractionRow,
  LearnerProfileRow,
  LearningSessionRow,
  MisconceptionRow,
} from "@/lib/db/repositories";

const DEFAULT_STRATEGY: ExplanationStrategy = "conversational";
const DEFAULT_LANGUAGE = "en";

/** Raw database rows needed to build a {@link LearnerState}. */
export interface LearnerStateBundle {
  userId: string;
  session: LearningSessionRow | null;
  profile: LearnerProfileRow | null;
  mastery: ConceptMasteryRow[];
  misconceptions: MisconceptionRow[];
  recentInteractions: InteractionRow[];
}

function toStrategy(value: string | null | undefined): ExplanationStrategy {
  const parsed = learningStrategySchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_STRATEGY;
}

function digest(content: string): string {
  const trimmed = content.trim().replace(/\s+/g, " ");
  return trimmed.length > 140 ? `${trimmed.slice(0, 137)}…` : trimmed;
}

/**
 * Assemble the application's `LearnerState` from persisted evidence.
 *
 * Pure and deterministic: it only shapes stored records, it does not compute
 * mastery or make teaching decisions. `conceptMastery` is keyed by concept id
 * (stable slugs arrive with the concept graph in a later phase; the
 * `conceptSlug` field carries the same id until then).
 */
export function assembleLearnerState(bundle: LearnerStateBundle): LearnerState {
  const {
    userId,
    session,
    profile,
    mastery,
    misconceptions,
    recentInteractions,
  } = bundle;

  const activeByConcept = new Map<string, string[]>();
  for (const m of misconceptions) {
    if (m.status === "RESOLVED") continue;
    const list = activeByConcept.get(m.concept_id) ?? [];
    list.push(m.id);
    activeByConcept.set(m.concept_id, list);
  }

  const conceptMastery: Record<string, ConceptMastery> = {};
  const totals = { attempts: 0, correct: 0, incorrect: 0 };

  for (const row of mastery) {
    totals.attempts += row.attempt_count;
    totals.correct += row.correct_count;
    totals.incorrect += row.incorrect_count;

    conceptMastery[row.concept_id] = {
      conceptSlug: row.concept_id,
      mastery: row.mastery_score,
      confidence: row.confidence_score,
      attempts: row.attempt_count,
      correct: row.correct_count,
      incorrect: row.incorrect_count,
      activeMisconceptionIds: activeByConcept.get(row.concept_id) ?? [],
      lastSeenAt: row.last_attempt_at ?? row.updated_at ?? row.created_at,
    };
  }

  const refs: RecentInteractionRef[] = recentInteractions.map((i) => ({
    interactionId: i.id,
    conceptSlug: i.concept_id ?? "",
    at: i.created_at,
    digest: digest(i.content),
  }));

  const lastSeenAt =
    refs.reduce<string | null>(
      (acc, r) => (acc === null || r.at > acc ? r.at : acc),
      null,
    ) ??
    session?.started_at ??
    new Date().toISOString();

  return {
    learnerId: userId,
    sessionId: session?.id ?? "",
    conceptMastery,
    totals,
    preferredExplanationStrategy: toStrategy(
      profile?.preferred_learning_strategy,
    ),
    recentInteractions: refs,
    currentConceptSlug: session?.current_concept_id ?? undefined,
    currentLessonId: undefined,
    language:
      profile?.preferred_language ?? session?.language ?? DEFAULT_LANGUAGE,
    learningGoal: profile?.learning_goal ?? session?.goal ?? undefined,
    availableTimeMinutes: profile?.available_time_minutes ?? undefined,
    lastSeenAt,
    updatedAt: new Date().toISOString(),
  };
}
