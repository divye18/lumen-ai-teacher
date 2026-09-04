import { z } from "zod";

import { uuidSchema } from "@/lib/db/schemas";
import { teachingStyleSchema } from "@/lib/db/enums";
import { structuredAnswerSchema } from "@/lib/assessment/structured/contracts";
import { DIAGNOSTIC_MAX_QUESTIONS } from "@/lib/assessment/diagnostic";

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

export const submitDiagnosticRequestSchema = z.object({
  sessionId: uuidSchema,
  answers: z
    .array(
      z.object({
        conceptKey: z.string().min(1).max(80),
        answer: structuredAnswerSchema,
      }),
    )
    .min(1)
    .max(DIAGNOSTIC_MAX_QUESTIONS),
});
export type SubmitDiagnosticRequest = z.infer<
  typeof submitDiagnosticRequestSchema
>;
