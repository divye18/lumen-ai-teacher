import type { LearnerState } from "@/types/learner";
import type { Result } from "@/lib/result";
import type {
  ConceptMasteryRow,
  InteractionRow,
  LearnerProfileRow,
  MisconceptionRow,
} from "@/lib/db/repositories";
import type {
  ConceptMasteryUpsertInput,
  LearnerProfileUpsertInput,
  RecordInteractionInput,
  RecordMisconceptionInput,
} from "@/lib/db/schemas";

/**
 * Learner state persistence boundary.
 *
 * The store ONLY reads and writes persisted evidence/state. It never decides
 * how to teach — that is the Teaching Engine's job in a later phase.
 *
 * Concrete implementation: {@link createSupabaseLearnerStateStore}.
 */
export interface LearnerStateStore {
  /** Assemble the current `LearnerState` for a user (optionally a session). */
  getLearnerState(
    userId: string,
    options?: { sessionId?: string; recentInteractionLimit?: number },
  ): Promise<Result<LearnerState>>;

  getConceptMastery(
    userId: string,
    conceptId: string,
  ): Promise<Result<ConceptMasteryRow>>;

  /** Create or update the single (user, concept) mastery row. */
  upsertConceptMastery(
    input: ConceptMasteryUpsertInput,
  ): Promise<Result<ConceptMasteryRow>>;

  /** Append an interaction to the evidence log. */
  recordInteraction(
    input: RecordInteractionInput,
  ): Promise<Result<InteractionRow>>;

  recordMisconception(
    input: RecordMisconceptionInput,
  ): Promise<Result<MisconceptionRow>>;

  resolveMisconception(
    misconceptionId: string,
  ): Promise<Result<MisconceptionRow>>;

  updateLearnerProfile(
    input: LearnerProfileUpsertInput,
  ): Promise<Result<LearnerProfileRow>>;
}

export { assembleLearnerState, type LearnerStateBundle } from "./assemble";
export { createSupabaseLearnerStateStore } from "./supabase-store";
