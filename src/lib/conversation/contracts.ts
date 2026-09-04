import { z } from "zod";

import { uuidSchema } from "@/lib/db/schemas";
import type { TeachingCitation } from "@/lib/session/citations";
import type { VisualDirective } from "@/types/visuals";

/**
 * CONVERSATIONAL TEACHING CONTRACTS.
 *
 * The learner can interrupt a teaching step with a natural-language question.
 * Lumen infers the *educational intent*, answers in context, and teaching
 * continues — the lesson state machine is untouched.
 *
 * Two contracts:
 *   - `teacherReplySchema`  — what the LLM must return (validated, repaired).
 *   - `TeacherReplyView`    — the safe presentation data the client receives.
 *
 * Never expose chain-of-thought, hidden prompts, retrieval scores, or raw
 * model text.
 */

export const CONVERSATION_INTENTS = [
  "CLARIFY",
  "EXAMPLE",
  "SIMPLIFY",
  "DEEPEN",
  "WHY",
  "COMPARE",
  "CONNECT",
  "CHECK_UNDERSTANDING",
  "CHALLENGE",
  "OFF_TOPIC",
] as const;
export type ConversationIntent = (typeof CONVERSATION_INTENTS)[number];
export const conversationIntentSchema = z.enum(CONVERSATION_INTENTS);

/** How the response should be shaped — the LLM's own classification of its style. */
export const EXPLANATION_STYLES = [
  "analogy",
  "example",
  "causal",
  "comparison",
  "definition",
  "stepwise",
] as const;
export type ExplanationStyle = (typeof EXPLANATION_STYLES)[number];

/** A hint that the reply is correcting a wrong mental model. */
const misconceptionSignalSchema = z.object({
  /** Kebab-case taxonomy id — matched against existing misconceptions only. */
  category: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-zA-Z0-9_-]+$/, "must be a plain identifier"),
  /** One sentence contrasting the wrong model with the correct one. */
  contrast: z.string().min(1).max(400),
});

/** The validated LLM output. Bounded, no UI content, no reasoning. */
export const teacherReplySchema = z.object({
  intent: conversationIntentSchema,
  /** The learner-facing answer. Concise by default. */
  answer: z.string().min(1).max(1400),
  /** The single most important takeaway. */
  keyPoint: z.string().min(1).max(240),
  /** An optional one-line nudge to keep the dialogue going. */
  followUpPrompt: z.string().max(240).nullish(),
  explanationStyle: z.enum(EXPLANATION_STYLES).nullish(),
  /** Present only when the reply corrects a mental model. */
  misconceptionSignal: misconceptionSignalSchema.nullish(),
  /** The model's claim that it answered from the provided source material. */
  groundedInSource: z.boolean().default(false),
  /** A hint that the visual representation should change. */
  suggestVisual: z
    .enum(["none", "simpler", "comparison", "system"])
    .default("none"),
});
export type TeacherReply = z.infer<typeof teacherReplySchema>;

/** POST /api/teaching/conversation request. `userId` always comes from auth. */
export const conversationRequestSchema = z.object({
  sessionId: uuidSchema,
  message: z.string().trim().min(1).max(2000),
  /** Deterministic intent hint from a quick-action button (optional). */
  intentHint: conversationIntentSchema.optional(),
});
export type ConversationRequest = z.infer<typeof conversationRequestSchema>;

export interface TeacherReplyView {
  intent: ConversationIntent;
  /** Learner-facing answer text. */
  answer: string;
  keyPoint: string;
  followUpPrompt: string | null;
  /** How the answer was produced — honest about AI availability. */
  source: "ai" | "deterministic";
  /**
   * True only when retrieval returned passages AND they were used to answer.
   * When false, `citations` is always empty.
   */
  grounded: boolean;
  citations: TeachingCitation[];
  /** An adapted representation to show, when the answer changed the angle. */
  visual: VisualDirective | null;
  visualIntent: string | null;
  visualRationale: string | null;
  /** Set when the reply gently corrected a tracked misconception. */
  misconceptionNoted: { label: string } | null;
}
