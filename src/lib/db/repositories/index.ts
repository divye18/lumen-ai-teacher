/**
 * Data-access repositories.
 *
 * Each `create*Store(db)` takes a typed Supabase client — either the
 * request-scoped server client (RLS as the signed-in user) or the admin
 * client (trusted server tasks / tests) — and returns a small,
 * single-responsibility store. All writes are Zod-validated; all methods
 * return `Result`.
 *
 * Only the tables the application actually uses get a repository.
 */
export {
  createLearnerProfileStore,
  type LearnerProfileStore,
  type LearnerProfileRow,
} from "./learner-profile-store";
export {
  createMasteryStore,
  type MasteryStore,
  type ConceptMasteryRow,
} from "./mastery-store";
export {
  createSessionStore,
  type SessionStore,
  type LearningSessionRow,
} from "./session-store";
export {
  createInteractionStore,
  type InteractionStore,
  type InteractionRow,
} from "./interaction-store";
export {
  createConceptStore,
  type ConceptStore,
  type ConceptRow,
  type ConceptRelationshipRow,
} from "./concept-store";
export {
  createMisconceptionStore,
  type MisconceptionStore,
  type MisconceptionRow,
} from "./misconception-store";
export {
  createAssessmentStore,
  type AssessmentStore,
  type AssessmentRow,
  type AssessmentQuestionRow,
  type AssessmentAnswerRow,
  type ClientAssessmentQuestion,
} from "./assessment-store";
export {
  createDocumentStore,
  type DocumentStore,
  type DocumentRow,
  type DocumentChunkRow,
  type ChunkMatch,
} from "./document-store";
export {
  createLessonStore,
  type LessonStore,
  type LessonRow,
  type LessonConceptRow,
} from "./lesson-store";
export {
  createTeachingQaStore,
  type TeachingQaStore,
  type TeachingQuestionRow,
  type TeachingAnswerRow,
  type ClientTeachingQuestion,
} from "./teaching-qa-store";

export { type DbClient } from "./shared";
