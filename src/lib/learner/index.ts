import type { LearnerProfile, LearnerState } from "@/types/learner";
import type { Id } from "@/types/common";
import type { Result } from "@/lib/result";

/**
 * Learner state persistence boundary.
 *
 * The orchestrator owns learner state; the frontend only reads it. A
 * `LearnerStateStore` implementation (backed by Supabase, later phase) is the
 * only way state is loaded or persisted.
 *
 * No mastery / confidence algorithms are implemented in the foundation phase.
 */
export interface LearnerStateStore {
  getProfile(learnerId: Id): Promise<Result<LearnerProfile>>;
  getState(sessionId: Id): Promise<Result<LearnerState>>;
  saveState(state: LearnerState): Promise<Result<void>>;
}
