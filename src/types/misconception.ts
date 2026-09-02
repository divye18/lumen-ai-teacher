import type { ConfidenceScore, Id, ISODateTime } from "./common";

export type MisconceptionStatus =
  "suspected" | "confirmed" | "addressed" | "resolved";

/**
 * A specific, nameable wrong mental model detected while a learner works.
 * Detection logic is implemented in a later phase; this is the contract.
 */
export interface Misconception {
  id: Id;
  learnerId: Id;
  conceptSlug: string;
  /** Stable key for known misconceptions, e.g. "frac.add-numerators-and-denominators". */
  slug: string;
  /** What the learner appears to believe. */
  description: string;
  /** Why this is wrong / what the correct model is. */
  correction: string;
  status: MisconceptionStatus;
  confidence: ConfidenceScore;
  /** Interaction ids that provided evidence for this misconception. */
  evidenceInteractionIds: Id[];
  firstDetectedAt: ISODateTime;
  updatedAt: ISODateTime;
}
