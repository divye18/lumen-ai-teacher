import { z } from "zod";

import { questionKindSchema } from "@/lib/db/enums";

/**
 * STRUCTURED ASSESSMENT CONTRACTS.
 *
 * Declarative question shapes graded by pure deterministic code (no LLM, no
 * fuzzy matching). Every structured question is authored or template-generated
 * server-side and validated with `structuredQuestionSchema` before use.
 *
 * The `answer_key` (correct answer + per-distractor misconception mapping) is
 * the server-only grading key — `toClientStructured` strips it, and the DB
 * column is excluded from `ClientTeachingQuestion`.
 */

/** A plain identifier: letters, digits, dash, underscore. No paths / URLs. */
const safeId = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[a-zA-Z0-9_-]+$/, "must be a plain identifier");

/**
 * A misconception this answer would reveal. `id` is the internal taxonomy key
 * (never shown); `label` + `explanation` are the learner-facing text.
 */
export const misconceptionRefSchema = z.object({
  id: safeId,
  /** e.g. "mixing up cache and permanent storage" */
  label: z.string().min(3).max(160),
  /** One learner-safe sentence. Never chain-of-thought. */
  explanation: z.string().min(8).max(400),
});
export type MisconceptionRef = z.infer<typeof misconceptionRefSchema>;

const choiceSchema = z.object({
  id: safeId,
  text: z.string().min(1).max(400),
  /** Present on a distractor that maps to a meaningful misconception. */
  misconception: misconceptionRefSchema.optional(),
});
export type Choice = z.infer<typeof choiceSchema>;

const labelledItemSchema = z.object({
  id: safeId,
  text: z.string().min(1).max(400),
});

// ── per-format grading data (server-side, holds the answer) ────────────────

const mcqDataSchema = z
  .object({
    options: z.array(choiceSchema).min(2).max(6),
    correctId: safeId,
  })
  .refine((d) => d.options.some((o) => o.id === d.correctId), {
    message: "correctId must be one of the options",
  });

const multiSelectDataSchema = z
  .object({
    options: z.array(choiceSchema).min(3).max(8),
    correctIds: z.array(safeId).min(1).max(8),
  })
  .refine(
    (d) => {
      const ids = new Set(d.options.map((o) => o.id));
      return d.correctIds.every((id) => ids.has(id));
    },
    { message: "every correctId must be an option" },
  );

const trueFalseDataSchema = z.object({
  statement: z.string().min(3).max(600),
  answer: z.boolean(),
  /** Fires when the learner picks the wrong boolean. */
  misconception: misconceptionRefSchema.optional(),
});

const orderStepsDataSchema = z
  .object({
    items: z.array(labelledItemSchema).min(3).max(8),
    correctOrder: z.array(safeId).min(3).max(8),
  })
  .refine(
    (d) => {
      const ids = new Set(d.items.map((i) => i.id));
      return (
        d.correctOrder.length === d.items.length &&
        d.correctOrder.every((id) => ids.has(id)) &&
        new Set(d.correctOrder).size === d.correctOrder.length
      );
    },
    { message: "correctOrder must be a permutation of the item ids" },
  );

const classifyItemSchema = labelledItemSchema.extend({
  correctBucketId: safeId,
  /** Fires when this item is placed in any wrong bucket. */
  misconception: misconceptionRefSchema.optional(),
});

const classifyDataSchema = z
  .object({
    buckets: z.array(labelledItemSchema).min(2).max(4),
    items: z.array(classifyItemSchema).min(3).max(10),
  })
  .refine(
    (d) => {
      const bucketIds = new Set(d.buckets.map((b) => b.id));
      return d.items.every((i) => bucketIds.has(i.correctBucketId));
    },
    { message: "every item.correctBucketId must be a bucket" },
  );

const matchPairSchema = z.object({ leftId: safeId, rightId: safeId });

const matchRelationshipDataSchema = z
  .object({
    left: z.array(labelledItemSchema).min(2).max(6),
    right: z.array(labelledItemSchema).min(2).max(6),
    correctPairs: z.array(matchPairSchema).min(2).max(6),
    /** left item id -> misconception revealed by matching it wrongly. */
    misconceptionByLeft: z.record(safeId, misconceptionRefSchema).optional(),
  })
  .refine(
    (d) => {
      const l = new Set(d.left.map((x) => x.id));
      const r = new Set(d.right.map((x) => x.id));
      const leftCovered = new Set(d.correctPairs.map((p) => p.leftId));
      return (
        d.correctPairs.every((p) => l.has(p.leftId) && r.has(p.rightId)) &&
        leftCovered.size === d.left.length
      );
    },
    { message: "correctPairs must pair every left item to a valid right item" },
  );

// ── the discriminated union ───────────────────────────────────────────────

const baseFields = {
  kind: questionKindSchema,
  difficulty: z.number().int().min(1).max(5),
  prompt: z.string().min(8).max(1200),
  /** Optional one-line framing shown above the options. */
  context: z.string().max(600).optional(),
};

