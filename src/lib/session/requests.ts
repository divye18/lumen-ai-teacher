import { z } from "zod";

import { uuidSchema } from "@/lib/db/schemas";
import { teachingStyleSchema } from "@/lib/db/enums";

/** Validated bodies for the teaching-loop API routes. `userId` always comes from auth. */

export const createLessonRequestSchema = z.object({
  topic: z.string().trim().min(3).max(200),
  documentId: uuidSchema.nullish(),
  timeBudgetMinutes: z.number().int().min(1).max(600).nullish(),
  teachingStyle: teachingStyleSchema.nullish(),
});
export type CreateLessonRequest = z.infer<typeof createLessonRequestSchema>;

export const startSessionRequestSchema = z
  .object({
    lessonId: uuidSchema.optional(),
    sessionId: uuidSchema.optional(),
    timeBudgetMinutes: z.number().int().min(1).max(600).nullish(),
  })
  .refine((v) => Boolean(v.lessonId) !== Boolean(v.sessionId), {
    message: "provide exactly one of lessonId (start) or sessionId (resume)",
  });
export type StartSessionRequest = z.infer<typeof startSessionRequestSchema>;

export const nextStepRequestSchema = z.object({
  sessionId: uuidSchema,
});
export type NextStepRequest = z.infer<typeof nextStepRequestSchema>;

export const submitInteractionRequestSchema = z.object({
  sessionId: uuidSchema,
  questionId: uuidSchema,
  answer: z.string().trim().max(20_000),
  responseTimeMs: z.number().int().min(0).max(3_600_000).nullish(),
});
export type SubmitInteractionRequest = z.infer<
  typeof submitInteractionRequestSchema
>;
