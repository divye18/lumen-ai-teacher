import { z } from "zod";

import {
  assessmentStatusSchema,
  assessmentTypeSchema,
  conceptRelationshipTypeSchema,
  documentStatusSchema,
  interactionRoleSchema,
  interactionTypeSchema,
  learningStrategySchema,
  masteryStatusSchema,
  misconceptionSeveritySchema,
  misconceptionStatusSchema,
  questionTypeSchema,
  sessionStatusSchema,
  supportedLanguageSchema,
} from "./enums";

/**
 * Zod schemas validating every value that crosses into a repository write.
 * Bounds here match the SQL CHECK constraints, so invalid data is rejected
 * before a round-trip to Postgres.
 */

/**
 * Lenient UUID *format* guard: 8-4-4-4-12 hex, any version nibble.
 *
 * We do not use `z.string().uuid()` (strict RFC-4122 version/variant bits)
 * because fixed development/seed ids use a zero version nibble. Postgres `uuid`
 * columns accept any 8-4-4-4-12 hex value, so this matches DB behaviour while
 * still blocking arbitrary strings from reaching a query.
 */
export const uuidSchema = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "expected a UUID",
  );
export const unitScoreSchema = z.number().min(0).max(1);
export const nonNegativeIntSchema = z.number().int().min(0);
export const difficultySchema = z.number().int().min(1).max(5);
const isoDateTimeSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    "expected an ISO-8601 date-time string",
  );
const metadataSchema = z.record(z.string(), z.unknown());

// ── learner profile ─────────────────────────────────────────────────────────
export const learnerProfileUpsertSchema = z.object({
  userId: uuidSchema,
  currentLevel: difficultySchema.optional(),
  learningGoal: z.string().max(2000).nullish(),
  availableTimeMinutes: z.number().int().min(0).max(100_000).nullish(),
  preferredLanguage: supportedLanguageSchema.optional(),
  preferredLearningStrategy: learningStrategySchema.nullish(),
});
export type LearnerProfileUpsertInput = z.infer<
  typeof learnerProfileUpsertSchema
>;

// ── concept mastery ─────────────────────────────────────────────────────────
export const conceptMasteryUpsertSchema = z.object({
  userId: uuidSchema,
  conceptId: uuidSchema,
  masteryScore: unitScoreSchema.optional(),
  confidenceScore: unitScoreSchema.optional(),
  attemptCount: nonNegativeIntSchema.optional(),
  correctCount: nonNegativeIntSchema.optional(),
  incorrectCount: nonNegativeIntSchema.optional(),
  misconceptionCount: nonNegativeIntSchema.optional(),
  lastAttemptAt: isoDateTimeSchema.nullish(),
  lastCorrectAt: isoDateTimeSchema.nullish(),
  preferredStrategy: learningStrategySchema.nullish(),
  status: masteryStatusSchema.optional(),
  evidenceSummary: z.string().max(4000).nullish(),
});
export type ConceptMasteryUpsertInput = z.infer<
  typeof conceptMasteryUpsertSchema
>;

// ── interactions ────────────────────────────────────────────────────────────
export const recordInteractionSchema = z.object({
  sessionId: uuidSchema,
  userId: uuidSchema,
  conceptId: uuidSchema.nullish(),
  role: interactionRoleSchema,
  interactionType: interactionTypeSchema,
  content: z.string().max(20_000).default(""),
  metadata: metadataSchema.optional(),
});
export type RecordInteractionInput = z.infer<typeof recordInteractionSchema>;

// ── misconceptions ──────────────────────────────────────────────────────────
export const recordMisconceptionSchema = z.object({
  userId: uuidSchema,
  conceptId: uuidSchema,
  sessionId: uuidSchema.nullish(),
  interactionId: uuidSchema.nullish(),
  category: z.string().min(1).max(120),
  description: z.string().min(1).max(4000),
  severity: misconceptionSeveritySchema.default("MEDIUM"),
  confidence: unitScoreSchema.default(0.5),
  evidence: z.array(z.unknown()).max(200).optional(),
  metadata: metadataSchema.optional(),
});
export type RecordMisconceptionInput = z.infer<
  typeof recordMisconceptionSchema
>;

export const updateMisconceptionStatusSchema = z.object({
  id: uuidSchema,
  status: misconceptionStatusSchema,
});