export const structuredQuestionSchema = z.discriminatedUnion("format", [
  z.object({ format: z.literal("MCQ"), ...baseFields, data: mcqDataSchema }),
  z.object({
    format: z.literal("MULTI_SELECT"),
    ...baseFields,
    data: multiSelectDataSchema,
  }),
  z.object({
    format: z.literal("TRUE_FALSE"),
    ...baseFields,
    data: trueFalseDataSchema,
  }),
  z.object({
    format: z.literal("ORDER_STEPS"),
    ...baseFields,
    data: orderStepsDataSchema,
  }),
  z.object({
    format: z.literal("CLASSIFY"),
    ...baseFields,
    data: classifyDataSchema,
  }),
  z.object({
    format: z.literal("MATCH_RELATIONSHIP"),
    ...baseFields,
    data: matchRelationshipDataSchema,
  }),
]);
export type StructuredQuestion = z.infer<typeof structuredQuestionSchema>;
export type StructuredFormat = StructuredQuestion["format"];

// ── learner answer (client → server) ──────────────────────────────────────

export const structuredAnswerSchema = z.discriminatedUnion("format", [
  z.object({ format: z.literal("MCQ"), selectedId: safeId }),
  z.object({
    format: z.literal("MULTI_SELECT"),
    selectedIds: z.array(safeId).max(8),
  }),
  z.object({ format: z.literal("TRUE_FALSE"), value: z.boolean() }),
  z.object({ format: z.literal("ORDER_STEPS"), order: z.array(safeId).max(8) }),
  z.object({
    format: z.literal("CLASSIFY"),
    assignments: z.record(safeId, safeId),
  }),
  z.object({
    format: z.literal("MATCH_RELATIONSHIP"),
    pairs: z.array(matchPairSchema).max(6),
  }),
]);
export type StructuredAnswer = z.infer<typeof structuredAnswerSchema>;

// ── client-safe projection (no answer, no misconception mapping) ───────────

export interface ClientStructuredQuestion {
  format: StructuredFormat;
  prompt: string;
  context?: string;
  mcq?: { options: { id: string; text: string }[] };
  multiSelect?: {
    options: { id: string; text: string }[];
    minSelections: number;
  };
  trueFalse?: { statement: string };
  orderSteps?: { items: { id: string; text: string }[] };
  classify?: {
    buckets: { id: string; label: string }[];
    items: { id: string; text: string }[];
  };
  matchRelationship?: {
    left: { id: string; text: string }[];
    right: { id: string; text: string }[];
  };
}

/** Deterministic shuffle by a seed string (Fisher–Yates with a hashed PRNG). */
function seededShuffle<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rand = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Strip the grading key. `seed` (the question id) drives option ordering. */
export function toClientStructured(
  q: StructuredQuestion,
  seed: string,
): ClientStructuredQuestion {
  const base = { format: q.format, prompt: q.prompt, context: q.context };
  switch (q.format) {
    case "MCQ":
      return {
        ...base,
        mcq: {
          options: seededShuffle(q.data.options, seed).map((o) => ({
            id: o.id,
            text: o.text,
          })),
        },
      };
    case "MULTI_SELECT":
      return {
        ...base,
        multiSelect: {
          options: seededShuffle(q.data.options, seed).map((o) => ({
            id: o.id,
            text: o.text,
          })),
          minSelections: q.data.correctIds.length,
        },
      };
    case "TRUE_FALSE":
      return { ...base, trueFalse: { statement: q.data.statement } };
    case "ORDER_STEPS":
      return {
        ...base,
        orderSteps: {
          items: seededShuffle(q.data.items, seed).map((i) => ({
            id: i.id,
            text: i.text,
          })),
        },
      };
    case "CLASSIFY":
      return {
        ...base,
        classify: {
          buckets: q.data.buckets.map((b) => ({ id: b.id, label: b.text })),
          items: seededShuffle(q.data.items, seed).map((i) => ({
            id: i.id,
            text: i.text,
          })),
        },
      };
    case "MATCH_RELATIONSHIP":
      return {
        ...base,
        matchRelationship: {
          left: q.data.left.map((i) => ({ id: i.id, text: i.text })),
          right: seededShuffle(q.data.right, seed).map((i) => ({
            id: i.id,
            text: i.text,
          })),
        },
      };
  }
}

/** Reconstruct a server `StructuredQuestion` from a persisted row. */
export function structuredQuestionFromRow(row: {
  question_format: string;
  question_kind: string;
  difficulty: number;
  prompt: string;
  answer_key: unknown;
  metadata: unknown;
}): StructuredQuestion | null {
  const meta = (row.metadata ?? {}) as { context?: unknown };
  const candidate = {
    format: row.question_format,
    kind: row.question_kind,
    difficulty: row.difficulty,
    prompt: row.prompt,
    ...(typeof meta.context === "string" ? { context: meta.context } : {}),
    data: row.answer_key,
  };
  const parsed = structuredQuestionSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
