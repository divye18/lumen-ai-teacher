import { z } from "zod";

import { uuidSchema } from "@/lib/db/schemas";

/** Validated body for `POST /api/retrieval`. `userId` is derived from auth, not here. */
export const retrievalRequestSchema = z.object({
  query: z.string().trim().min(1).max(2000),
  documentId: uuidSchema.nullish(),
  topK: z.number().int().min(1).max(50).default(8),
  similarityThreshold: z.number().min(0).max(1).default(0),
});

export type RetrievalRequest = z.infer<typeof retrievalRequestSchema>;