// ── sessions ────────────────────────────────────────────────────────────────
export const createSessionSchema = z.object({
  userId: uuidSchema,
  title: z.string().max(300).nullish(),
  topic: z.string().max(300).nullish(),
  language: supportedLanguageSchema.default("en"),
  goal: z.string().max(2000).nullish(),
  status: sessionStatusSchema.default("PLANNED"),
  currentConceptId: uuidSchema.nullish(),
});
export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export const updateSessionSchema = z.object({
  id: uuidSchema,
  title: z.string().max(300).nullish(),
  topic: z.string().max(300).nullish(),
  goal: z.string().max(2000).nullish(),
  status: sessionStatusSchema.optional(),
  currentConceptId: uuidSchema.nullish(),
  startedAt: isoDateTimeSchema.nullish(),
  endedAt: isoDateTimeSchema.nullish(),
});
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;

// ── concepts ────────────────────────────────────────────────────────────────
export const createConceptSchema = z.object({
  userId: uuidSchema,
  documentId: uuidSchema.nullish(),
  name: z.string().min(1).max(200),
  description: z.string().max(4000).nullish(),
  subject: z.string().max(200).nullish(),
  metadata: metadataSchema.optional(),
});
export type CreateConceptInput = z.infer<typeof createConceptSchema>;

export const createConceptRelationshipSchema = z
  .object({
    sourceConceptId: uuidSchema,
    targetConceptId: uuidSchema,
    relationshipType: conceptRelationshipTypeSchema,
    strength: unitScoreSchema.default(1),
    metadata: metadataSchema.optional(),
  })
  .refine((v) => v.sourceConceptId !== v.targetConceptId, {
    message: "A concept cannot relate to itself.",
    path: ["targetConceptId"],
  });
export type CreateConceptRelationshipInput = z.infer<
  typeof createConceptRelationshipSchema
>;

// ── assessments ─────────────────────────────────────────────────────────────
export const createAssessmentSchema = z.object({
  userId: uuidSchema,
  sessionId: uuidSchema.nullish(),
  title: z.string().max(300).nullish(),
  topic: z.string().max(300).nullish(),
  assessmentType: assessmentTypeSchema.default("FORMATIVE"),
  status: assessmentStatusSchema.default("PLANNED"),
});
export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;

export const addAssessmentQuestionSchema = z.object({
  assessmentId: uuidSchema,
  conceptId: uuidSchema.nullish(),
  questionText: z.string().min(1).max(8000),
  questionType: questionTypeSchema.default("SHORT_ANSWER"),
  difficulty: difficultySchema.default(3),
  expectedAnswer: z.string().max(8000).nullish(),
  metadata: metadataSchema.optional(),
  position: nonNegativeIntSchema.default(0),
});
export type AddAssessmentQuestionInput = z.infer<
  typeof addAssessmentQuestionSchema
>;

export const recordAssessmentAnswerSchema = z.object({
  questionId: uuidSchema,
  userId: uuidSchema,
  answerText: z.string().max(20_000).default(""),
  isCorrect: z.boolean().nullish(),
  score: unitScoreSchema.nullish(),
  evaluation: metadataSchema.optional(),
});
export type RecordAssessmentAnswerInput = z.infer<
  typeof recordAssessmentAnswerSchema
>;

// ── documents + chunks (RAG) ────────────────────────────────────────────────
export const createDocumentSchema = z.object({
  userId: uuidSchema,
  title: z.string().min(1).max(300),
  fileName: z.string().min(1).max(300),
  fileType: z.string().min(1).max(120),
  fileSize: z.number().int().min(0).nullish(),
  storagePath: z.string().max(1024).nullish(),
  status: documentStatusSchema.default("PROCESSING"),
  metadata: metadataSchema.optional(),
});
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;

export const updateDocumentStatusSchema = z.object({
  documentId: uuidSchema,
  status: documentStatusSchema,
  metadata: metadataSchema.optional(),
});
export type UpdateDocumentStatusInput = z.infer<
  typeof updateDocumentStatusSchema
>;

/** One chunk to persist. `embedding` length is checked against the model dim. */
export const documentChunkInsertSchema = z.object({
  documentId: uuidSchema,
  userId: uuidSchema,
  content: z.string().min(1).max(40_000),
  chunkIndex: nonNegativeIntSchema,
  pageNumber: z.number().int().min(0).nullish(),
  sectionTitle: z.string().max(500).nullish(),
  metadata: metadataSchema.optional(),
  embedding: z.array(z.number()).min(1),
});
export type DocumentChunkInsertInput = z.infer<
  typeof documentChunkInsertSchema
>;

export const matchChunksSchema = z.object({
  queryEmbedding: z.array(z.number()).min(1),
  matchCount: z.number().int().min(1).max(50).default(8),
  similarityThreshold: unitScoreSchema.default(0),
  documentId: uuidSchema.nullish(),
});
export type MatchChunksInput = z.infer<typeof matchChunksSchema>;
