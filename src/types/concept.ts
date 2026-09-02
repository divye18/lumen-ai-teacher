import type { DifficultyLevel, Id, ISODateTime } from "./common";

/**
 * A single unit of knowledge Lumen can teach and assess.
 * Concepts form a graph via {@link ConceptRelationship}.
 */
export interface Concept {
  id: Id;
  /** Stable human-readable key, e.g. "algebra.linear-equations". */
  slug: string;
  title: string;
  summary: string;
  /** Intrinsic difficulty of the concept, independent of the learner. */
  difficulty: DifficultyLevel;
  /** Domain/subject grouping, e.g. "mathematics". */
  domain: string;
  /** Free-form tags for retrieval and grouping. */
  tags: string[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type ConceptRelationshipKind =
  "prerequisite" | "builds-on" | "related" | "contrasts-with" | "part-of";

/** A directed edge in the concept graph: `from` --kind--> `to`. */
export interface ConceptRelationship {
  id: Id;
  fromConceptId: Id;
  toConceptId: Id;
  kind: ConceptRelationshipKind;
  /** Strength of the relationship, 0–1. */
  weight: number;
}
